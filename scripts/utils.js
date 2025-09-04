/**
 * Apply filter criteria to a dataset.
 * Filters based on exact matches in the criteria object and an optional custom function.
 *
 * @param {Array<Object>} data - The dataset to filter.
 * @param {Object} criteria - Key-value filters to apply.
 * @param {Function} [customFn] - Optional row-level predicate function.
 * @returns {Array<Object>} Filtered dataset.
 */
export function applyFilters(data, criteria = {}, customFn = () => true) {
  return data.filter(row => {
    for (const [key, value] of Object.entries(criteria)) {
      if (value === 'All') continue;
      if (row[key] !== value) return false;
    }
    return customFn(row);
  });
}

/**
 * Download a dataset as a CSV file.
 * Creates and triggers a download link for the provided array of objects.
 *
 * @param {Array<Object>} dataRows - The data to download.
 * @param {string} filename - Filename for the downloaded CSV.
 * @param {Array<string>} [columns=null] - Optional column order. Defaults to keys from first row.
 */
export function downloadCSV(dataRows, filename, columns = null) {
  if (!dataRows?.length) {
    alert("No data to download.");
    return;
  }

  const headers = columns || Object.keys(dataRows[0]);
  const csvRows = dataRows.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(","));
  const csvContent = [headers.join(","), ...csvRows].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Format a JavaScript Date object to 'dd/mm/yyyy'.
 *
 * @param {Date} date - A valid JS Date object.
 * @returns {string} Formatted date string or empty string for invalid date.
 */
export function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Load a CSV file and optionally transform each row.
 * Uses D3's CSV parser under the hood.
 *
 * @param {string} path - Path to the CSV file.
 * @param {Function} [parseFn] - Optional transformation function for each row.
 * @returns {Promise<Array<Object>>} Parsed and filtered rows.
 */
