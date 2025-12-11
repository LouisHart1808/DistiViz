import { loadCSV, formatDate, downloadCSV, applyFilters, bindDropInput, setUploadStatus, formatBytes, DataStore, renderCacheControls } from './utils.js';
import { renderGroupedTables, renderBarChart, renderChoroplethMap } from './visuals.js';

async function ensureXLSX() {
  if (typeof XLSX !== 'undefined') return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load XLSX parser'));
    document.head.appendChild(s);
  });
}
let __dregDataCache = null;

async function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await ensureXLSX();
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: "array", dense: true, cellDates: true });
        const sheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === "data") || workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
        resolve(rawRows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Normalize headers and map to expected CSV columns
function normalizeHeader(h) {
  return (h || "")
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Convert raw rows from Excel "Data" sheet into the schema used by DistiDregs.csv
function transformDataRows(rawRows) {
  const headerMap = {
    "MAIN DISTRIBUTOR": "Distributor",
    "SUBREGION RESP": "Subregion Resp",
    "RESALE CUSTOMER": "Resale Customer",
    "REGION RESALE CUSTOMER": "Region Resale Customer",
    "COUNTRY RESALE CUSTOMER": "Country Resale Customer",
    "MARKET SEGMENT": "Market Segment",
    "MARKET APPLICATION": "Market Application",
    "DIV": "DIV",
    "PL": "PL",
    "SEGMENT": "Segment",
    "PROJECT STATUS": "Project Status",
    "REG STATUS": "Reg Status",
    "REGISTRATION DATE": "Registration Date",
    "APPROVAL DATE": "Approval Date",
    "DREG REV 3Y": "DREG Rev 3y"
  };

  const excelDateToJS = (val) => {
    if (val == null || val === '') return null;
    if (val instanceof Date && !isNaN(val)) return val;
    if (typeof val === 'number' && isFinite(val)) {
      const epoch = Date.UTC(1899, 11, 30);
      return new Date(epoch + Math.round(val * 86400000));
    }
    const s = String(val).trim();
    const iso = new Date(s);
    if (!isNaN(iso)) return iso;
    const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (m) {
      const dd = Number(m[1]), mm = Number(m[2]);
      const yyyy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return new Date(yyyy, mm - 1, dd);
    }
    return null;
  };

  // Helper to detect dummy values (only exact "DUMMY - DO NOT USE FOR TRACKING", case-insensitive)
  const isDummy = (v) => {
    if (v == null) return false;
    return String(v).trim().toUpperCase() === "DUMMY - DO NOT USE FOR TRACKING";
  };

  const transformed = [];
  for (const row of rawRows) {
    const out = {};
    // Precompute normalized keys for this row
    const normKeys = Object.fromEntries(Object.keys(row).map(k => [normalizeHeader(k), k]));
    // Map only the headers we know about
    for (const [srcNorm, destKey] of Object.entries(headerMap)) {
      const matchKey = normKeys[srcNorm];
      if (matchKey !== undefined && !(destKey in out)) {
        out[destKey] = row[matchKey];
      }
    }

    // Dates from Excel serial/string → real Date
    const apprRaw = excelDateToJS(out["Approval Date"]);
    const regRaw = excelDateToJS(out["Registration Date"]);
    out["Approval Date Raw"] = apprRaw;
    out["Registration Date Raw"] = regRaw;
    out["Approval Date"] = formatDate(apprRaw);
    out["Registration Date"] = formatDate(regRaw);

    // Require Main Distributor (renamed to Distributor)
    if (!out["Distributor"] || String(out["Distributor"]).trim() === '') continue;

    // Revenue normalization
    const rev = out["DREG Rev 3y"];
    out["DREG Rev 3y"] = typeof rev === 'number' ? rev : Number(String(rev).replace(/[, ]+/g, '')) || 0;

    // Region check: if Region column present, keep only exact AP
    const region = out["Region Resale Customer"];
    if (region != null) {
      const r = String(region).toUpperCase().trim();
      if (r !== "AP") continue;
    }

    // Drop dummy rows only if any field value (in selected headers) exactly equals "DUMMY - DO NOT USE FOR TRACKING" (case-insensitive)
    if (Object.values(out).some(isDummy)) continue;

    transformed.push(out);
  }
  return transformed;
}

// Try IndexedDB cache first, then fallback to file input or empty state
async function loadDregDataFromUploadOrCSV() {
  // 1) Try cache first
  try {
    const cached = await DataStore.get('dregs');
    if (cached && Array.isArray(cached.rows) && cached.rows.length) {
      return cached.rows;
    }
  } catch (e) {
    console.warn('DataStore.get(dregs) failed; continuing without cache', e);
  }

  // 2) Fallback to file input, if a file is already selected
  const fileInput = document.getElementById("dregExcelInput");
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const rawRows = await readExcelFile(fileInput.files[0]);
    return transformDataRows(rawRows);
  }

  // 3) Otherwise, no initial data
  return null;
}

export async function loadDregModule() {
  const excelInput = document.getElementById('dregExcelInput');
  const statusEl = document.getElementById('dregUploadStatus');
  const dropArea = document.querySelector('#regionalMapSection .upload-area');

  // Cache status/controls placeholder just under the status line (idempotent)
  let cacheUIEl = document.getElementById('dregsCacheUI');
  if (!cacheUIEl) {
    cacheUIEl = document.createElement('div');
    cacheUIEl.id = 'dregsCacheUI';
    statusEl?.parentNode?.insertBefore(cacheUIEl, statusEl.nextSibling);
  } else {
    cacheUIEl.innerHTML = '';
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      setUploadStatus(statusEl, { state: 'loading', filename: file.name, message: `Reading ${formatBytes(file.size)}…` });
      const rows = await readExcelFile(file);
      const rawCount = rows.length;
      const transformed = transformDataRows(rows);
      // Persist processed dataset for reuse across refresh/tab switching
      try { await DataStore.set('dregs', transformed, { source: 'dregExcel' }); }
      catch (e) { console.warn('Failed to persist dregs rows', e); }
      const finalCount = transformed.length;
      await init(transformed);
      setUploadStatus(statusEl, { state: 'ok', filename: file.name, message: `Parsed ${rawCount.toLocaleString()} rows → Loaded ${finalCount.toLocaleString()} unique rows.` });
      await renderCacheControls({ container: cacheUIEl, storeKey: 'dregs', onClear: () => {} });
    } catch (e) {
      console.error("Failed to process uploaded Excel:", e);
      setUploadStatus(statusEl, { state: 'err', filename: file?.name, message: e.message || 'Failed to parse Excel. Ensure a sheet named "Data" exists.' });
      alert("Failed to process the uploaded Excel. Please ensure the file contains a 'Data' sheet and required columns.");
    }
  }

  async function init(data) {
    // Cache and proceed with the original initialisation using `data`
    __dregDataCache = data;

    const distributorBarChart = d3.select("#distributorBarChart");
    const annualDistributorSelect = d3.select("#annualDistributorSelect");
    const annualSegmentSelect = d3.select("#annualSegmentSelect");
    const distributorSelect = d3.select("#distributorSelect");
    const regStatusSelect = d3.select("#regStatusSelect");
    const approvalInput = d3.select("#approvalDate");
    const campaignInput = d3.select("#campaignDate");
    const hasCampaignCheckbox = d3.select("#hasCampaignDate");
    const mapMetricSelect = d3.select("#mapMetricSelect");
    const mapStartYearSelect = d3.select("#mapStartYearSelect");
    const mapEndYearSelect = d3.select("#mapEndYearSelect");

    const dataArr = data;

    // Revenue normalization
    for (const d of dataArr) {
      d["DREG Rev 3y"] = typeof d["DREG Rev 3y"] === 'number' ? d["DREG Rev 3y"] : Number(String(d["DREG Rev 3y"]).replace(/[, ]+/g, '')) || 0;
    }

    const allYears = Array.from(new Set(dataArr
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
    if (allYears.length > 0) {
      populateDropdown(mapStartYearSelect, allYears, allYears[0]);
      populateDropdown(mapEndYearSelect, allYears, allYears[allYears.length - 1]);
    }

    // Populate distributor selects (from processed "Distributor" field)
    const distributorList = Array.from(new Set(dataArr.map(d => d.Distributor).filter(Boolean))).sort();
    if (distributorList.length) {
      populateDropdown(distributorSelect, distributorList, distributorList[0]);
      populateDropdown(annualDistributorSelect, distributorList, distributorList[0]);
    }

    // Populate Reg Status select (with "All" as the first option)
    const regStatusOptions = ["All", ...Array.from(new Set(dataArr.map(d => d["Reg Status"]).filter(Boolean))).sort()];
    populateDropdown(regStatusSelect, regStatusOptions, regStatusOptions[0]);

    // === Aggregate histograms (respect Start/End Year selection) ===
    function getYearFilteredData() {
      const startY = +mapStartYearSelect.property("value");
      const endY = +mapEndYearSelect.property("value");
      return dataArr.filter(d => {
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

    function renderAnnualChart(distributor, segment) {
      const filtered = dataArr.filter(d =>
        d.Distributor === distributor &&
        d["Approval Date Raw"] instanceof Date &&
        !isNaN(d["Approval Date Raw"]) &&
        (segment === "All Segment" || d.Segment === segment)
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

    // Update annual chart and repopulate segment dropdown when distributor changes
    function triggerAnnualUpdate() {
      const distributor = annualDistributorSelect.property("value");

      // Populate segment dropdown with "All Segment" + all unique segments
      const segments = Array.from(new Set(dataArr.map(d => d.Segment).filter(Boolean))).sort();
      populateDropdown(
        annualSegmentSelect,
        ["All Segment", ...segments],
        "All Segment"
      );

      renderAnnualChart(distributor, "All Segment");

      // Attach change listener for dynamic chart update
      annualSegmentSelect.on("change", () => {
        renderAnnualChart(
          annualDistributorSelect.property("value"),
          annualSegmentSelect.property("value")
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

      const filtered = applyFilters(dataArr, {
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
      container.append("h3").text("Disti's DREGs by Subregion");

      renderGroupedTables({
        container,
        groupedData: d3.group(filtered, d => d["Subregion Resp"]),
        columns: [
          "Country Resale Customer", "Resale Customer",
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
            "Subregion Resp", "Country Resale Customer",
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

      const filtered = dataArr.filter(d =>
        d["Approval Date Raw"] instanceof Date &&
        !isNaN(d["Approval Date Raw"]) &&
        d["Approval Date Raw"].getFullYear() >= startYear &&
        d["Approval Date Raw"].getFullYear() <= endYear
      );

      const countryNameAliases = {
        "KOREA, REPUBLIC OF": "SOUTH KOREA",
        "UNITED STATES": "UNITED STATES",
        "VIET NAM": "VIETNAM",
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

    // First render
    update();
    updateChoroplethMap();
    renderAggregateCharts();
    if (statusEl) setUploadStatus(statusEl, { state: 'ok', message: 'Dataset active' });
  }

  // Initial load: if a file is already selected, process it; otherwise show placeholder status
  try {
    const initialData = await loadDregDataFromUploadOrCSV();
    if (initialData && initialData.length) {
      await init(initialData);
      await renderCacheControls({
        container: cacheUIEl,
        storeKey: 'dregs',
        onClear: () => {
          // Wipe charts/tables and reset status when cache is cleared
          d3.select("#distributorBarChart").html("");
          d3.select("#annualDregsChart").html("");
          d3.select("#annualRevenueChart").html("");
          d3.select("#dregBreakdownChart").html("");
          d3.select("#revenueBreakdownChart").html("");
          d3.select("#topCountriesChart").html("");
          d3.select("#regionalMap").html("");
          setUploadStatus(statusEl, { state: 'idle', message: 'Cache cleared. Upload your DREG workbook to begin.' });
          renderCacheControls({ container: cacheUIEl, storeKey: 'dregs', onClear: () => {} });
        }
      });
      // Safe persistence call after initial load/persist (no broadcast/global Compare)
      try { await DataStore.set('dregs', initialData, { source: 'dregExcel' }); } catch (e) {}
    } else {
      if (statusEl) setUploadStatus(statusEl, { state: 'idle', message: 'Please upload your DREG Excel workbook to begin.' });
      await renderCacheControls({
        container: cacheUIEl,
        storeKey: 'dregs',
        onClear: () => {
          d3.select("#distributorBarChart").html("");
          d3.select("#annualDregsChart").html("");
          d3.select("#annualRevenueChart").html("");
          d3.select("#dregBreakdownChart").html("");
          d3.select("#revenueBreakdownChart").html("");
          d3.select("#topCountriesChart").html("");
          d3.select("#regionalMap").html("");
          setUploadStatus(statusEl, { state: 'idle', message: 'Cache cleared. Upload your DREG workbook to begin.' });
          renderCacheControls({ container: cacheUIEl, storeKey: 'dregs', onClear: () => {} });
        }
      });
      // Safe persistence call for empty state (no broadcast/global Compare)
      try { await DataStore.set('dregs', [], { source: 'dregExcel' }); } catch (e) {}
    }
  } catch (err) {
    console.error("Failed to load initial DREG data:", err);
    if (statusEl) setUploadStatus(statusEl, { state: 'err', message: 'Could not initialize. Upload a workbook to proceed.' });
  }

  // Bind drag & drop + input change to handle uploads
  if (dropArea && excelInput) {
    bindDropInput({ dropArea, fileInput: excelInput, onFile: handleFile });
  } else if (excelInput) {
    excelInput.addEventListener('change', (e) => handleFile(e.target.files?.[0]));
  }
}
