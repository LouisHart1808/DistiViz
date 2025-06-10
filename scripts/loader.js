/**
 * Loads and preprocesses CSV data
 */
export async function loadCSV(path, parseFn = d => d) {
  const raw = await d3.csv(path);
  return raw.map(parseFn);
}

/**
 * Converts Excel date serial to JS Date
 */
export function excelDateToDate(serial) {
  if (!serial) return null;
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

/**
 * Converts JS Date to dd/mm/yyyy string
 */
export function formatDate(date) {
  if (!date) return '';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}