export async function loadCSV(path, parseFn = d => d) {
  const raw = await d3.csv(path);
  return raw.map((row, i) => {
    try {
      return parseFn(row);
    } catch (err) {
      console.warn(`Row ${i} skipped due to error:`, err, row);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Small UI helpers used by uploaders across modules
 */

/** Return inline spinner HTML (size in px). */
export function spinnerHTML(size = 16) {
  const s = Math.max(10, Number(size) || 16);
  return `<span class="spinner" style="width:${s}px;height:${s}px;border-width:${Math.round(s/5)}px"></span>`;
}

/** Escape text for safe HTML insertion. */
export function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format bytes to a human readable string. */
export function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  const units = ['KB','MB','GB','TB'];
  let u = -1, n = b;
  do { n = n/1024; u++; } while (n >= 1024 && u < units.length-1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[u]}`;
}

/**
 * Set the live status line for uploads (aria-live container recommended).
 * States: 'idle' | 'loading' | 'ok' | 'err'.
 */
export function setUploadStatus(el, { state = 'idle', message = '', filename = '', extra = '' } = {}) {
  if (!el) return;
  const name = filename ? `<span class="file-name">${esc(filename)}</span>` : '';
  let badge = '';
  if (state === 'loading') badge = `${spinnerHTML(16)} <span class="status">Loading…</span>`;
  else if (state === 'ok') badge = `<span class="badge ok">Loaded</span>`;
  else if (state === 'err') badge = `<span class="badge err">Failed</span>`;
  else badge = `<span class="badge">Ready</span>`;
  const msg = message ? `<span class="status">${esc(message)}</span>` : '';
  const xtra = extra ? `<span class="extra">${extra}</span>` : '';
  el.innerHTML = `${name} ${badge} ${msg} ${xtra}`.trim();
}

/**
 * Attach drag & drop + keyboard/click behaviour to a drop area + hidden file input.
 * onFile(File) will be called for the first file only.
 */
export function bindDropInput({ dropArea, fileInput, onFile }) {
  if (!dropArea || !fileInput || typeof onFile !== 'function') return () => {};

  const onBrowse = () => fileInput.click();
  const prevent = e => { e.preventDefault(); e.stopPropagation(); };
  const addDrag = () => dropArea.classList.add('drag');
  const rmDrag = () => dropArea.classList.remove('drag');

  const onDrop = e => {
    prevent(e); rmDrag();
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  };
  const onChange = e => {
    const f = e.target?.files?.[0];
    if (f) onFile(f);
    // allow re-selecting the same file
    e.target.value = '';
  };
  const onKey = e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBrowse(); }
  };

  dropArea.addEventListener('click', onBrowse);
  dropArea.addEventListener('keydown', onKey);
  dropArea.addEventListener('dragenter', (e) => { prevent(e); addDrag(); });
  dropArea.addEventListener('dragover', (e) => { prevent(e); addDrag(); });
  dropArea.addEventListener('dragleave', (e) => { prevent(e); rmDrag(); });
  dropArea.addEventListener('drop', onDrop);
  fileInput.addEventListener('change', onChange);

  return () => {
    dropArea.removeEventListener('click', onBrowse);
    dropArea.removeEventListener('keydown', onKey);
    dropArea.removeEventListener('dragenter', addDrag);
    dropArea.removeEventListener('dragover', addDrag);
    dropArea.removeEventListener('dragleave', rmDrag);
    dropArea.removeEventListener('drop', onDrop);
    fileInput.removeEventListener('change', onChange);
  };
}

/**
 * Simple toast (non-blocking). Requires existing .toast container or creates one temporary.
 */
export function showToast(message, type = 'info', timeout = 2500) {
  const root = document.body;
  let box = document.getElementById('toast-root');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-root';
    box.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:8px;flex-direction:column;';
    root.appendChild(box);
  }
  const el = document.createElement('div');
  const bg = type === 'err' ? '#fee2e2' : (type === 'ok' ? '#e6f9ef' : '#eef6ff');
  const bd = type === 'err' ? '#fca5a5' : (type === 'ok' ? '#86efac' : '#93c5fd');
  el.style.cssText = `padding:8px 12px;border-radius:8px;border:1px solid ${bd};background:${bg};box-shadow:0 4px 16px rgba(0,0,0,.12);font-size:13px;`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => { box.removeChild(el); if (!box.childElementCount) box.remove(); }, timeout);
}

// ===== IndexedDB-backed DataStore with localStorage migration =====
const DB_NAME = 'distiviz';
const DB_VERSION = 1;
const STORE = 'datasets';
const LS_PREFIX = 'distiviz:'; // for one-time migration

function _idbSupported() {
  try { return typeof indexedDB !== 'undefined'; } catch { return false; }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    Promise.resolve(fn(store)).then(resolve, reject);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new DOMException('AbortError'));
  });
}

// LocalStorage helpers (for one-time migration + fallback)
function _lsGet(name) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + name);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function _lsSet(name, payload) {
  try { localStorage.setItem(LS_PREFIX + name, JSON.stringify(payload)); } catch {}
}
function _lsDel(name) {
  try { localStorage.removeItem(LS_PREFIX + name); } catch {}
}

async function _migrateIfNeeded(name) {
  // If IDB has data, skip. If not, but LS has, copy once.
  const existing = await DataStore.get(name, { _bypassMigrate: true });
  if (existing) return;

  const ls = _lsGet(name);
  if (ls && Array.isArray(ls.rows)) {
    await DataStore.set(name, ls.rows, ls.meta || {}, { _bypassMigrate: true });
    _lsDel(name);
  }
}

/**
 * DataStore: persist/retrieve processed datasets across tabs/refresh using IndexedDB.
 * API:
 *   await DataStore.set('apps'|'dregs', rows, meta?)
 *   const cached = await DataStore.get('apps')
 *   await DataStore.clear('apps')
 */
export const DataStore = {
  /**
   * Store rows with optional meta. Payload shape: { name, version, ts, rows, meta }
   */
  async set(name, rows, meta = {}, _opts = {}) {
    const payload = { name, version: 1, ts: Date.now(), rows, meta };
    if (!_idbSupported()) {
      _lsSet(name, { version: payload.version, ts: payload.ts, rows: payload.rows, meta: payload.meta });
      return;
    }
    // When called from migration, skip re-entrant migration work
    if (!_opts._bypassMigrate) await _migrateIfNeeded(name);
    return tx(STORE, 'readwrite', (store) => store.put(payload));
  },

  /**
   * Fetch cached dataset by name. Returns { rows, meta, ts } or null.
   */
  async get(name, _opts = {}) {
    if (!_idbSupported()) {
      const rec = _lsGet(name);
      if (!rec || !Array.isArray(rec.rows)) return null;
      return { rows: rec.rows, meta: rec.meta || {}, ts: rec.ts || 0 };
    }
    // During normal calls, migrate LS → IDB once if needed.
    if (!_opts._bypassMigrate) await _migrateIfNeeded(name);

    const rec = await tx(STORE, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(name);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    });
    if (!rec || !Array.isArray(rec.rows)) return null;
    return { rows: rec.rows, meta: rec.meta || {}, ts: rec.ts || 0 };
  },

  /**
   * Delete a specific cached dataset.
   */
  async clear(name) {
    if (!_idbSupported()) { _lsDel(name); return; }
    return tx(STORE, 'readwrite', (store) => store.delete(name));
  },

  /**
   * Nuke all cached datasets (useful for debugging)
   */
  async clearAll() {
    if (!_idbSupported()) {
      try {
        Object.keys(localStorage).forEach(k => { if (k.startsWith(LS_PREFIX)) localStorage.removeItem(k); });
      } catch {}
      return;
    }
    return tx(STORE, 'readwrite', (store) => store.clear());
  }
};

// Optional: expose on window for quick inspection in devtools
try { window.DistiVizStore = DataStore; } catch {}

// ===== Cache UI helper (lightweight status + clear button) =====
export async function renderCacheControls({ container, storeKey, onClear }) {
  if (!container) return;
  const cached = await DataStore.get(storeKey);
  const fmtTime = (ms) => {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;';

  const status = document.createElement('span');
  status.className = 'badge';
  status.style.border = '1px solid #bcd';
  status.style.background = '#eef6ff';
  status.textContent = cached
    ? `Restored ${cached.rows.length.toLocaleString()} rows · Saved ${fmtTime(cached.ts)}`
    : 'No cache';
  wrap.appendChild(status);

  const btn = document.createElement('button');
  btn.textContent = 'Clear cache';
  btn.addEventListener('click', async () => {
    await DataStore.clear(storeKey);
    if (typeof onClear === 'function') onClear();
  });
  wrap.appendChild(btn);

  container.appendChild(wrap);
}
