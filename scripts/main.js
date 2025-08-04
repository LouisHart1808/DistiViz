// DOM references
const regionalMapSection = document.getElementById('regionalMapSection');
const navApps = document.getElementById('nav-apps');
const navDregs = document.getElementById('nav-dregs');
const appFilters = document.getElementById('app-filters');
const dregFilters = document.getElementById('dreg-filters');
const dregBreakdownSection = document.getElementById('dreg-breakdown-section');
const distributorBarChartContainer = document.getElementById('distributorBarChartContainer');
const topCountriesChartSection = document.getElementById("topCountriesChartSection");
const summary = document.getElementById("summary");
const barChart = document.getElementById("barChart");
const results = document.getElementById("results");
const dregBreakdownChart = document.getElementById("dregBreakdownChart");
const distributorBarChart = document.getElementById("distributorBarChart");

// Map tab identifiers to their corresponding module loaders and visibility rules
const tabConfig = {
  apps: {
    loader: () => import('./appModule.js').then(m => m.loadAppModule()),
    show: [appFilters],
    hide: [dregFilters, dregBreakdownSection, distributorBarChartContainer, regionalMapSection, topCountriesChartSection]
  },
  dregs: {
    loader: () => import('./dregModule.js').then(m => m.loadDregModule()),
    show: [dregFilters, dregBreakdownSection, distributorBarChartContainer, regionalMapSection, topCountriesChartSection],
    hide: [appFilters]
  }
};

/**
 * Clears all main content containers
 */
function clearContent() {
  summary.innerHTML = '';
  barChart.innerHTML = '';
  results.innerHTML = '';
  dregBreakdownChart.innerHTML = '';
  distributorBarChart.innerHTML = '';
}

/**
 * Set active tab and toggle visibility accordingly
 * @param {'apps' | 'dregs'} tab
 */
function setActiveTab(tab) {
  document.querySelectorAll(".navbar-container a").forEach(link => link.classList.remove("active"));
  document.getElementById(`nav-${tab}`).classList.add("active");

  tabConfig[tab].show.forEach(el => el.style.display = 'block');
  tabConfig[tab].hide.forEach(el => el.style.display = 'none');
}

// Attach tab navigation event listeners
Object.entries(tabConfig).forEach(([tab, config]) => {
  document.getElementById(`nav-${tab}`).addEventListener('click', async (e) => {
    e.preventDefault();
    setActiveTab(tab);
    clearContent();
    await config.loader();
  });
});

// Dark mode toggle
document.getElementById('darkModeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
});

// Load default tab on page load
window.addEventListener('DOMContentLoaded', async () => {
  setActiveTab('apps');
  await tabConfig.apps.loader();
});
