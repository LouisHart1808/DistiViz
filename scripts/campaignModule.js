import { renderGroupedTables } from './visuals.js';
import { DataStore, renderCacheControls } from './utils.js';

let bootstrapped = false;

// State
const state = {
  masterRows: [], // parsed from Master Excel
  campaignRows: [], // parsed from Campaign Excel
  ui: {},
};

// Utilities
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function toDate(val) {
  // Accepts Date | number (Excel serial) | string (yyyy-mm-dd or dd/mm/yyyy etc.)
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel serial date (assuming 1900-based)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = val * 86400000; // days → ms
    return new Date(epoch.getTime() + ms);
  }
  const s = String(val).trim();
  const iso = new Date(s);
  if (!isNaN(iso)) return iso;
  // try dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const [_, dd, mm, yyyy] = m;
    const y = Number(yyyy.length === 2 ? (Number(yyyy) + 2000) : yyyy);
    return new Date(Number(y), Number(mm) - 1, Number(dd));
  }
  return null;
}

function norm(s) {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s) { return new Set(norm(s).split(' ').filter(Boolean)); }

function jaccard(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = new Set([...A, ...B]).size;
  return inter / union;
}

function containsEither(a, b) {
  const na = norm(a), nb = norm(b);
  return na && nb && (na.includes(nb) || nb.includes(na));
}

function guessCountry(val) {
  // Best-effort country normalization (leave raw; matching uses substring)
  return (val ?? '').toString().trim();
}

async function ensureXLSX() {
  if (window.XLSX) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.async = true;
    s.onload = resolve; s.onerror = () => reject(new Error('Failed to load XLSX parser'));
    document.head.appendChild(s);
  });
}

async function readExcel(file) {
  await ensureXLSX();
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header: 1 gives arrays, then convert to objects with first row as header
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  return rows;
}

function enable(el, isEnabled) {
  if (!el) return;
  el.disabled = !isEnabled;
  el.setAttribute('aria-disabled', String(!isEnabled));
}

function setStatus(el, ok, msg) {
  if (!el) return;
  el.innerHTML = `<span class="badge ${ok ? 'ok' : 'err'}">${ok ? '✓' : '✗'}</span> ${msg}`;
}

function clearTbody(tbody) { if (tbody) tbody.innerHTML = ''; }

