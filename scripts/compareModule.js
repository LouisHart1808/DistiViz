import { renderGroupedTables } from './visuals.js';

let U = {};
(async () => {
  try {
    U = await import('./utils.js');
  } catch (e) {
    U = {
      groupBy: (rows, keyFn) => rows.reduce((acc, r) => {
        const k = keyFn(r);
        (acc[k] ||= []).push(r);
        return acc;
      }, {}),
      fmt: (n) => new Intl.NumberFormat().format(n ?? 0),
      dedupeByKeys: (rows, keys) => {
        const seen = new Set();
        const ks = Array.isArray(keys) ? keys : [keys];
        return rows.filter(r => {
          const sig = ks.map(k => String(r[k] ?? '')).join('§');
          if (seen.has(sig)) return false;
          seen.add(sig);
          return true;
        });
      },
      emit: (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail })),
    };
  }
})();

// ---------- DOM refs ----------
const els = {
  section: document.getElementById('compareSection'),
  nav: document.getElementById('nav-compare'),
  distributor: document.getElementById('compareDistributorSelect'),
  segmentPicker: document.getElementById('compareSegmentPicker'),
  runBtn: document.getElementById('compareRunBtn'),
  kpi: document.getElementById('compareSummaryContent'),
  topAreas: document.getElementById('compareTopAreasChart'),
  appsTable: document.getElementById('compareAppsTable'),
  dregsTable: document.getElementById('compareDregsTable'),
  loading: document.getElementById('compareLoading'),
};
const SECTION_PRESENT = !!els.section;

// ---------- State ----------
let appsData = null;
let dregsData = null;

const STATE = {
  ready: false,
  distributorOptions: [],
  segmentOptions: [],
};

// ---------- Utilities ----------
const FIELD = {
  distributor: ['Distributor', 'Main Distributor', 'Distributor Name', 'Partner', 'Channel Partner'],
  // Map DREG Segment ↔ Apps System/Application Level III
  segment: ['Segment', 'System/Application Level III', 'Application Segment', 'Application', 'Market Segment'],
  regId: ['Registration ID', 'Reg ID', 'RegID', 'DREG ID', 'DREGID', 'DREG_Id'],
  appId: ['Application ID', 'App ID', 'AppID', 'Opportunity ID'],
};

const FIELD_APPS = {
  segL3: ['System/Application Level III','Level III','Application Segment','Segment'],
  marketSeg: ['System/Application Level II','Level II','Market Segment'],
  marketApp: ['Application List Light Application','Application List','Market Application'],
  region: ['Region'],
  leadDiv: ['Lead DIV','Lead Division']
};

const FIELD_DREG = {
  seg: ['Segment'],
  marketSeg: ['Market Segment','System/Application Level II','Level II'],
  marketApp: ['Market Application','Application List Light Application','Application'],
  resale: ['Resale Customer','Customer'],
  subresp: ['Subregion Resp','Subregion Responsible','Subregion Responsible Name'],
  countryResale: ['Country Resale Customer','Country']
};

const getFirstField = (row, candidates) => candidates.find(k => k in row);
const getVal = (row, candidates) => {
  const k = getFirstField(row, candidates) || candidates[0];
  return row[k];
};

function valOf(row, list) {
  const k = getFirstField(row, list);
  if (!k) return '';
  const v = row[k];
  return v == null ? '' : v;
}

const isDummyRow = (row) => {
  const keysToScan = [...FIELD.regId, ...FIELD.appId, ...FIELD.distributor];
  return keysToScan.some(k => typeof row[k] === 'string' && /dummy/i.test(row[k]));
};

function collectValues(rows, candidates) {
  const map = new Map();
  rows.forEach(r => {
    const v = getVal(r, candidates);
    if (v == null) return;
    const s = String(v).trim();
    if (!s) return;
    const low = s.toLowerCase();
    if (!map.has(low)) map.set(low, s);
  });
  return map;
}

// ---------- Data sources & hydration ----------
function tryHydrateFromGlobals() {
  const w = /** @type {any} */ (window);
  appsData ||= w.__appsData || w.appsData || (w.DistiVizCache && w.DistiVizCache.appsData) || null;
  dregsData ||= w.__dregsData || w.dregsData || (w.DistiVizCache && w.DistiVizCache.dregsData) || null;
}

