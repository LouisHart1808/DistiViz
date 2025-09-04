import { downloadCSV, applyFilters, bindDropInput, setUploadStatus, formatBytes, DataStore, renderCacheControls } from './utils.js';
import { renderGroupedTables, renderBarChart } from './visuals.js';

async function loadXLSX() {
  const mod = await import('https://esm.sh/xlsx@0.18.5');
  return mod.default?.utils ? mod.default : mod;
}

export const APP_CANON_KEYS = [
  'Region',
  'Distributor',
  'ID',
  'System/Application Level III',
  'System/Application Level II',
  'Application List Light Application',
  'Lead DIV',
  'Confidence'
];

const HEADER_ALIASES_MAP = (() => {
  const norm = s => s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ');
  const m = new Map();
  const add = (canon, aliases=[]) => { m.set(norm(canon), canon); aliases.forEach(a => m.set(norm(a), canon)); };
  add('Region', ['region']);
  add('Distributor', ['distributor']);
  add('ID', ['id','Id','i d']);
  add('System/Application Level III', ['system/application level iii','system application level iii','level iii','sys/app lvl 3','system level 3']);
  add('System/Application Level II', ['system/application level ii','system application level ii','level ii','sys/app lvl 2','system level 2']);
  add('Application List Light Application', ['application list light application','application list','light application','app list light']);
  add('Lead DIV', ['lead div','lead division','lead dept','lead department']);
  add('Confidence', ['confidence','conf','confidence level']);
  return { map: m, norm };
})();

function canonicalizeHeader(h){
  if (APP_CANON_KEYS.includes(h)) return h;
  const { map, norm } = HEADER_ALIASES_MAP;
  return map.get(norm(h)) || null;
}

function normalizeRows(rawRows){
  if (!Array.isArray(rawRows)) return [];
  const observed = new Set();
  rawRows.forEach(r => Object.keys(r).forEach(k => observed.add(k)));
  const headerMap = new Map();
  for (const h of observed){
    const canon = canonicalizeHeader(h);
    if (canon) headerMap.set(h, canon);
  }
  const rows = [];
  for (const r of rawRows){
    const out = {}; APP_CANON_KEYS.forEach(k => out[k] = '');
    for (const [h,v] of Object.entries(r)){
      const canon = headerMap.get(h); if (!canon) continue;
      out[canon] = typeof v === 'string' ? v.trim() : (v ?? '');
    }
    const allEmpty = APP_CANON_KEYS.every(k => out[k] === '' || out[k] == null);
    if (!allEmpty) rows.push(out);
  }
  return rows;
}

// CSV builder (stable column order)
export function appsRowsToCSV(rows){
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const header = APP_CANON_KEYS.map(esc).join(',');
  const body = rows.map(r => APP_CANON_KEYS.map(k => esc(r[k])).join(',')).join('\n');
  return [header, body].filter(Boolean).join('\n');
}

function _normSheetName(s){
  return String(s).toLowerCase().replace(/\s+/g,' ').trim();
}

function findAppsSheet(wb){
  // Target: 2-Confidence Level Focus Appl.
  const target = _normSheetName('2-Confidence Level Focus Appl.');
  // Exact norm match first
  for (const name of wb.SheetNames){
    if (_normSheetName(name) === target) return wb.Sheets[name];
  }
  // Fuzzy fallback: name begins with '2' and includes 'confidence' & 'focus'
  for (const name of wb.SheetNames){
    const n = _normSheetName(name);
    if (/^2/.test(n) && n.includes('confidence') && (n.includes('focus') || n.includes('level'))) {
      return wb.Sheets[name];
    }
  }
  return null;
}

/**
 * Try to detect the header row in a matrix (rows of arrays).
 * Returns { rowIndex, map } where map: colIndex -> canonicalKey
 */
