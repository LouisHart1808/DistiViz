/**
 * Export data as CSV file
 */
export function downloadCSV(dataRows, filename, columns = null) {
  if (!dataRows || !dataRows.length) {
    alert("No data to download.");
    return;
  }
  const headers = columns || Object.keys(dataRows[0]);
  const csvRows = dataRows.map(row => headers.map(field => `"${row[field] || ''}"`).join(","));
  const csvContent = [headers.join(","), ...csvRows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
