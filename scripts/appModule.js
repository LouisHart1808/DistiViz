import { loadCSV, downloadCSV, applyFilters } from './utils.js';
import { renderGroupedTables, renderBarChart } from './visuals.js';

export async function loadAppModule() {
  const data = await loadCSV('data/DistiApps.csv');

  // Grab DOM elements
  const regionSelect = d3.select('#regionSelect');
  const level3Select = d3.select('#level3Select');
  const scoreSlider = d3.select('#scoreSlider');

  // Define columns to export
  const columns = [
    "ID", "System/Application Level III", "System/Application Level II",
    "Application List Light Application", "Lead DIV", "Confidence"
  ];

  /**
   * Populate a select dropdown with given options
   * @param {d3.Selection} selectElement - d3 selection of a <select> element
   * @param {Array<string>} options - array of option values
   * @param {string} defaultValue - the default selected value
   */
  function populateDropdown(selectElement, options, defaultValue = "All") {
    selectElement.selectAll("option")
      .data([defaultValue, ...options])
      .enter()
      .append("option")
      .text(d => d);
    selectElement.property("value", defaultValue);
  }

  // Populate dropdowns
  const regions = Array.from(new Set(data.map(d => d.Region).filter(Boolean))).sort();
  populateDropdown(regionSelect, regions);

  const level3s = Array.from(new Set(data.map(d => d["System/Application Level III"]))).sort();
  populateDropdown(level3Select, level3s);

  /**
   * Update summary metrics, charts, and tables based on filters
   */
  function update() {
    const region = regionSelect.property('value');
    const level3 = level3Select.property('value');
    const minScore = +scoreSlider.property('value');

    const filtered = applyFilters(data, {}, d => {
      return (region === 'All' || d.Region === region) &&
             +d.Confidence >= minScore &&
             (level3 === 'All' || d["System/Application Level III"] === level3);
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

    // Render bar chart
    const counts = Array.from(grouped, ([Distributor, values]) => ({ Distributor, Count: values.length }));
    const barChartContainer = d3.select("#barChart").html("");
    const barChartCard = barChartContainer.append("div").attr("class", "map-card");
    barChartCard.append("h3").attr("class", "map-title").text("Applications by Distributor");
    barChartCard.append("div").attr("id", "barChartInner");

    renderBarChart({
      containerId: "barChartInner",
      data: counts,
      xKey: "Distributor",
      yKey: "Count",
      tooltipLabel: "Applications"
    });

    // Render data tables
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

  // Bind filters
  scoreSlider.on("input", function () {
    d3.select("#scoreValue").text(this.value);
    update();
  });

  regionSelect.on("change", update);
  level3Select.on("change", update);

  // Initial render
  update();
}
