/**
 * Apply filter criteria to dataset
 * @param {Array<Object>} data
 * @param {Object} criteria - key-value filters
 * @param {Function} [customFn] - additional row-level predicate
 * @returns {Array<Object>}
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
 * Capitalize first character of a string
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

/**
 * Debounce execution
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Download an array of objects as CSV
 * @param {Array<Object>} dataRows
 * @param {string} filename
 * @param {Array<string>} [columns=null]
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
 * Convert Excel serial date to JS Date
 * @param {number|string} serial
 * @returns {Date|null}
 */
export function excelDateToDate(serial) {
  const n = Number(serial);
  if (isNaN(n) || n < 1) return null;
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

/**
 * Format JS Date to dd/mm/yyyy
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Load and optionally transform CSV
 * @param {string} path
 * @param {Function} [parseFn]
 * @returns {Promise<Array<Object>>}
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
