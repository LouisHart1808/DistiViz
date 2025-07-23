/**
 * Render a bar chart using D3
 */
export function renderBarChart({ containerId, data, xKey, yKey, tooltipLabel, onClickBar, formatLabelFn = null }) {
  const width = 1000;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 120, left: 75 };

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

  const tooltip = d3.select("#tooltip");

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
      tooltip.style("display", "block")
        .html(`<strong>${d[xKey]}</strong><br/>${tooltipLabel}: ${d[yKey]}`);
    })
    .on("mousemove", event => {
      tooltip.style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 30) + "px");
    })
    .on("mouseout", () => tooltip.style("display", "none"))
    .on("click", (event, d) => {
      if (onClickBar) onClickBar(d);
    })
    .transition()
    .duration(500)
    .attr("y", d => y(d[yKey]))
    .attr("height", d => height - margin.bottom - y(d[yKey]));

  svg.selectAll("text.label")
    .data(data)
    .enter()
    .append("text")
    .attr("class", containerId === 'revenueBarChart' ? "label bar-label-revenue" : "label bar-label")
    .attr("x", d => x(d[xKey]) + x.bandwidth() / 2)
    .attr("y", d => y(d[yKey]) - 8)
    .attr("text-anchor", "middle")
    .text(d => formatLabelFn ? formatLabelFn(d[yKey]) : d[yKey])
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
  groupedData.forEach((rows, groupKey) => {
    // Move sort state outside renderTable so it persists across re-renders
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

          // Sort rows based on column type
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
