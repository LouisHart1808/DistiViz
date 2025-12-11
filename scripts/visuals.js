/**
 * Tooltip utility functions
 */
function showTooltip(html, x, y) {
  const tooltip = d3.select("#tooltip");
  tooltip.style("display", "block")
    .html(html)
    .style("left", (x + 10) + "px")
    .style("top", (y - 30) + "px");
}

function hideTooltip() {
  d3.select("#tooltip").style("display", "none");
}

/**
 * Render a bar chart using D3
 */
export function renderBarChart({ containerId, data, xKey, yKey, tooltipLabel, onClickBar, formatLabelFn = null }) {
  const width = 1000;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 120, left: 75 };

  // Early return if data is empty
  if (!data.length) {
    d3.select(`#${containerId}`).html('');
    d3.select(`#${containerId}`)
      .append("svg")
      .attr("width", 1000)
      .attr("height", 120)
      .append("text")
      .attr("x", 500)
      .attr("y", 60)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .text("No data available.");
    return;
  }

  d3.select(`#${containerId}`).html('');
  const svg = d3.select(`#${containerId}`)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleBand()
    .domain(data.map(d => d[xKey]))
    .range([margin.left, width - margin.right])
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[yKey]) || 0])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .style("font-size", "12px");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  svg.selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", d => x(d[xKey]))
    .attr("y", height - margin.bottom)
    .attr("width", x.bandwidth())
    .attr("height", 0)
    .attr("fill", "steelblue")
    .on("mouseover", (event, d) => {
      showTooltip(
        `<strong>${d[xKey]}</strong><br/>${tooltipLabel}: ${d3.format(",")(d[yKey])}`,
        event.pageX,
        event.pageY
      );
    })
    .on("mousemove", event => {
      d3.select("#tooltip")
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 30) + "px");
    })
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      if (onClickBar) onClickBar(d);
    })
    .transition()
    .duration(500)
    .attr("y", d => y(d[yKey]))
    .attr("height", d => height - margin.bottom - y(d[yKey]));

  const formatWithB = val => d3.format(".3~s")(val).replace("G", "B");

  svg.selectAll("text.label")
    .data(data)
    .enter()
    .append("text")
    .attr("class", containerId === 'revenueBarChart' ? "label bar-label-revenue" : "label bar-label")
    .attr("x", d => x(d[xKey]) + x.bandwidth() / 2)
    .attr("y", d => y(d[yKey]) - 8)
    .attr("text-anchor", "middle")
    .text(d => formatLabelFn ? formatLabelFn(d[yKey]) : formatWithB(d[yKey]))
    .style("font-size", "12px");
}

/**
 * Render expandable, grouped data tables with pagination
 */