function titleCaseCountry(s) {
  if (!s) return s;
  const t = s.toString().trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function recomputeEnableQuery() {
  const ui = state.ui || {};
  const ok = state.masterRows.length > 0 && state.campaignRows.length > 0 &&
    !!ui.startDate?.value && !!ui.queryPeriod?.value &&
    !!ui.distributor?.value && !!ui.country?.value;
  enable(ui.queryBtn, ok);
}

function updateCountryOptions() {
  const selEl = state.ui.country;
  const startEl = state.ui.startDate;
  const periodEl = state.ui.queryPeriod;
  const distEl = state.ui.distributor;
  if (!selEl || !startEl || !periodEl || !distEl) return;

  // only populate when we have inputs and master rows
  if (state.masterRows.length === 0) return;
  const start = toDate(startEl.value);
  const days = Number(periodEl.value || '0');
  const dist = (distEl.value || '').trim();
  if (!start || !days || !dist) return;
  const end = new Date(start.getTime() + days * 86400000);
  const distKey = norm(dist);

  const countries = new Set();
  for (const r of state.masterRows) {
    const d = r.registration_date;
    if (!d || d < start || d > end) continue;
    if (norm(r.distributor) !== distKey) continue;
    if (r.country) countries.add(r.country);
  }

  const prev = selEl.value;
  const options = Array.from(countries)
    .sort((a,b)=>a.localeCompare(b))
    .map(c => {
      const cap = titleCaseCountry(c);
      return `<option value="${cap}">${cap}</option>`;
    }).join('');
  selEl.innerHTML = `
    <option value="">-- Select Country --</option>
    ${options}
  `;
  if (prev && Array.from(countries).includes(prev)) selEl.value = prev;
}

// ---------- Parsing & Shaping ----------
function shapeMasterRows(rows) {
  // Expected columns (case-insensitive):
  // Registration ID, Main Distributor, Registration Date, Resale Customer, Country Resale Customer
  const mapKey = k => norm(k).replace(/\s+/g, ' ');
  const keymap = {};
  if (rows[0]) {
    for (const k of Object.keys(rows[0])) keymap[mapKey(k)] = k;
  }
  const kRegId = keymap['registration id'] ?? keymap['registrationid'];
  const kDist = keymap['main distributor'] ?? keymap['distributor'];
  const kRegDate = keymap['registration date'] ?? keymap['date'];
  const kResale = keymap['resale customer'] ?? keymap['customer'];
  const kCountry = keymap['country resale customer'] ?? keymap['country'];

  return rows.map(r => {
    const regDate = toDate(r[kRegDate]);
    return {
      registration_id: r[kRegId] ?? '',
      distributor: (r[kDist] ?? '').toString().trim(),
      registration_date: regDate,
      resale_customer: (r[kResale] ?? '').toString().trim(),
      country: guessCountry(r[kCountry]),
      _raw: r,
    };
  }).filter(r => r.registration_id || r.resale_customer);
}

function shapeCampaignRows(rows) {
  // Expected columns: First Name, Last Name, Email, Company (case-insensitive)
  const mapKey = k => norm(k).replace(/\s+/g, ' ');
  const keymap = {};
  if (rows[0]) {
    for (const k of Object.keys(rows[0])) keymap[mapKey(k)] = k;
  }
  const kFirst = keymap['first name'] ?? keymap['firstname'] ?? keymap['first'];
  const kLast = keymap['last name'] ?? keymap['lastname'] ?? keymap['last'];
  const kEmail = keymap['email'];
  const kCompany = keymap['company'] ?? keymap['organisation'] ?? keymap['organization'];

  return rows.map(r => ({
    first_name: (r[kFirst] ?? '').toString().trim(),
    last_name: (r[kLast] ?? '').toString().trim(),
    email: (r[kEmail] ?? '').toString().trim(),
    company: (r[kCompany] ?? '').toString().trim(),
    _raw: r,
  })).filter(r => r.email || r.company || r.first_name || r.last_name);
}

// Matching
function matchCampaignToMaster({ master, campaign, threshold = 0.5 }) {
  const matches = [];
  for (const lead of campaign) {
    const company = lead.company;
    for (const opp of master) {
      const cust = opp.resale_customer;
      const jac = jaccard(company, cust);
      if (jac >= threshold || containsEither(company, cust)) {
        matches.push({
          lead,
          opp,
          score: Math.max(jac, containsEither(company, cust) ? 0.99 : jac),
        });
      }
    }
  }
  return matches
    .sort((a, b) => b.score - a.score)
    .map(m => ({
      contact: `${m.lead.first_name} ${m.lead.last_name}`.trim() || '(unknown)',
      email: m.lead.email || '(unknown)',
      campaign_company: m.lead.company || '(unknown)',
      resale_customer: m.opp.resale_customer || '(unknown)',
      registration_id: m.opp.registration_id || '',
      registration_date: m.opp.registration_date ? new Date(m.opp.registration_date).toISOString().slice(0,10) : '',
      _lead: m.lead,
      _opp: m.opp,
      _score: m.score,
    }));
}

// Rendering
function renderSummary({ filteredMaster, campaign, matches }) {
  const el = state.ui.summary;
  if (!el) return;
  const matchedLeadCount = new Set(matches.map(m => m.email || m.contact)).size;

  el.innerHTML = `
    <div class="kpi-row">
      <div class="kpi" title="Number of business opportunities after filters">
        <div class="kpi-title">Filtered Opportunities</div>
        <div class="kpi-value">${filteredMaster.length.toLocaleString()}</div>
      </div>
      <div class="kpi" title="Total uploaded campaign leads">
        <div class="kpi-title">Campaign Leads</div>
        <div class="kpi-value">${campaign.length.toLocaleString()}</div>
      </div>
      <div class="kpi" title="Unique campaign leads that matched at least one opportunity">
        <div class="kpi-title">Matched Campaign Leads</div>
        <div class="kpi-value">${matchedLeadCount.toLocaleString()}</div>
      </div>
    </div>
  `;
}

function renderTables({ filteredMaster, campaign, matches }) {
  const matchesSel = d3.select('#matchesTable');
  const masterSel = d3.select('#masterTable');
  const campaignSel = d3.select('#campaignTable');
  matchesSel.html('');
  masterSel.html('');
  campaignSel.html('');

  // Normalize rows to pretty column names expected by renderGroupedTables
  const matchRows = matches.map(m => ({
    'Contact Person': m.contact,
    'Email': m.email,
    'Campaign Company': m.campaign_company,
    'Resale Customer': m.resale_customer,
    'Registration ID': m.registration_id,
    'Registration Date': m.registration_date,
  }));

  const masterRows = filteredMaster.map(r => ({
    'Registration ID': r.registration_id,
    'Resale Customer': r.resale_customer,
    'Registration Date': r.registration_date ? r.registration_date.toISOString().slice(0,10) : ''
  }));

  const campaignRows = campaign.map(l => ({
    'Name': `${l.first_name} ${l.last_name}`.trim() || '(unknown)',
    'Email': l.email || '',
    'Company': l.company || ''
  }));

  // Render three grouped tables (each in its own expander card) with sorting
  renderGroupedTables({
    container: matchesSel,
    groupedData: new Map([["Potential Matches Found", matchRows]]),
    columns: ['Contact Person','Email','Campaign Company','Resale Customer','Registration ID','Registration Date'],
    defaultCollapsed: false
  });

  renderGroupedTables({
    container: masterSel,
    groupedData: new Map([["Business Opportunities Filtered", masterRows]]),
    columns: ['Registration ID','Resale Customer','Registration Date'],
    defaultCollapsed: true
  });

  renderGroupedTables({
    container: campaignSel,
    groupedData: new Map([["All Campaign Leads", campaignRows]]),
    columns: ['Name','Email','Company'],
    defaultCollapsed: true
  });
}

function setLoading(isLoading) {
  const el = state.ui.loading;
  if (!el) return;
  el.style.display = isLoading ? 'flex' : 'none';
}

// Wiring
function bindOnce() {
  const root = $('#campaignCheckerSection');
  state.ui = {
    root,
    masterInput: $('#masterFile'),
    campaignInput: $('#campaignFile'),
    masterStatus: $('#masterStatus'),
    campaignStatus: $('#campaignStatus'),
    startDate: $('#startDate'),
    queryPeriod: $('#queryPeriod'),
    distributor: $('#distributor'),
    country: $('#country'),
    queryBtn: $('#queryBtn'),
    summary: $('#campaignSummaryContent'),
    loading: $('#loading'),
    resultsContainer: $('#resultsContainer'),
  };

  // Cache status/controls placeholders (idempotent) under each status line
  let masterCacheUI = document.getElementById('campaignMasterCacheUI');
  if (!masterCacheUI) {
    masterCacheUI = document.createElement('div');
    masterCacheUI.id = 'campaignMasterCacheUI';
    state.ui.masterStatus?.parentNode?.insertBefore(masterCacheUI, state.ui.masterStatus.nextSibling);
  } else {
    masterCacheUI.innerHTML = '';
  }
  let leadsCacheUI = document.getElementById('campaignLeadsCacheUI');
  if (!leadsCacheUI) {
    leadsCacheUI = document.createElement('div');
    leadsCacheUI.id = 'campaignLeadsCacheUI';
    state.ui.campaignStatus?.parentNode?.insertBefore(leadsCacheUI, state.ui.campaignStatus.nextSibling);
  } else {
    leadsCacheUI.innerHTML = '';
  }

  // Drag & drop support for the two upload areas (delegate by proximity)
  $all('#campaignCheckerSection .upload-area').forEach(area => {
    ['dragenter','dragover'].forEach(evt => area.addEventListener(evt, e => { e.preventDefault(); area.classList.add('drag'); }));
    ['dragleave','drop'].forEach(evt => area.addEventListener(evt, e => { e.preventDefault(); area.classList.remove('drag'); }));
    area.addEventListener('drop', async e => {
      const files = e.dataTransfer?.files;
      if (!files || !files[0]) return;
      if (area.nextElementSibling && area.nextElementSibling.id === 'masterFile') {
        await handleMasterFile(files[0]);
      } else if (area.nextElementSibling && area.nextElementSibling.id === 'campaignFile') {
        await handleCampaignFile(files[0]);
      }
    });
  });

  state.ui.masterInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleMasterFile(file);
  });

  state.ui.campaignInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleCampaignFile(file);
  });

  // Input validation/enabling
  const validate = () => {
    recomputeEnableQuery();
  };

  ['input','change'].forEach(evt => {
    state.ui.startDate?.addEventListener(evt, () => { validate(); updateCountryOptions(); });
    state.ui.queryPeriod?.addEventListener(evt, () => { validate(); updateCountryOptions(); });
    state.ui.distributor?.addEventListener(evt, () => { validate(); updateCountryOptions(); });
    state.ui.country?.addEventListener(evt, validate);
  });

  state.ui.queryBtn?.addEventListener('click', async () => {
    setLoading(true);
    try {
      const start = toDate(state.ui.startDate.value);
      const days = Number(state.ui.queryPeriod.value || '0');
      const end = new Date(start.getTime() + days * 86400000);
      const selDist = state.ui.distributor.value.trim().toLowerCase();
      const countryNeedle = state.ui.country.value.trim().toLowerCase();

      // Filter master
      const filteredMaster = state.masterRows.filter(r => {
        const d = r.registration_date;
        const inRange = d && d >= start && d <= end;
        const distOk = norm(r.distributor) === selDist;
        const countryOk = r.country?.toLowerCase().includes(countryNeedle);
        return inRange && distOk && countryOk;
      });

      // Match
      const matches = matchCampaignToMaster({ master: filteredMaster, campaign: state.campaignRows, threshold: 0.5 });

      // Render
      renderSummary({ filteredMaster, campaign: state.campaignRows, matches });
      renderTables({ filteredMaster, campaign: state.campaignRows, matches });

      if (state.ui.resultsContainer) state.ui.resultsContainer.style.display = 'block';
      const summaryCard = document.getElementById('campaignSummary');
      if (summaryCard && typeof summaryCard.scrollIntoView === 'function') {
        summaryCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to process query. See console for details.');
    } finally {
      setLoading(false);
    }
  });

  recomputeEnableQuery();
}

