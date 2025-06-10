/**
 * Apply filter criteria to dataset
 * @param {Array} data - dataset
 * @param {Object} criteria - filtering rules (key-value pairs)
 * @param {Function} [customFn] - additional boolean filter logic
 * @returns {Array}
 */
export function applyFilters(data, criteria = {}, customFn = () => true) {
  return data.filter(row => {
    for (const [field, value] of Object.entries(criteria)) {
      if (value === 'All') continue;
      if (row[field] !== value) return false;
    }
    return customFn(row);
  });
}
