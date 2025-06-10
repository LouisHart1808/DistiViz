export function renderGroupedTables({
  container, groupedData, columns, groupLabelPrefix = '', distributor = '', defaultCollapsed = true, colorByConfidence = false
}) {
  groupedData.forEach((rows, groupKey) => {
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
        import('./exporter.js').then(({ downloadCSV }) => {
          downloadCSV(rows, `${distributor}_${groupKey || 'N-A'}.csv`, columns);
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
      thead.selectAll("th").data(columns).enter().append("th").text(d => d);
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