async function restoreFromCache() {
  try {
    const [masterCached, leadsCached] = await Promise.all([
      DataStore.get('campaign:master'),
      DataStore.get('campaign:leads')
    ]);

    // Restore Master
    if (masterCached && Array.isArray(masterCached.rows) && masterCached.rows.length) {
      state.masterRows = masterCached.rows.map(r => ({
        ...r,
        registration_date: r.registration_date ? new Date(r.registration_date) : null
      }));
      const dists = Array.from(new Set(state.masterRows.map(r => r.distributor).filter(Boolean)))
        .sort((a,b) => a.localeCompare(b));
      if (state.ui.distributor) {
        state.ui.distributor.innerHTML = '<option value="">-- Select Distributor --</option>' +
          dists.map(d => `<option value="${norm(d)}">${d}</option>`).join('');
      }
      updateCountryOptions();
      setStatus(state.ui.masterStatus, true, `Restored ${state.masterRows.length} rows from cache`);
      await renderCacheControls({
        container: document.getElementById('campaignMasterCacheUI'),
        storeKey: 'campaign:master',
        onClear: () => {
          state.masterRows = [];
          if (state.ui.distributor) state.ui.distributor.innerHTML = '<option value="">-- Select Distributor --</option>';
          updateCountryOptions();
          setStatus(state.ui.masterStatus, true, 'Cache cleared. Upload master file to begin.');
          renderCacheControls({ container: document.getElementById('campaignMasterCacheUI'), storeKey: 'campaign:master', onClear: () => {} });
          recomputeEnableQuery();
        }
      });
    } else {
      await renderCacheControls({ container: document.getElementById('campaignMasterCacheUI'), storeKey: 'campaign:master', onClear: () => {} });
    }

    // Restore Leads
    if (leadsCached && Array.isArray(leadsCached.rows) && leadsCached.rows.length) {
      state.campaignRows = leadsCached.rows;
      setStatus(state.ui.campaignStatus, true, `Restored ${state.campaignRows.length} leads from cache`);
      await renderCacheControls({
        container: document.getElementById('campaignLeadsCacheUI'),
        storeKey: 'campaign:leads',
        onClear: () => {
          state.campaignRows = [];
          setStatus(state.ui.campaignStatus, true, 'Cache cleared. Upload campaign file to begin.');
          renderCacheControls({ container: document.getElementById('campaignLeadsCacheUI'), storeKey: 'campaign:leads', onClear: () => {} });
          recomputeEnableQuery();
        }
      });
    } else {
      await renderCacheControls({ container: document.getElementById('campaignLeadsCacheUI'), storeKey: 'campaign:leads', onClear: () => {} });
    }

    recomputeEnableQuery();
  } catch (e) {
    console.warn('Campaign module cache rehydrate failed', e);
  }
}

