console.log("Applications module loaded!");

d3.csv("data/DistiApps.csv").then(data => {
  const regionSelect = d3.select("#regionSelect");
  const level3Select = d3.select("#level3Select");
  const scoreSlider = d3.select("#scoreSlider");
  let currentFiltered = [];

  const columns = [
    "ID",
    "System/Application Level III",
    "System/Application Level II",
    "Application List Light Application",
    "Lead DIV",
    "Confidence"
  ];

  // Populate Region dropdown
  const regions = Array.from(new Set(data.map(d => d.Region))).sort();
  regionSelect.selectAll("option")
    .data(regions)
    .enter()
    .append("option")
    .text(d => d);

  // Populate Level III dropdown
  const level3s = Array.from(new Set(data.map(d => d["System/Application Level III"]))).sort();
  level3Select.selectAll("option")
    .data(["All", ...level3s])
    .enter()
    .append("option")
    .text(d => d);

  // Update slider label
  scoreSlider.on("input", function () {
    d3.select("#scoreValue").text(this.value);
    update();
  });

  // Update on region/level changes
  regionSelect.on("change", update);
  level3Select.on("change", update);

  function update() {
    const selectedRegion = regionSelect.property("value");
    const selectedLevel3 = level3Select.property("value");
    const minScore = +scoreSlider.property("value");

    const filtered = data.filter(d =>
      d.Region === selectedRegion &&
      +d.Confidence > 0 &&
      +d.Confidence >= minScore &&
      (selectedLevel3 === "All" || d["System/Application Level III"] === selectedLevel3)
    );

    currentFiltered = filtered;

    const grouped = d3.group(filtered, d => d.Distributor);

    // Summary
    d3.select("#summary").html(`
      <h2>Summary Metrics</h2>
      <p>Distributors Displayed: ${grouped.size}</p>
      <p>Applications Matching: ${filtered.length}</p>
      <button id="downloadAllFilteredCsv">Download Filtered CSV</button>
    `);

    d3.select("#downloadAllFilteredCsv").on("click", () => {
      downloadCSV(currentFiltered, `Filtered_Data_${selectedRegion}.csv`);
    });

    // Bar Chart
    const counts = Array.from(grouped, ([Distributor, values]) => ({
      Distributor,
      Count: values.length
    }));
    renderBarChart(counts);

    // Results
    const container = d3.select("#results").html("<h2>Filtered Application Tables by Distributor</h2>");
    grouped.forEach((rows, distributor) => {
      const expander = container.append("div").attr("class", "expander");

      const headerRow = expander.append("div")
        .style("display", "flex")
        .style("align-items", "center")
        .style("gap", "10px");

      headerRow.append("h3").text(distributor).style("flex", "1").on("click", function () {
        const tableContainer = this.parentNode.nextElementSibling;
        tableContainer.classList.toggle("collapsed");
        tableContainer.classList.toggle("expanded");
      });

      headerRow.append("button")
        .text("Download CSV")
        .on("click", () => {
          downloadCSV(rows, `${distributor}_${selectedRegion}.csv`);
        });

      const rowsPerPageSelect = headerRow.append("select").style("margin-left", "auto");
      [10, 20, 50, "All"].forEach(num => {
        rowsPerPageSelect.append("option")
          .attr("value", num)
          .text(num === "All" ? "All" : `${num} rows`);
      });

      const tableContainer = expander.append("div")
        .attr("class", "table-container expanded");

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
            const td = tr.append("td").text(row[col] || "");
            if (col === "Confidence") {
              const score = +row[col];
              td.style("background-color",
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
    if (dataRows.length === 0) {
      alert("No data to download.");
      return;
    }
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

  function renderBarChart(counts) {
    const width = 1000;
    const height = 350;
    const margin = { top: 10, right: 20, bottom: 60, left: 50 };

    let svg = d3.select("#barChart svg");
    if (svg.empty()) {
      svg = d3.select("#barChart").append("svg").attr("width", width).attr("height", height);
    }

    const x = d3.scaleBand()
      .domain(counts.map(d => d.Distributor))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(counts, d => d.Count) || 0])
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg.selectAll(".x-axis").data([null])
      .join("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .style("font-size", "12px");

    svg.selectAll(".y-axis").data([null])
      .join("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${margin.left},0)`)
      .transition().duration(500)
      .call(d3.axisLeft(y));

    const tooltip = d3.select("#tooltip");

    const bars = svg.selectAll("rect")
      .data(counts, d => d.Distributor);

    bars.exit()
      .transition().duration(500)
      .attr("y", height - margin.bottom)
      .attr("height", 0)
      .remove();

    bars.transition().duration(500)
      .attr("x", d => x(d.Distributor))
      .attr("y", d => y(d.Count))
      .attr("width", x.bandwidth())
      .attr("height", d => height - margin.bottom - y(d.Count));

    bars.enter()
      .append("rect")
      .attr("x", d => x(d.Distributor))
      .attr("y", height - margin.bottom)
      .attr("width", x.bandwidth())
      .attr("height", 0)
      .attr("fill", "steelblue")
      .on("mouseover", (event, d) => {
        tooltip.style("display", "block")
          .html(`<strong>${d.Distributor}</strong><br/>Applications: ${d.Count}`)
          .style("color", "#000");
      })
      .on("mousemove", event => {
        tooltip.style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 30) + "px");
      })
      .on("mouseout", () => {
        tooltip.style("display", "none");
      })
      .transition().duration(500)
      .attr("y", d => y(d.Count))
      .attr("height", d => height - margin.bottom - y(d.Count));
  }

  update();
});
