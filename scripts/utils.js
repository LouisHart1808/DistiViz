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