export function renderGroupedTables({
  container,
  groupedData,
  columns,
  groupLabelPrefix = '',
  distributor = '',
  defaultCollapsed = true,
  colorByConfidence = false
}) {
  // Early return if groupedData is empty or has no rows
  if (!groupedData || groupedData.size === 0 || Array.from(groupedData.values()).flat().length === 0) {
    container.append("p")
      .style("padding", "12px")
      .style("font-size", "15px")
      .text("No matching data to display.");
    return;
  }

  groupedData.forEach((rows, groupKey) => {
    let currentSortColumn = null;
    let currentSortOrder = 'asc';
    const expander = container.append("div").attr("class", "expander");

    const headerRow = expander.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "space-between")
      .style("flex-wrap", "nowrap")
      .style("width", "100%");

    const headerLeft = headerRow.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("gap", "10px")
      .style("flex", "1");

    headerLeft.append("h3")
      .text(groupLabelPrefix + (groupKey || "N/A"))
      .style("margin", "0")
      .on("click", function () {
        const tableContainer = this.parentNode.parentNode.nextElementSibling;
        tableContainer.classList.toggle("collapsed");
        tableContainer.classList.toggle("expanded");
      });

    const headerRight = headerRow.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("gap", "10px");

    headerRight.append("button")
      .text("Download CSV")
      .on("click", () => {
        import('./utils.js').then(({ downloadCSV }) => {
          const cleanGroup = (groupKey || 'N-A').replace(/[^a-z0-9_\-]/gi, '_');
          const cleanDist = (distributor || 'disti').replace(/[^a-z0-9_\-]/gi, '_');
          downloadCSV(rows, `${cleanDist}_${cleanGroup}.csv`, columns);
        });
      });

    const rowsPerPageSelect = headerRight.append("select").style("margin", "0");
    [10, 20, 50, "All"].forEach(num => {
      rowsPerPageSelect.append("option")
        .attr("value", num)
        .text(num === "All" ? "All" : `${num} rows`);
    });

    const tableContainer = expander.append("div")
      .attr("class", `table-container ${defaultCollapsed ? 'collapsed' : 'expanded'}`);

    let currentPage = 0;
    let rowsPerPage = getRowsPerPage();

    function getRowsPerPage() {
      const val = rowsPerPageSelect.property("value");
      return val === "All" ? "All" : +val;
    }

    function renderTable() {
      tableContainer.html("");
      const table = tableContainer.append("table");
      const thead = table.append("thead").append("tr");
      thead.selectAll("th")
        .data(columns)
        .enter()
        .append("th")
        .style("cursor", "pointer")
        .html(d => {
          const isSorted = d === currentSortColumn;
          const arrow = isSorted ? (currentSortOrder === 'asc' ? '▲' : '▼') : '';
          return `${d} <span class="sort-icon">${arrow}</span>`;
        })
        .on("click", function (event, d) {
          if (currentSortColumn === d) {
            currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
          } else {
            currentSortColumn = d;
            currentSortOrder = 'asc';
          }

          const isNumeric = displayedRows.some(row => !isNaN(+row[d]));
          rows.sort((a, b) => {
            const valA = isNumeric ? +a[d] : (a[d] || '').toString().toLowerCase();
            const valB = isNumeric ? +b[d] : (b[d] || '').toString().toLowerCase();
            if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
            return 0;
          });

          renderTable();
        });
      const tbody = table.append("tbody");

      let displayedRows = rows;
      if (rowsPerPage !== "All") {
        const start = currentPage * rowsPerPage;
        const end = start + rowsPerPage;
        displayedRows = rows.slice(start, end);
      }

      displayedRows.forEach(row => {
        const tr = tbody.append("tr");
        columns.forEach(col => {
          const cell = tr.append("td").text(row[col] || "");
          if (colorByConfidence && col === "Confidence") {
            const score = +row[col];
            cell.style("background-color",
              score >= 80 ? "#7acc7a" :
              score >= 40 ? "#ffb84d" :
              score >= 10 ? "#e53e3e" :
              "#f0f0f0"
            );
          }
        });
      });

      if (rowsPerPage !== "All") {
        const pagination = tableContainer.append("div").style("margin-top", "8px");
        pagination.append("button")
          .text("Previous")
          .attr("disabled", currentPage === 0 ? true : null)
          .on("click", () => {
            if (currentPage > 0) {
              currentPage--;
              renderTable();
            }
          });

        pagination.append("span")
          .style("margin", "0 8px")
          .text(`Page ${currentPage + 1} of ${Math.ceil(rows.length / rowsPerPage)}`);

        pagination.append("button")
          .text("Next")
          .attr("disabled", currentPage >= Math.ceil(rows.length / rowsPerPage) - 1 ? true : null)
          .on("click", () => {
            if (currentPage < Math.ceil(rows.length / rowsPerPage) - 1) {
              currentPage++;
              renderTable();
            }
          });
      }
    }

    renderTable();

    rowsPerPageSelect.on("change", () => {
      rowsPerPage = getRowsPerPage();
      currentPage = 0;
      renderTable();
    });
  });
}

/**
 * Render a choropleth map to visualize DREG Count or Revenue by country
 * @param {Object} params
 * @param {string} params.containerId - The DOM element id to render into
 * @param {Array} params.data - Array of { country, value }
 * @param {string} params.metricLabel - Label for the metric ("DREG Count" or "Revenue")
 */