function detectHeaderRow(matrix){
  const maxScan = Math.min(matrix.length, 50); // scan first 50 rows
  // Build reverse alias lookup
  const aliasMap = HEADER_ALIASES_MAP.map;
  const norm = HEADER_ALIASES_MAP.norm;

  const scoreRow = (cells) => {
    const map = new Map();
    let hits = 0;
    for (let c = 0; c < cells.length; c++){
      const cell = cells[c];
      if (cell == null || cell === '') continue;
      const canon = APP_CANON_KEYS.includes(cell) ? cell : aliasMap.get(norm(String(cell)));
      if (canon && !Array.from(map.values()).includes(canon)) { // don't double-map same canon
        map.set(c, canon); hits++;
      }
    }
    return { hits, map };
  };

  let best = { idx: -1, hits: 0, map: new Map() };
  for (let r = 0; r < maxScan; r++){
    const { hits, map } = scoreRow(matrix[r] || []);
    if (hits > best.hits){ best = { idx: r, hits, map }; }
    if (hits >= 6) break; // early exit if strong match
  }
  if (best.hits === 0) return null;
  return { rowIndex: best.idx, map: best.map };
}

export async function parseAppsExcel(file){
  if (!file) throw new Error('No file provided');
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  // Locate sheet robustly
  const ws = findAppsSheet(wb);
  if (!ws){
    const available = wb.SheetNames.join(', ');
    throw new Error(`Sheet "2-Confidence Level Focus Appl." not found. Available sheets: ${available}`);
  }

  // Read as a matrix first to detect header row
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headerInfo = detectHeaderRow(matrix);
  if (!headerInfo){
    throw new Error('Could not detect header row. Please ensure the sheet has the expected columns.');
  }
  const { rowIndex, map } = headerInfo;

  const headerRow = matrix[rowIndex] || [];
  const regionRow = rowIndex > 0 ? (matrix[rowIndex - 1] || []) : [];
  // Forward-fill region headers across blocks (handles merged-title style where only the first col has the region name)
  const regionF = new Array(headerRow.length).fill('');
  let lastRegion = '';
  for (let c = 0; c < headerRow.length; c++){
    const v = c < regionRow.length ? regionRow[c] : '';
    const vs = (v == null || String(v).toLowerCase() === 'nan') ? '' : String(v).trim();
    if (vs !== '') lastRegion = vs;
    regionF[c] = lastRegion || 'N/A';
  }

  const distributorCols = [];
  for (let c = 0; c < headerRow.length; c++){
    const isBase = map.has(c);
    const hcell = headerRow[c];
    if (!isBase && typeof hcell === 'string' && hcell.trim() !== ''){
      const distributorName = String(hcell).trim();
      const regionName = regionF[c] || 'N/A';
      distributorCols.push({ col: c, distributorName, regionName });
    }
  }

  // Build rows by UNPIVOTING distributor columns to match DistiApps.csv
  const idxForCanon = (canon) => {
    for (const [ci, ck] of map.entries()) if (ck === canon) return ci;
    return null;
  };
  const baseIdx = {
    ID: idxForCanon('ID'),
    L3: idxForCanon('System/Application Level III'),
    L2: idxForCanon('System/Application Level II'),
    APP: idxForCanon('Application List Light Application'),
    DIV: idxForCanon('Lead DIV')
  };

  const rows = [];
  const toNum = (v) => {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return Number.isFinite(v) ? v : '';
    const s = String(v).trim();
    if (s === '') return '';
    const s2 = s.replace(/%/g, '');
    const n = Number(s2);
    return Number.isFinite(n) ? n : '';
  };

  for (let r = rowIndex + 1; r < matrix.length; r++){
    const arr = matrix[r] || [];

    // Base values for this application row
    const idVal  = baseIdx.ID  != null ? arr[baseIdx.ID]  : '';
    const l3Val  = baseIdx.L3  != null ? arr[baseIdx.L3]  : '';
    const l2Val  = baseIdx.L2  != null ? arr[baseIdx.L2]  : '';
    const appVal = baseIdx.APP != null ? arr[baseIdx.APP] : '';
    const divVal = baseIdx.DIV != null ? arr[baseIdx.DIV] : '';

    // Skip if the base row is empty
    const baseAllEmpty = [idVal, l3Val, l2Val, appVal, divVal].every(v => v == null || String(v).trim() === '');
    if (baseAllEmpty) continue;

    // Emit one record per distributor column that has a value
    for (const dc of distributorCols){
      const cell = arr[dc.col];
      if (cell == null || String(cell).trim() === '') continue;
      const out = {
        'Region': dc.regionName,
        'Distributor': dc.distributorName,
        'ID': idVal != null ? String(idVal).trim() : '',
        'System/Application Level III': l3Val != null ? String(l3Val).trim() : '',
        'System/Application Level II':  l2Val != null ? String(l2Val).trim() : '',
        'Application List Light Application': appVal != null ? String(appVal).trim() : '',
        'Lead DIV': divVal != null ? String(divVal).trim() : '',
        'Confidence': toNum(cell)
      };
      rows.push(out);
    }
  }

  // Post-process types
  for (const r of rows){
    if (r.Confidence !== '' && !Number.isNaN(Number(r.Confidence))) r.Confidence = Number(r.Confidence);
    if (r.ID !== '' && r.ID != null) r.ID = String(r.ID).trim();
  }

  const csv = appsRowsToCSV(rows);
  return { rows, csv, meta: { rowCount: rows.length, headerRow: rowIndex, columns: [...APP_CANON_KEYS] } };
}

