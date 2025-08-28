import { loadCSV, formatDate, downloadCSV, applyFilters } from './utils.js';
import { renderGroupedTables, renderBarChart, renderChoroplethMap } from './visuals.js';

export async function loadDregModule() {
  const data = await loadCSV('data/DistiDregs.csv', d => {
    const approvalRaw = new Date(d["Approval Date"]);
    const registrationRaw = new Date(d["Registration Date"]);
    return {
      ...d,
      "Approval Date Raw": approvalRaw instanceof Date && !isNaN(approvalRaw) ? approvalRaw : null,
      "Registration Date Raw": registrationRaw instanceof Date && !isNaN(registrationRaw) ? registrationRaw : null,
      "Approval Date": formatDate(approvalRaw),
      "Registration Date": formatDate(registrationRaw),
      "DREG Rev 3y": +d["DREG Rev 3y"] || 0
    };
  });

  const distributorBarChart = d3.select("#distributorBarChart");
  const annualDistributorSelect = d3.select("#annualDistributorSelect");
  const annualSegmentSelect = d3.select("#annualSegmentSelect");
  const annualRegionSelect = d3.select("#annualRegionSelect");
  const distributorSelect = d3.select("#distributorSelect");
  const regStatusSelect = d3.select("#regStatusSelect");
  const approvalInput = d3.select("#approvalDate");
  const campaignInput = d3.select("#campaignDate");
  const hasCampaignCheckbox = d3.select("#hasCampaignDate");
  const mapMetricSelect = d3.select("#mapMetricSelect");
  const mapStartYearSelect = d3.select("#mapStartYearSelect");
  const mapEndYearSelect = d3.select("#mapEndYearSelect");

  const allYears = Array.from(new Set(data
    .map(d => d["Approval Date Raw"])
    .filter(d => d instanceof Date && !isNaN(d))
    .map(d => d.getFullYear()))).sort((a, b) => a - b);

  // Helper function to populate a dropdown with options
  function populateDropdown(target, options, defaultValue, valueFn = d => d, textFn = d => d) {
    target.selectAll("option").remove();
    target.selectAll("option")
      .data(options)
      .enter()
      .append("option")
      .attr("value", valueFn)
      .text(textFn);
    if (defaultValue !== undefined) {
      target.property("value", defaultValue);
    }
  }

  // Populate year selects for map filtering
  populateDropdown(mapStartYearSelect, allYears, allYears[0]);
  populateDropdown(mapEndYearSelect, allYears, allYears[allYears.length - 1]);

  // Populate distributor selects
  const distributorList = Array.from(new Set(data.map(d => d.Distributor).filter(Boolean))).sort();
  populateDropdown(distributorSelect, distributorList, distributorList[0]);
  populateDropdown(annualDistributorSelect, distributorList, distributorList[0]);

  // Populate Reg Status select (with "All" as the first option)
  const regStatusOptions = ["All", ...Array.from(new Set(data.map(d => d["Reg Status"]).filter(Boolean))).sort()];
  populateDropdown(regStatusSelect, regStatusOptions, regStatusOptions[0]);

  // === Aggregate histograms (respect Start/End Year selection) ===
  function getYearFilteredData() {
    const startY = +mapStartYearSelect.property("value");
    const endY = +mapEndYearSelect.property("value");
    return data.filter(d => {
      const dt = d["Approval Date Raw"];
      if (!(dt instanceof Date) || isNaN(dt)) return false;
      const y = dt.getFullYear();
      return y >= startY && y <= endY;
    });
  }

  function renderAggregateCharts() {
    const yearFiltered = getYearFilteredData();

    // DREG count per Distributor (filtered by year)
    const distiCounts = d3.rollups(yearFiltered, v => v.length, d => d.Distributor)
      .map(([Distributor, Count]) => ({ Distributor, Count }))
      .sort((a, b) => d3.descending(a.Count, b.Count));

    const distiContainer = d3.select("#distributorBarChart").html("");
    const distiCard = distiContainer.append("div").attr("class", "map-card");
    distiCard.append("h3").attr("class", "map-title").text("Total Number of DREGs per Distributor");
    distiCard.append("div").attr("id", "distributorBarChartInner");
    renderBarChart({
      containerId: "distributorBarChartInner",
      data: distiCounts,
      xKey: "Distributor",
      yKey: "Count",
      tooltipLabel: "DREGs"
    });

    // Revenue per Distributor (filtered by year)
    const revenueByDistributor = d3.rollups(
      yearFiltered,
      v => d3.sum(v, d => +d["DREG Rev 3y"] || 0),
      d => d.Distributor
    )
      .map(([Distributor, Revenue]) => ({ Distributor, Count: Revenue }))
      .sort((a, b) => d3.descending(a.Count, b.Count));

    const revContainer = d3.select("#revenueBarChart").html("");
    const revCard = revContainer.append("div").attr("class", "map-card");
    revCard.append("h3").attr("class", "map-title").text("Total Revenue per Distributor (3y)");
    revCard.append("div").attr("id", "revenueBarChartInner");
    renderBarChart({
      containerId: "revenueBarChartInner",
      data: revenueByDistributor,
      xKey: "Distributor",
      yKey: "Count",
      tooltipLabel: "Total Revenue (3y)",
      formatLabelFn: val => d3.format(".3~s")(val).replace("G", "B")
    });
  }

  function renderAnnualChart(distributor, segment, region) {
    const filtered = data.filter(d =>
      d.Distributor === distributor &&
      d["Approval Date Raw"] instanceof Date &&
      !isNaN(d["Approval Date Raw"]) &&
      (segment === "All Segment" || d.Segment === segment) &&
      (region === "All Region" || d["Region Resale Customer"] === region)
    );

    const byYear = d3.rollups(
      filtered,
      v => v.length,
      d => d["Approval Date Raw"].getFullYear()
    )
      .filter(([y]) => !isNaN(y))
      .map(([Year, Count]) => ({ Year, Count }))
      .sort((a, b) => a.Year - b.Year);

    const dregContainer = d3.select("#annualDregsChart").html("");
    const dregCard = dregContainer.append("div").attr("class", "map-card");
    dregCard.append("h3").attr("class", "map-title").text("Annual DREG Count");
    dregCard.append("div").attr("id", "annualDregsChartInner");
    renderBarChart({
      containerId: "annualDregsChartInner",
      data: byYear,
      xKey: "Year",
      yKey: "Count",
      tooltipLabel: "DREGs"
    });

    // Revenue per year
    const revByYear = d3.rollups(
      filtered,
      v => d3.sum(v, d => +d["DREG Rev 3y"] || 0),
      d => d["Approval Date Raw"].getFullYear()
    )
      .filter(([y]) => !isNaN(y))
      .map(([Year, Count]) => ({ Year, Count }))
      .sort((a, b) => a.Year - b.Year);

    const revContainer = d3.select("#annualRevenueChart").html("");
    const revCard = revContainer.append("div").attr("class", "map-card");
    revCard.append("h3").attr("class", "map-title").text("Annual Revenue (3y)");
    revCard.append("div").attr("id", "annualRevenueChartInner");
    renderBarChart({
      containerId: "annualRevenueChartInner",
      data: revByYear,
      xKey: "Year",
      yKey: "Count",
      tooltipLabel: "Total Revenue (3y)",
      formatLabelFn: val => d3.format(".3~s")(val).replace("G", "B")
    });
  }

  // Update annual chart and repopulate segment/region dropdowns when distributor changes
  function triggerAnnualUpdate() {
    const distributor = annualDistributorSelect.property("value");

    // Populate segment dropdown with "All Segment" + all unique segments
    const segments = Array.from(new Set(data.map(d => d.Segment).filter(Boolean))).sort();
    populateDropdown(
      annualSegmentSelect,
      ["All Segment", ...segments],
      "All Segment"
    );

    // Populate region dropdown with "All Region" + all unique regions
    const regions = Array.from(new Set(data.map(d => d["Region Resale Customer"]).filter(Boolean))).sort();
    populateDropdown(
      annualRegionSelect,
      ["All Region", ...regions],
      "All Region"
    );

    renderAnnualChart(distributor, "All Segment", "All Region");

    // Attach change listeners for dynamic chart update
    annualSegmentSelect.on("change", () => {
      renderAnnualChart(
        annualDistributorSelect.property("value"),
        annualSegmentSelect.property("value"),
        annualRegionSelect.property("value")
      );
    });

    annualRegionSelect.on("change", () => {
      renderAnnualChart(
        annualDistributorSelect.property("value"),
        annualSegmentSelect.property("value"),
        annualRegionSelect.property("value")
      );
    });
  }

  annualDistributorSelect.on("change", triggerAnnualUpdate);
  triggerAnnualUpdate();

  function update() {
    const selectedDistributor = distributorSelect.property("value");
    const selectedRegStatus = regStatusSelect.property("value");
    const approvalDate = new Date(approvalInput.property("value"));
    const campaignDate = new Date(campaignInput.property("value"));
    const useCampaign = hasCampaignCheckbox.property("checked");

    if (useCampaign && campaignDate > approvalDate) {
      alert("Campaign Date must be on or before Approval Date.");
      return;
    }

    const filtered = applyFilters(data, {
      Distributor: selectedDistributor,
      "Reg Status": selectedRegStatus
    }, d => {
      const approval = d["Approval Date Raw"];
      return approval &&
        approval <= approvalDate &&
        (!useCampaign || approval >= campaignDate);
    });

    d3.select("#summary").html(`
      <p>Distributor: <strong>${selectedDistributor}</strong></p>
      <p>Reg Status: <strong>${selectedRegStatus === "All" ? "Any" : selectedRegStatus}</strong></p>
      <p>Campaign Date from: <strong>${useCampaign ? formatDate(campaignDate) : "Not Used"}</strong></p>
      <p>Approval Date up to: <strong>${formatDate(approvalDate)}</strong></p>
      <p>Total DREG Entries: <strong>${filtered.length}</strong></p>
      <button id="downloadDREGsCsv">Download Filtered CSV</button>
    `);

    d3.select("#downloadDREGsCsv").on("click", () => {
      downloadCSV(filtered, `DREGs_${selectedDistributor}_${selectedRegStatus}.csv`);
    });

    const breakdownDim = d3.select("#breakdownSelect").property("value");
    const breakdownData = d3.rollups(filtered, v => v.length, d => d[breakdownDim])
      .map(([key, Count]) => ({ key: key || 'N/A', Count }))
      .sort((a, b) => d3.descending(a.Count, b.Count));

    const breakdownDreg = d3.select("#dregBreakdownChart").html("");
    const breakdownCard = breakdownDreg.append("div").attr("class", "map-card");
    breakdownCard.append("h3").attr("class", "map-title").text(`DREGs by ${breakdownDim}`);
    breakdownCard.append("div").attr("id", "dregBreakdownChartInner");
    renderBarChart({
      containerId: "dregBreakdownChartInner",
      data: breakdownData,
      xKey: "key",
      yKey: "Count",
      tooltipLabel: "DREGs"
    });

    // Render revenue breakdown chart below DREGs histogram
    const revenueBreakdownData = d3.rollups(
      filtered,
      v => d3.sum(v, d => +d["DREG Rev 3y"] || 0),
      d => d[breakdownDim]
    )
      .map(([key, Count]) => ({ key: key || 'N/A', Count }))
      .sort((a, b) => d3.descending(a.Count, b.Count));

    const breakdownRevenue = d3.select("#revenueBreakdownChart").html("");
    const revBreakCard = breakdownRevenue.append("div").attr("class", "map-card");
    revBreakCard.append("h3").attr("class", "map-title").text(`Revenue by ${breakdownDim} (3y)`);
    revBreakCard.append("div").attr("id", "revenueBreakdownChartInner");
    renderBarChart({
      containerId: "revenueBreakdownChartInner",
      data: revenueBreakdownData,
      xKey: "key",
      yKey: "Count",
      tooltipLabel: "Total Revenue (3y)",
      formatLabelFn: val => d3.format(".3~s")(val).replace("G", "B")
    });

    d3.select("#breakdownSelect").on("change", update);

    const container = d3.select("#results").html("");
    container.append("h3").text("Disti's DREGs by Region Resale Customer");

    renderGroupedTables({
      container,
      groupedData: d3.group(filtered, d => d["Region Resale Customer"]),
      columns: [
        "Subregion Resp", "Country Resale Customer", "Resale Customer",
        "Segment", "Market Segment", "Market Application", "DIV", "PL",
        "Project Status", "Reg Status", "Registration Date", "Approval Date", "DREG Rev 3y"
      ],
      groupLabelPrefix: '',
      distributor: selectedDistributor,
      defaultCollapsed: true
    });

    const segmentContainer = container.append("div").style("margin-top", "40px");
    segmentContainer.append("h3").text("Disti's DREGs by Segment");

    const segmentList = [...new Set(filtered.map(d => d.Segment))].sort();
    // Segment dropdown: use helper for consistency and maintainability
    const segmentSelect = segmentContainer.append("label")
      .text("Select Segment: ")
      .append("select")
      .attr("id", "segmentDropdown");
    populateDropdown(segmentSelect, segmentList, segmentList[0]);

    const segmentTableWrapper = segmentContainer.append("div").attr("id", "segmentTable").style("margin-top", "2px");

    function renderSelectedSegmentTable() {
      segmentTableWrapper.html("");
      const selectedSegment = d3.select("#segmentDropdown").property("value");
      const segmentFiltered = filtered.filter(d => d.Segment === selectedSegment);

      renderGroupedTables({
        container: segmentTableWrapper,
        groupedData: d3.group(segmentFiltered, d => d.Segment),
        columns: [
          "Subregion Resp", "Region Resale Customer", "Country Resale Customer",
          "Resale Customer", "Market Segment", "Market Application", "DIV", "PL",
          "Project Status", "Reg Status", "Registration Date", "Approval Date", "DREG Rev 3y"
        ],
        groupLabelPrefix: '',
        distributor: selectedDistributor,
        defaultCollapsed: true
      });
    }

    d3.select("#segmentDropdown").on("change", renderSelectedSegmentTable);
    renderSelectedSegmentTable();
  }

  function updateChoroplethMap() {
    const metric = mapMetricSelect.property("value");
    const startYear = +mapStartYearSelect.property("value");
    const endYear = +mapEndYearSelect.property("value");

    const filtered = data.filter(d =>
      d["Approval Date Raw"] instanceof Date &&
      !isNaN(d["Approval Date Raw"]) &&
      d["Approval Date Raw"].getFullYear() >= startYear &&
      d["Approval Date Raw"].getFullYear() <= endYear
    );

    const countryNameAliases = {
      "KOREA, REPUBLIC OF": "South Korea",
      "UNITED STATES": "United States",
      "VIET NAM": "Vietnam",
      "TAIWAN": "Taiwan",
      "COSTA RICA": "Costa Rica",
      "CROATIA": "Croatia",
      "SLOVAKIA": "Slovakia",
    };

    const grouped = d3.rollups(
      filtered,
      metric === "Revenue"
        ? v => d3.sum(v, d => +d["DREG Rev 3y"] || 0)
        : v => v.length,
      d => d["Country Resale Customer"]
    )
      .map(([country, value]) => ({
        country: countryNameAliases[country] || country,
        value
      }))
      .filter(d => !!d.country);

    renderChoroplethMap({
      containerId: "regionalMap",
      data: grouped,
      metricLabel: metric === "Revenue" ? "Total Revenue (3y)" : "DREG Count"
    });

    // Top 10 countries by metric value
    const topCountries = grouped
      .filter(d => d.value > 0)
      .sort((a, b) => d3.descending(a.value, b.value))
      .slice(0, 10);

    // Wrap Top 10 Countries bar chart in a card container
    const chartContainer = d3.select("#topCountriesChart").html("");
    const card = chartContainer.append("div").attr("class", "map-card");
    card.append("h3")
      .attr("class", "map-title")
      .text("Top 10 Countries by " + (metric === "Revenue" ? "Total Revenue (3y)" : "DREG Count"));

    card.append("div")
      .attr("id", "topCountriesBar");

    renderBarChart({
      containerId: "topCountriesBar",
      data: topCountries.map(d => ({ Country: d.country, Count: d.value })),
      xKey: "Country",
      yKey: "Count",
      tooltipLabel: metric === "Revenue" ? "Total Revenue (3y)" : "DREGs",
      formatLabelFn: val => d3.format(".3~s")(val).replace("G", "B")
    });
  }

  approvalInput.on("change", update);
  campaignInput.on("change", update);
  hasCampaignCheckbox.on("change", update);
  distributorSelect.on("change", update);
  regStatusSelect.on("change", update);

  mapMetricSelect.on("change", () => { updateChoroplethMap(); });
  mapStartYearSelect.on("change", () => { updateChoroplethMap(); renderAggregateCharts(); });
  mapEndYearSelect.on("change", () => { updateChoroplethMap(); renderAggregateCharts(); });

  update();
  updateChoroplethMap();
  renderAggregateCharts();
}
