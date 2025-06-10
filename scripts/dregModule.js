import { loadCSV, excelDateToDate, formatDate } from './loader.js';
import { applyFilters } from './filters.js';
import { renderGroupedTables } from './tables.js';
import { renderBarChart } from './charts.js';
import { downloadCSV } from './exporter.js';

export async function loadDregModule() {
  const data = await loadCSV('data/DistiDregs.csv', d => {
    d["Registration Date Raw"] = excelDateToDate(+d["Registration Date"]);
    d["Approval Date Raw"] = excelDateToDate(+d["Approval Date"]);
    d["Registration Date"] = formatDate(d["Registration Date Raw"]);
    d["Approval Date"] = formatDate(d["Approval Date Raw"]);
    return d;
  });

  const distributorSelect = d3.select("#distributorSelect");
  const regStatusSelect = d3.select("#regStatusSelect");
  const approvalInput = d3.select("#approvalDate");
  const campaignInput = d3.select("#campaignDate");
  const hasCampaignCheckbox = d3.select("#hasCampaignDate");

  distributorSelect.selectAll("option")
    .data([...new Set(data.map(d => d.Distributor))].sort())
    .enter().append("option").text(d => d);

  regStatusSelect.selectAll("option")
    .data(["All", ...new Set(data.map(d => d["Reg Status"]))].sort())
    .enter().append("option").text(d => d);

  function renderDistributorBarChart() {
    const counts = d3.rollups(data, v => v.length, d => d.Distributor)
      .map(([Distributor, Count]) => ({ Distributor, Count }))
      .sort((a, b) => d3.descending(a.Count, b.Count));

    renderBarChart({
      containerId: "distributorBarChart",
      data: counts,
      xKey: "Distributor",
      yKey: "Count",
      tooltipLabel: "DREGs",
      onClickBar: (d) => {
        distributorSelect.property("value", d.Distributor);
        update();
      }
    });
  }

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

    let filtered = applyFilters(data, {
      Distributor: selectedDistributor,
      "Reg Status": selectedRegStatus
    }, d => {
      const approval = d["Approval Date Raw"];
      if (!approval) return false;
      return approval <= approvalDate && (!useCampaign || approval >= campaignDate);
    });

    d3.select("#summary").html(`
      <h2>Summary Metrics</h2>
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

    renderBarChart({
      containerId: 'dregBreakdownChart',
      data: breakdownData,
      xKey: 'key',
      yKey: 'Count',
      tooltipLabel: 'DREGs'
    });

    d3.select("#breakdownSelect").on("change", update);

    const container = d3.select("#results").html("");

    container.append("h2").text("Disti's DREGs by Region Resale Customer");

    renderGroupedTables({
      container,
      groupedData: d3.group(filtered, d => d["Region Resale Customer"]),
      columns: [
        "Subregion Resp", "Country Resale Customer", "Resale Customer",
        "Segment", "Market Segment", "Market Application", "DIV", "PL",
        "Project Status", "Reg Status", "Registration Date", "Approval Date"
      ],
      groupLabelPrefix: '',
      distributor: selectedDistributor,
      defaultCollapsed: true
    });

    const segmentContainer = container.append("div");
    segmentContainer.append("h2").text("Disti's DREGs by Segment");

    const segmentList = [...new Set(filtered.map(d => d.Segment))].sort();
    const segmentSelect = segmentContainer.append("label")
      .text("Select Segment: ")
      .append("select")
      .attr("id", "segmentDropdown");

    segmentSelect.selectAll("option")
      .data(segmentList)
      .enter()
      .append("option")
      .attr("value", d => d)
      .text(d => d);

    const segmentTableWrapper = segmentContainer.append("div").attr("id", "segmentTable");

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
          "Project Status", "Reg Status", "Registration Date", "Approval Date"
        ],
        groupLabelPrefix: '',
        distributor: selectedDistributor,
        defaultCollapsed: true
      });
    }

    d3.select("#segmentDropdown").on("change", renderSelectedSegmentTable);
    renderSelectedSegmentTable();
  }

  approvalInput.on("change", update);
  campaignInput.on("change", update);
  hasCampaignCheckbox.on("change", update);
  distributorSelect.on("change", update);
  regStatusSelect.on("change", update);

  renderDistributorBarChart();
  update();
}
