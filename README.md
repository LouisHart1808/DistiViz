# DistiViz

**DistiViz** is a modular, browser-based data visualization dashboard for exploring distributor-related data such as Application Insights and Design Registration (DREG) records. It is designed for internal use by business analysts, sales teams, and management to better understand distributor engagement, geographic trends, and revenue impact.

---

## Features

- Interactive tabbed interface for **Applications** and **DREGs**
- Multi-filtered dataset views by region, confidence score, distributor, and registration status
- Expandable tables grouped by distributor, segment, and resale region
- Custom bar charts with tooltip support
- Choropleth map for global DREG performance and revenue heatmaps
- CSV export capabilities
- Responsive layout with dark mode support

---

## Tech Stack

| Layer        | Technology       | Purpose                            |
|--------------|------------------|------------------------------------|
| Markup/Style | HTML5, CSS3       | Layout, design, and responsiveness |
| Logic        | JavaScript (ES Modules) | Modular, maintainable code      |
| Visualization| D3.js v7         | Charts, tables, maps               |
| Geo Rendering| TopoJSON v3      | Choropleth world map rendering     |
| Data         | CSV (local)      | Lightweight and easily editable    |

---

## Folder Structure
```bash
├── data/
│ ├── DistiApps.csv
│ └── DistiDregs.csv
├── scripts/
│ ├── appModule.js
│ ├── dregModule.js
│ ├── main.js
│ ├── utils.js
│ └── visuals.js
├── index.html
├── style.css
└── README.md
```
---

## Getting Started

1. **Download or clone the repository**
2. **Add the data files manually**
- Due to data confidentiality, the actual CSV datasets are excluded from the repository via .gitignore.
- To use the app locally, obtain the following files: DistiApps.csv, DistiDregs.csv. Place them in the /data/ folder in the root directory.
3. **Open `index.html` in VSCode**
4. **Go Live to run the project on localhost; the project has yet to be deployed**

---

## Deployment

You can host this project on any static site platform such as:
- GitHub Pages
- SharePoint Intranet
- NGINX/Apache (local or cloud)

No server or backend processing is needed.

---

## Notes

- 100% client-side; no data is sent to any server
- No login required
- No external API dependencies

---