function listenForModuleEvents() {
  document.addEventListener('apps:data-ready', (e) => {
    appsData = (e.detail && e.detail.rows) || e.detail || e;
    maybeEnable();
  });
  document.addEventListener('dregs:data-ready', (e) => {
    dregsData = (e.detail && e.detail.rows) || e.detail || e;
    maybeEnable();
  });
}

function computeIntersectedOptions() {
  const aRows = (appsData || []).filter(r => !isDummyRow(r));
  const dRows = (dregsData || []).filter(r => !isDummyRow(r));

  const aDistMap = collectValues(aRows, FIELD.distributor);
  const dDistMap = collectValues(dRows, FIELD.distributor);
  const dist = [];
  for (const [low, disp] of aDistMap) if (dDistMap.has(low)) dist.push(disp);
  dist.sort((a, b) => a.localeCompare(b));

  const aSegMap = collectValues(aRows, FIELD.segment);
  const dSegMap = collectValues(dRows, FIELD.segment);
  const seg = [];
  for (const [low, disp] of aSegMap) if (dSegMap.has(low)) seg.push(disp);
  seg.sort((a, b) => a.localeCompare(b));

  STATE.distributorOptions = dist;
  STATE.segmentOptions = seg;
}

function maybeEnable() {
  tryHydrateFromGlobals();
  if (appsData && dregsData && !STATE.ready) {
    STATE.ready = true;
    computeIntersectedOptions();
    populateDropdowns();
  }
}

function populateDropdowns() {
  const { distributor } = els;
  distributor.innerHTML = '<option value="">-- Select Distributor --</option>' +
    STATE.distributorOptions.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  distributor.disabled = STATE.distributorOptions.length === 0;

  renderSegmentPicker(STATE.segmentOptions);

  els.runBtn.disabled = !(STATE.distributorOptions.length && STATE.segmentOptions.length);
}

// ---------- Rendering ----------
function renderSegmentPicker(options) {
  const root = els.segmentPicker;
  if (!root) return;
  root.innerHTML = `
    <div class="ms-controls">
      <input type="text" class="ms-search" placeholder="Search segments..." aria-label="Search segments" />
      <div class="ms-actions">
        <button type="button" class="link-btn" data-act="all">Select all</button>
        <button type="button" class="link-btn" data-act="none">Clear</button>
      </div>
    </div>
    <div class="ms-list"></div>
    <div class="ms-footer"><span class="ms-count">0 selected</span></div>
  `;
  const listEl = root.querySelector('.ms-list');
  const searchEl = root.querySelector('.ms-search');
  const countEl = root.querySelector('.ms-count');

  const toggleBtn = document.querySelector('.ms-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      root.hidden = !root.hidden;
    });
  }

  const makeItem = (label) => {
    const id = `seg_${label.replace(/[^a-z0-9]+/gi,'_')}`;
    const div = document.createElement('label');
    div.className = 'ms-item';
    div.innerHTML = `<input type="checkbox" value="${escapeHtml(label)}" id="${id}" /> <span>${escapeHtml(label)}</span>`;
    return div;
  };

  const items = options.map(makeItem);
  items.forEach(n => listEl.appendChild(n));

  const refreshCount = () => {
    const n = root.querySelectorAll('.ms-item input:checked').length;
    countEl.textContent = `${n} selected`;
    if (toggleBtn) {
      toggleBtn.textContent = n > 0 ? `Select Segments (${n})` : 'Select Segments (All)';
    }
  };
  root.addEventListener('change', (e)=>{ if (e.target.matches('.ms-item input')) refreshCount(); });

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.toLowerCase().trim();
    items.forEach(it => {
      const text = it.textContent.toLowerCase();
      it.style.display = !q || text.includes(q) ? '' : 'none';
    });
  });

  root.querySelector('[data-act="all"]').addEventListener('click', ()=>{
    root.querySelectorAll('.ms-item input').forEach(cb => cb.checked = true);
    refreshCount();
  });
  root.querySelector('[data-act="none"]').addEventListener('click', ()=>{
    root.querySelectorAll('.ms-item input').forEach(cb => cb.checked = false);
    refreshCount();
  });

  refreshCount();
}

