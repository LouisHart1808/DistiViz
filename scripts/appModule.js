import { loadCSV, downloadCSV, applyFilters } from './utils.js';
import { renderGroupedTables, renderBarChart } from './visuals.js';

export async function loadAppModule() {
  const data = await loadCSV('data/DistiApps.csv');

  const regionSelect = d3.select('#regionSelect');
  const level3Select = d3.select('#level3Select');
  const scoreSlider = d3.select('#scoreSlider');

  const columns = [
    "ID", "System/Application Level III", "System/Application Level II",
    "Application List Light Application", "Lead DIV", "Confidence"
  ];

  const regions = Array.from(new Set(data.map(d => d.Region))).sort();
  regionSelect.selectAll('option')
    .data(regions)
    .enter().append('option').text(d => d);

  const level3s = Array.from(new Set(data.map(d => d["System/Application Level III"]))).sort();
  level3Select.selectAll('option')
    .data(["All", ...level3s])
    .enter().append('option').text(d => d);

  function update() {
    const region = regionSelect.property('value');
    const level3 = level3Select.property('value');
    const minScore = +scoreSlider.property('value');

    const filtered = applyFilters(data, { Region: region }, d => {
      return +d.Confidence >= minScore && (level3 === 'All' || d["System/Application Level III"] === level3);
    });

    const grouped = d3.group(filtered, d => d.Distributor);

    d3.select("#summary").html(`
      <h2>Summary Metrics</h2>
      <p>Distributors Displayed: ${grouped.size}</p>
      <p>Applications Matching: ${filtered.length}</p>
      <button id="downloadAllFilteredCsv">Download Filtered CSV</button>
    `);

    d3.select("#downloadAllFilteredCsv").on("click", () => {
      downloadCSV(filtered, `Filtered_Data_${region}.csv`, columns);
    });

    const counts = Array.from(grouped, ([Distributor, values]) => ({ Distributor, Count: values.length }));
    renderBarChart({
      containerId: "barChart",
      data: counts,
      xKey: "Distributor",
      yKey: "Count",
      tooltipLabel: "Applications"
    });

    const container = d3.select("#results").html("<h2>Filtered Application Tables by Distributor</h2>");
    renderGroupedTables({
      container,
      groupedData: grouped,
      columns,
      distributor: region,
      defaultCollapsed: true,
      colorByConfidence: true
    });
  }

  scoreSlider.on("input", function () {
    d3.select("#scoreValue").text(this.value);
    update();
  });

  regionSelect.on("change", update);
  level3Select.on("change", update);

  update();
}