async function handleMasterFile(file) {
  try {
    setStatus(state.ui.masterStatus, true, `Reading: ${file.name}`);
    const rows = await readExcel(file);
    state.masterRows = shapeMasterRows(rows);

    // Persist processed master rows
    try {
      const serializable = state.masterRows.map(r => ({
        ...r,
        registration_date: r.registration_date ? r.registration_date.toISOString() : null
      }));
      await DataStore.set('campaign:master', serializable, { source: 'campaignMasterExcel' });
    } catch (e) { console.warn('Persist campaign:master failed', e); }

    // Populate distributors
    const dists = Array.from(new Set(state.masterRows.map(r => r.distributor).filter(Boolean)))
      .sort((a,b) => a.localeCompare(b));
    if (state.ui.distributor) {
      state.ui.distributor.innerHTML = '<option value="">-- Select Distributor --</option>' +
        dists.map(d => `<option value="${norm(d)}">${d}</option>`).join('');
    }

    updateCountryOptions();

    setStatus(state.ui.masterStatus, true, `Loaded ${state.masterRows.length} rows (cached)`);
    await renderCacheControls({
      container: document.getElementById('campaignMasterCacheUI'),
      storeKey: 'campaign:master',
      onClear: () => {
        state.masterRows = [];
        if (state.ui.distributor) state.ui.distributor.innerHTML = '<option value="">-- Select Distributor --</option>';
        updateCountryOptions();
        setStatus(state.ui.masterStatus, true, 'Cache cleared. Upload master file to begin.');
        renderCacheControls({ container: document.getElementById('campaignMasterCacheUI'), storeKey: 'campaign:master', onClear: () => {} });
        recomputeEnableQuery();
      }
    });
  } catch (e) {
    console.error(e);
    setStatus(state.ui.masterStatus, false, 'Failed to read master file');
  }
}