// Stable light color for a given string (used to match items across lists)
function colorFromString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 92%)`; // pastel
}

function renderTopAreas(appRows, dregRows) {
  const topA = pickTopField(appRows, FIELD.segment, 8);
  const topD = pickTopField(dregRows, FIELD.segment, 8);

  // Color map for union of category names
  const allNames = new Set([
    ...topA.entries.map(([n]) => String(n)),
    ...topD.entries.map(([n]) => String(n))
  ]);
  const colorMap = {};
  for (const name of allNames) colorMap[name.toLowerCase()] = colorFromString(name);

  const makeList = (label, data, listKey) => `
    <div class="toplist" data-list="${listKey}">
      <div class="toplist-title">${label} <span class="muted">by ${escapeHtml(data.key)}</span></div>
      <ol>
        ${data.entries.map(([name, n]) => {
          const key = String(name).toLowerCase();
          const color = colorMap[key] || '#eef4ff';
          return `
            <li class="top-item" data-cat="${escapeHtml(key)}">
              <span class="dot" style="background:${color}"></span>
              <span class="name">${escapeHtml(name)}</span>
              <span class="count">${U.fmt ? U.fmt(n) : n}</span>
            </li>`;
        }).join('')}
      </ol>
    </div>`;

  els.topAreas.innerHTML = `
    <div class="toplists-grid linked">
      ${makeList('Applications: Top Areas', topA, 'apps')}
      ${makeList('DREGs: Top Segments', topD, 'dregs')}
    </div>
  `;

  // Hover link: same category highlights in both lists
  const container = els.topAreas.querySelector('.toplists-grid');
  container.addEventListener('mouseover', (e) => {
    const li = e.target.closest('li.top-item');
    if (!li) return;
    const key = li.dataset.cat;
    container.querySelectorAll('li.top-item').forEach(el => {
      el.classList.toggle('linked-highlight', el.dataset.cat === key);
      el.classList.toggle('linked-dim', el.dataset.cat !== key);
    });
  });
  container.addEventListener('mouseleave', () => {
    container.querySelectorAll('li.top-item').forEach(el => el.classList.remove('linked-highlight', 'linked-dim'));
  });
}

// ---------- Rendering ----------
function renderKPIs(appRows, dregRows) {
  const appCount = appRows.length;
  const dregCount = dregRows.length;
  els.kpi.innerHTML = `
    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-title">Applications</div>
        <div class="kpi-value">${U.fmt ? U.fmt(appCount) : appCount}</div>
      </div>
      <div class="kpi">
        <div class="kpi-title">DREGs</div>
        <div class="kpi-value">${U.fmt ? U.fmt(dregCount) : dregCount}</div>
      </div>
    </div>
  `;
}

function pickTopField(rows, candidates, topN = 10) {
  const key = getFirstField(rows[0] || {}, candidates) || candidates[0];
  const counts = rows.reduce((acc, r) => {
    const v = (r[key] ?? '').toString().trim();
    if (!v) return acc;
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, topN);
  return { key, entries: sorted };
}

function renderTables(appRows, dregRows) {
  const appsSel = d3.select('#compareAppsTable').html('');
  const dregsSel = d3.select('#compareDregsTable').html('');

  const appRowsShaped = appRows.map(r => ({
    'Segment': valOf(r, FIELD_APPS.segL3),
    'Market Segment': valOf(r, FIELD_APPS.marketSeg),
    'Market Application': valOf(r, FIELD_APPS.marketApp),
    'Region': valOf(r, FIELD_APPS.region),
    'Lead DIV': valOf(r, FIELD_APPS.leadDiv),
    'Confidence': r.Confidence ?? r['Confidence'] ?? ''
  }));
  const appCols = ['Segment','Market Segment','Market Application','Region','Lead DIV','Confidence'];

  renderGroupedTables({
    container: appsSel,
    groupedData: new Map([['Applications', appRowsShaped]]),
    columns: appCols,
    defaultCollapsed: false,
    colorByConfidence: true,
  });

  const dregRowsShaped = dregRows.map(r => ({
    'Segment': valOf(r, FIELD_DREG.seg),
    'Market Segment': valOf(r, FIELD_DREG.marketSeg),
    'Market Application': valOf(r, FIELD_DREG.marketApp),
    'Resale Customer': valOf(r, FIELD_DREG.resale),
    'Subregion Responsbible': valOf(r, FIELD_DREG.subresp),
    'Country Resale Customer': valOf(r, FIELD_DREG.countryResale),
  }));
  const dregCols = ['Segment','Market Segment','Market Application','Resale Customer','Subregion Responsbible','Country Resale Customer'];

  renderGroupedTables({
    container: dregsSel,
    groupedData: new Map([['DREGs', dregRowsShaped]]),
    columns: dregCols,
    defaultCollapsed: false,
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ---------- Filtering logic ----------
function getSelectedSegments(){
  const root = els.segmentPicker;
  if (!root) return [];
  return Array.from(root.querySelectorAll('.ms-item input:checked'))
    .map(cb => cb.value.trim().toLowerCase());
}

function runComparison() {
  const dist = (els.distributor.value || '').trim();
  const distKey = dist.toLowerCase();
  const segKeys = getSelectedSegments();
  const matchSeg = (val) => {
    if (!segKeys.length) return true; // no selection -> ALL
    const s = String(val || '').trim().toLowerCase();
    return segKeys.includes(s);
  };

  const aRows = (appsData || [])
    .filter(r => !isDummyRow(r))
    .filter(r => String(getVal(r, FIELD.distributor) || '').trim().toLowerCase() === distKey);

  const dRowsRaw = (dregsData || [])
    .filter(r => !isDummyRow(r))
    .filter(r => String(getVal(r, FIELD.distributor) || '').trim().toLowerCase() === distKey);

  const dRows = dedupeByFirstAvailableKey(dRowsRaw, FIELD.regId);

  const aFiltered = aRows.filter(r => matchSeg(getVal(r, FIELD.segment)));
  const dFiltered = dRows.filter(r => matchSeg(getVal(r, FIELD.segment)));

  els.loading.style.display = 'flex';
  requestAnimationFrame(() => {
    try {
      renderKPIs(aFiltered, dFiltered);
      renderTopAreas(aFiltered, dFiltered);
      renderTables(aFiltered, dFiltered);
    } finally {
      els.loading.style.display = 'none';
    }
  });
}

// ---------- DataStore hydration ----------
async function hydrateFromStore() {
  try {
    const utils = U && U.DataStore ? U : await import('./utils.js');
    const DS = utils.DataStore || (await import('./utils.js')).DataStore;
    if (!DS) return;
    const [appsCached, dregsCached] = await Promise.all([DS.get('apps'), DS.get('dregs')]);
    const appsRows = Array.isArray(appsCached?.rows) ? appsCached.rows : (Array.isArray(appsCached) ? appsCached : []);
    const dregsRows = Array.isArray(dregsCached?.rows) ? dregsCached.rows : (Array.isArray(dregsCached) ? dregsCached : []);
    if (appsRows.length) appsData = appsRows;
    if (dregsRows.length) dregsData = dregsRows;
    if (appsRows.length || dregsRows.length) {
      console.log('Compare: hydrated from DataStore — apps:', appsRows.length, 'dregs:', dregsRows.length);
    }
    maybeEnable();
  } catch (e) {
    console.warn('Compare hydration failed', e);
  }
}

function dedupeByFirstAvailableKey(rows, candidates) {
  const key = rows.length ? getFirstField(rows[0], candidates) : null;
  if (!key) return rows;
  const seen = new Set();
  return rows.filter(r => {
    const v = r[key];
    if (v == null) return true;
    const sig = String(v);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

// ---------- Event bindings ----------
function bindEvents() {
  els.runBtn.addEventListener('click', runComparison);
}

// ---------- Boot ----------
(function boot() {
  if (SECTION_PRESENT) {
    listenForModuleEvents();
    tryHydrateFromGlobals();
    hydrateFromStore();
    bindEvents();
  }
})();

// Expose minimal API for debugging
window.CompareModule = {
  refreshOptions: () => {
    if (SECTION_PRESENT) {
      computeIntersectedOptions();
      populateDropdowns();
    }
  },
  run: (...args) => {
    if (SECTION_PRESENT) {
      runComparison(...args);
    }
  },
};