export function validateAppsRows(rows){
  const missing = new Set(APP_CANON_KEYS);
  if (rows.length) Object.keys(rows[0]).forEach(k => missing.delete(k));
  return { ok: missing.size === 0, missingColumns: [...missing] };
}

export async function loadAppModule() {
  // No CSV preload; wait for user Excel upload
  let data = [];

  // Define columns to export (must exist before first render)
  const columns = [
    'ID', 'System/Application Level III', 'System/Application Level II',
    'Application List Light Application', 'Lead DIV', 'Confidence'
  ];

  // Grab DOM elements
  const regionSelect = d3.select('#regionSelect');
  const level3Select = d3.select('#level3Select');
  const scoreSlider = d3.select('#scoreSlider');

  const dropArea = document.querySelector('.upload-area');
  const excelInputEl = document.getElementById('appsExcelInput');
  const statusEl = document.getElementById('appsUploadStatus');

  // Cache status/controls placeholder just under the status line (idempotent)
  let cacheUIEl = document.getElementById('appsCacheUI');
  if (!cacheUIEl) {
    cacheUIEl = document.createElement('div');
    cacheUIEl.id = 'appsCacheUI';
    statusEl?.parentNode?.insertBefore(cacheUIEl, statusEl.nextSibling);
  } else {
    cacheUIEl.innerHTML = '';
  }

  // Try to rehydrate from IndexedDB-backed DataStore
  try {
    const cached = await DataStore.get('apps');
    if (cached && Array.isArray(cached.rows) && cached.rows.length) {
      data = cached.rows;
      rebuildFiltersAndRender();
      setUploadStatus(statusEl, { state: 'ok', message: `Restored ${data.length.toLocaleString()} rows from previous session.` });
    } else {
      setUploadStatus(statusEl, { state: 'idle', message: 'Please upload your Excel workbook to begin.' });
    }
  } catch (e) {
    console.warn('DataStore get failed; falling back to idle state', e);
    setUploadStatus(statusEl, { state: 'idle', message: 'Please upload your Excel workbook to begin.' });
  }

  // Render cache controls strip
  await renderCacheControls({
    container: cacheUIEl,
    storeKey: 'apps',
    onClear: () => {
      data = [];
      renderEmptyState();
      setUploadStatus(statusEl, { state: 'idle', message: 'Cache cleared. Upload a workbook to proceed.' });
      // refresh strip
      renderCacheControls({ container: cacheUIEl, storeKey: 'apps', onClear: () => {} });
    }
  });

  function setFiltersEnabled(enabled){
    regionSelect.property('disabled', !enabled);
    level3Select.property('disabled', !enabled);
    scoreSlider.property('disabled', !enabled);
  }

  function renderEmptyState(){
    d3.select('#summary').html('<h2>Summary</h2><p>No data loaded yet. Upload an Excel workbook to render visuals.</p>');
    d3.select('#barChart').html('');
    d3.select('#results').html('');
  }

  bindDropInput({
    dropArea,
    fileInput: excelInputEl,
    onFile: async (file) => {
      if (!file) return;
      try {
        setFiltersEnabled(false);
        setUploadStatus(statusEl, { state: 'loading', filename: file.name, message: `Reading ${formatBytes(file.size)}…` });
        const { rows } = await parseAppsExcel(file);
        const { ok, missingColumns } = validateAppsRows(rows);
        if (!ok) console.warn('Missing expected columns from Excel:', missingColumns);
        data = rows;
        try { await DataStore.set('apps', rows, { source: 'appsExcel' }); } catch (e) { console.warn('Failed to persist apps rows', e); }
        await renderCacheControls({ container: cacheUIEl, storeKey: 'apps', onClear: () => {} });
        rebuildFiltersAndRender();
        setUploadStatus(statusEl, { state: 'ok', filename: file.name, message: `Parsed ${rows.length} rows.` });
        setFiltersEnabled(true);
      } catch (err) {
        console.error('Failed to parse Excel:', err);
        setUploadStatus(statusEl, { state: 'err', filename: file?.name, message: err.message || String(err) });
        setFiltersEnabled(true);
      }
    }
  });


  function populateDropdown(selectElement, options, defaultValue = 'All') {
    selectElement.selectAll('option').remove();
    selectElement.selectAll('option')
      .data([defaultValue, ...options])
      .enter()
      .append('option')
      .text(d => d);
    selectElement.property('value', defaultValue);
  }

  function rebuildFiltersAndRender(){
    const regions = Array.from(new Set(data.map(d => d.Region).filter(Boolean))).sort();
    populateDropdown(regionSelect, regions);

    const level3s = Array.from(new Set(data.map(d => d['System/Application Level III']).filter(Boolean))).sort();
    populateDropdown(level3Select, level3s);

    update();
  }

  // Initial population – only show empty state if nothing was restored/loaded
  if (!data || data.length === 0) {
    renderEmptyState();
  }

  function update() {
    if (!data || data.length === 0) { renderEmptyState(); return; }
    const region = regionSelect.property('value');
    const level3 = level3Select.property('value');
    const minScore = +scoreSlider.property('value');

    const filtered = applyFilters(data, {}, d => {
      return (region === 'All' || d.Region === region) &&
             +d.Confidence >= minScore &&
             (level3 === 'All' || d['System/Application Level III'] === level3);
    });

    const grouped = d3.group(filtered, d => d.Distributor);

    d3.select('#summary').html(`
      <h2>Summary Metrics</h2>
      <p>Distributors Displayed: ${grouped.size}</p>
      <p>Applications Matching: ${filtered.length}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="downloadAllFilteredCsv">Download Filtered CSV</button>
        <button id="downloadParsedCsv">Download Parsed CSV</button>
      </div>
    `);

    d3.select('#downloadAllFilteredCsv').on('click', () => {
      downloadCSV(filtered, `Filtered_Data_${region || 'All'}.csv`, columns);
    });

    d3.select('#downloadParsedCsv').on('click', () => {
      // Export the whole in-memory dataset in canonical order
      const csv = appsRowsToCSV(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Parsed_Upload.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Render bar chart
    const counts = Array.from(grouped, ([Distributor, values]) => ({ Distributor, Count: values.length }));
    const barChartContainer = d3.select('#barChart').html('');
    const barChartCard = barChartContainer.append('div').attr('class', 'map-card');
    barChartCard.append('h3').attr('class', 'map-title').text('Applications by Distributor');
    barChartCard.append('div').attr('id', 'barChartInner');

    renderBarChart({
      containerId: 'barChartInner',
      data: counts,
      xKey: 'Distributor',
      yKey: 'Count',
      tooltipLabel: 'Applications'
    });

    // Render data tables
    const container = d3.select('#results').html('<h2>Filtered Application Tables by Distributor</h2>');
    renderGroupedTables({
      container,
      groupedData: grouped,
      columns,
      distributor: region,
      defaultCollapsed: true,
      colorByConfidence: true
    });
  }

  // Bind filters
  scoreSlider.on('input', function () { d3.select('#scoreValue').text(this.value); update(); });
  regionSelect.on('change', update);
  level3Select.on('change', update);
}