async function handleCampaignFile(file) {
  try {
    setStatus(state.ui.campaignStatus, true, `Reading: ${file.name}`);
    const rows = await readExcel(file);
    state.campaignRows = shapeCampaignRows(rows);
    try {
      await DataStore.set('campaign:leads', state.campaignRows, { source: 'campaignLeadsExcel' });
    } catch (e) { console.warn('Persist campaign:leads failed', e); }
    setStatus(state.ui.campaignStatus, true, `Loaded ${state.campaignRows.length} leads (cached)`);
    await renderCacheControls({
      container: document.getElementById('campaignLeadsCacheUI'),
      storeKey: 'campaign:leads',
      onClear: () => {
        state.campaignRows = [];
        setStatus(state.ui.campaignStatus, true, 'Cache cleared. Upload campaign file to begin.');
        renderCacheControls({ container: document.getElementById('campaignLeadsCacheUI'), storeKey: 'campaign:leads', onClear: () => {} });
        recomputeEnableQuery();
      }
    });
    // Preview rendering is handled after running a query via renderTables().
  } catch (e) {
    console.error(e);
    setStatus(state.ui.campaignStatus, false, 'Failed to read campaign file');
  }
}

export async function loadCampaignModule() {
  if (bootstrapped) return; // init once per session
  bindOnce();
  await restoreFromCache();
  updateCountryOptions();
  bootstrapped = true;
}
