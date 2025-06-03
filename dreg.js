console.log("DREGs module loaded!");

d3.csv("data/DistiDregs.csv").then(data => {
  const distributorSelect = d3.select("#distributorSelect");
  const regStatusSelect = d3.select("#regStatusSelect");

  // Convert Excel dates to Date objects and formatted strings
  function excelDateToDate(serial) {
    if (!serial) return null;
    return new Date(Math.round((serial - 25569) * 86400 * 1000));
  }
  function dateToString(date) {
    if (!date) return "";
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  data.forEach(d => {
    d["Registration Date Raw"] = excelDateToDate(+d["Registration Date"]);
    d["Approval Date Raw"] = excelDateToDate(+d["Approval Date"]);
    d["Registration Date"] = dateToString(d["Registration Date Raw"]);
    d["Approval Date"] = dateToString(d["Approval Date Raw"]);
  });

  const distributors = Array.from(new Set(data.map(d => d.Distributor))).sort();
  distributorSelect.selectAll("option")
    .data(distributors)
    .enter()
    .append("option")
    .text(d => d);

  const regStatuses = Array.from(new Set(data.map(d => d["Reg Status"]))).sort();
  regStatusSelect.selectAll("option")
    .data(["All", ...regStatuses])
    .enter()
    .append("option")
    .text(d => d);

  // Insert Time Slider above breakdown histogram
  const dregBreakdownSection = d3.select("#dreg-breakdown-section");
  const timeSliderContainer = dregBreakdownSection.insert("div", ":first-child")
    .attr("id", "timeSliderContainer")
    .attr("class", "time-slider-container");

  timeSliderContainer.append("label")
    .text("Date Type:")
    .style("font-weight", "600");

  const dateTypeSelect = timeSliderContainer.append("select").attr("id", "dateTypeSelect");
  ["Registration Date", "Approval Date"].forEach(type => {
    dateTypeSelect.append("option").attr("value", type).text(type);
  });

  timeSliderContainer.append("label")
    .text("Up to:")
    .style("font-weight", "600");

  const minDate = d3.min(data, d => d["Registration Date Raw"] || d["Approval Date Raw"]);
  const maxDate = d3.max(data, d => d["Registration Date Raw"] || d["Approval Date Raw"]);

  const dateInput = timeSliderContainer.append("input")
    .attr("type", "date")
    .attr("id", "timeSlider")
    .attr("min", d3.timeFormat("%Y-%m-%d")(minDate))
    .attr("max", d3.timeFormat("%Y-%m-%d")(maxDate))
    .attr("value", d3.timeFormat("%Y-%m-%d")(maxDate));

  // Events
  dateInput.on("change", update);
  dateTypeSelect.on("change", update);

  distributorSelect.on("change", update);
  regStatusSelect.on("change", update);

  renderDistributorBarChart();

  function renderDistributorBarChart() {
    const counts = d3.rollups(data, v => v.length, d => d.Distributor)
      .map(([Distributor, Count]) => ({ Distributor, Count }))
      .sort((a, b) => d3.descending(a.Count, b.Count));

    const width = 1000;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 60, left: 50 };

    const svg = d3.select("#distributorBarChart")
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const x = d3.scaleBand()
      .domain(counts.map(d => d.Distributor))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(counts, d => d.Count) || 0])
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
      .data(counts)
      .enter()
      .append("rect")
      .attr("x", d => x(d.Distributor))
      .attr("y", height - margin.bottom)
      .attr("width", x.bandwidth())
      .attr("height", 0)
      .attr("fill", "steelblue")
      .on("mouseover", (event, d) => {
        tooltip.style("display", "block")
          .html(`<strong>${d.Distributor}</strong><br/>DREGs: ${d.Count}`);
      })
      .on("mousemove", event => {
        tooltip.style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 30) + "px");
      })
      .on("mouseout", () => {
        tooltip.style("display", "none");
      })
      .on("click", (event, d) => {
        distributorSelect.property("value", d.Distributor);
        update();
      })
      .transition()
      .duration(500)
      .attr("y", d => y(d.Count))
      .attr("height", d => height - margin.bottom - y(d.Count));
  }

  function update() {
    const selectedDistributor = distributorSelect.property("value");
    const selectedRegStatus = regStatusSelect.property("value");
    const selectedDateType = dateTypeSelect.property("value");
    const sliderDate = new Date(dateInput.property("value"));

    let filtered = data.filter(d => d.Distributor === selectedDistributor);
    if (selectedRegStatus !== "All") {
      filtered = filtered.filter(d => d["Reg Status"] === selectedRegStatus);
    }
    filtered = filtered.filter(d => {
      const entryDate = d[selectedDateType + " Raw"];
      return entryDate && entryDate <= sliderDate;
    });

    const grouped = d3.group(filtered, d => d["Region Resale Customer"]);
    d3.select("#summary").html(`
      <h2>Summary Metrics</h2>
      <p>Distributor: <strong>${selectedDistributor}</strong></p>
      <p>Reg Status: <strong>${selectedRegStatus === "All" ? "Any" : selectedRegStatus}</strong></p>
      <p>Date Filter: <strong>${selectedDateType} up to ${dateToString(sliderDate)}</strong></p>
      <p>Region Resale Customers: ${grouped.size}</p>
      <p>Total DREGs Entries: ${filtered.length}</p>
      <button id="downloadDREGsCsv">Download Filtered CSV</button>
    `);

    d3.select("#downloadDREGsCsv").on("click", () => {
      downloadCSV(filtered, `DREGs_${selectedDistributor}_${selectedRegStatus}.csv`);
    });

    renderBreakdownChart(filtered, d3.select("#breakdownSelect").property("value"));
    d3.select("#breakdownSelect").on("change", function () {
      renderBreakdownChart(filtered, this.value);
    });

    renderTables(filtered, grouped, selectedDistributor);
  }

  function renderBreakdownChart(filteredData, dimension) {
    d3.select("#dregBreakdownChart").html("");
    const counts = d3.rollups(filteredData, v => v.length, d => d[dimension])
      .map(([key, Count]) => ({ key: key || "N/A", Count }))
      .sort((a, b) => d3.descending(a.Count, b.Count));

    const width = 1000;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 80, left: 50 };

    const svg = d3.select("#dregBreakdownChart")
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const x = d3.scaleBand()
      .domain(counts.map(d => d.key))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(counts, d => d.Count) || 0])
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
      .data(counts)
      .enter()
      .append("rect")
      .attr("x", d => x(d.key))
      .attr("y", height - margin.bottom)
      .attr("width", x.bandwidth())
      .attr("height", 0)
      .attr("fill", "steelblue")
      .on("mouseover", (event, d) => {
        tooltip.style("display", "block")
          .html(`<strong>${d.key}</strong><br/>DREGs: ${d.Count}`);
      })
      .on("mousemove", event => {
        tooltip.style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 30) + "px");
      })
      .on("mouseout", () => {
        tooltip.style("display", "none");
      })
      .transition()
      .duration(500)
      .attr("y", d => y(d.Count))
      .attr("height", d => height - margin.bottom - y(d.Count));
  }

  function renderTables(filtered, grouped, selectedDistributor) {
    const container = d3.select("#results").html("<h2>DREGs by Region Resale Customer</h2>");
    const columns = [
      "Subregion Resp", "Country Resale Customer", "Resale Customer",
      "Market Segment", "Market Application",
      "DIV", "PL", "Segment", "Project Status", "Reg Status",
      "Registration Date", "Approval Date"
    ];
    grouped.forEach((rows, region) => {
      const expander = container.append("div").attr("class", "expander");
      const headerRow = expander.append("div")
        .style("display", "flex")
        .style("align-items", "center")
        .style("gap", "10px");
      headerRow.append("h3").text(region).style("flex", "1").on("click", function () {
        const tableContainer = this.parentNode.nextElementSibling;
        tableContainer.classList.toggle("collapsed");
        tableContainer.classList.toggle("expanded");
      });
      headerRow.append("button")
        .text("Download CSV")
        .on("click", () => {
          downloadCSV(rows, `${selectedDistributor}_${region}.csv`);
        });
      const rowsPerPageSelect = headerRow.append("select").style("margin-left", "auto");
      [10, 20, 50, "All"].forEach(num => {
        rowsPerPageSelect.append("option")
          .attr("value", num)
          .text(num === "All" ? "All" : `${num} rows`);
      });
      const tableContainer = expander.append("div").attr("class", "table-container collapsed");
      let currentPage = 0;
      let rowsPerPage = rowsPerPageSelect.property("value") === "All" ? rows.length : +rowsPerPageSelect.property("value");
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
            tr.append("td").text(row[col] || "");
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
      rowsPerPageSelect.on("change", function () {
        const val = this.value;
        if (val === "All") {
          rowsPerPage = "All";
        } else {
          rowsPerPage = +val;
          currentPage = 0;
        }
        renderTable();
      });
    });
  }

  function downloadCSV(dataRows, filename) {
    const columns = [
      "Subregion Resp", "Country Resale Customer", "Resale Customer",
      "Market Segment", "Market Application",
      "DIV", "PL", "Segment", "Project Status", "Reg Status",
      "Registration Date", "Approval Date"
    ];
    const csvRows = dataRows.map(row => columns.map(field => `"${row[field] || ""}"`).join(","));
    const csvContent = [columns.join(","), ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  update();
});