export async function renderChoroplethMap({ containerId, data, metricLabel }) {
  const width = 1000;
  const height = 500;

  const container = d3.select(`#${containerId}`).html('');

  const card = container.append("div").attr("class", "map-card");
  card.append("h3").text(metricLabel).attr("class", "map-title");

  if (!data.length) {
    card.append("p")
      .style("padding", "16px")
      .style("font-size", "16px")
      .text("No map data available for the selected filters.");
    return;
  }

  const svg = card.append("svg")
    .attr("width", width)
    .attr("height", height);

  const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json");
  const countries = topojson.feature(world, world.objects.countries).features;

  const projection = d3.geoMercator()
    .center([120, 0])        // center roughly Indonesia
    .scale(200)              // zoom in more
    .translate([width / 2, height / 2]);
  // Old fitExtent logic removed; scale/center handles zoom now

  const path = d3.geoPath().projection(projection);

  const minValue = d3.min(data, d => d.value);
  const maxValue = d3.max(data, d => d.value);
  const color = d3.scaleSequentialLog()
    .domain([Math.max(minValue, 1), maxValue])
    .interpolator(d3.interpolateYlOrRd)
    .clamp(true);

  const countryMap = new Map(data.map(d => [d.country.toUpperCase(), d.value]));
  if (!countryMap.has("UNITED STATES OF AMERICA") && countryMap.has("UNITED STATES")) {
    countryMap.set("UNITED STATES OF AMERICA", countryMap.get("UNITED STATES"));
  }
  const mapCountryNames = new Set(countries.map(d => d.properties.name.toUpperCase()));
  const unmatched = [...countryMap.keys()].filter(name => !mapCountryNames.has(name));
  console.warn("Countries in data not matched on map:", unmatched);

  // Filter to Asia–Pacific using centroid lon/lat bounds (handles antimeridian properly)
  const inAPBounds = (feature) => {
    const [lon, lat] = d3.geoCentroid(feature);
    const lon360 = lon < 0 ? lon + 360 : lon; // normalize to [0,360)
    return (lon360 >= 65 && lon360 <= 180) && (lat >= -50 && lat <= 40);
  };
  const apCountries = countries.filter(inAPBounds);

  svg.append("g")
    .selectAll("path")
    .data(apCountries)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("fill", d => {
      const name = d.properties.name.toUpperCase();
      return countryMap.has(name) ? color(countryMap.get(name)) : "#eee";
    })
    .attr("stroke", "#999")
    .attr("stroke-width", 1)
    .on("mouseover", function (event, d) {
      d3.select(this).transition().duration(150).attr("stroke-width", 2).attr("stroke", "#444");
      const name = d.properties.name.toUpperCase();
      const value = countryMap.get(name);
      if (value != null) {
        showTooltip(
          `<strong>${d.properties.name}</strong><br/>${metricLabel}: ${d3.format(",")(value).replace("G", "B")}`,
          event.pageX,
          event.pageY
        );
      }
    })
    .on("mousemove", event => {
      d3.select("#tooltip")
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 30) + "px");
    })
    .on("mouseout", function () {
      d3.select(this).transition().duration(150).attr("stroke-width", 1).attr("stroke", "#999");
      hideTooltip();
    });

  const legendWidth = 300;
  const legendHeight = 10;
  const legendSteps = 10;
  const stepDomain = d3.range(legendSteps + 1).map(i => 
    Math.max(minValue, 1) * Math.pow(maxValue / Math.max(minValue, 1), i / legendSteps)
  );

  const legendContainer = card.append("div").attr("class", "map-legend");

  const legendSvg = legendContainer.append("svg")
    .attr("width", legendWidth)
    .attr("height", 40);

  const defs = legendSvg.append("defs");
  const gradient = defs.append("linearGradient")
    .attr("id", "legend-gradient")
    .attr("x1", "0%").attr("x2", "100%")
    .attr("y1", "0%").attr("y2", "0%");

  gradient.selectAll("stop")
    .data(stepDomain)
    .enter().append("stop")
    .attr("offset", (d, i) => `${(i / legendSteps) * 100}%`)
    .attr("stop-color", d => color(d));

  legendSvg.append("rect")
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .attr("y", 0)
    .style("fill", "url(#legend-gradient)");

  const legendScale = d3.scaleLog()
    .domain([Math.max(minValue, 1), maxValue])
    .range([0, legendWidth]);

  const axis = d3.axisBottom(legendScale).ticks(5);
  if (metricLabel.includes("Revenue")) {
    axis.tickFormat(d => d3.format(".3~s")(d).replace("G", "B"));
  }

  legendSvg.append("g")
    .attr("transform", `translate(0, ${legendHeight})`)
    .call(axis)
    .selectAll("text").style("font-size", "10px");
}
