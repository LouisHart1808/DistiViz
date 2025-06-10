// DOM references
const navApps = document.getElementById('nav-apps');
const navDregs = document.getElementById('nav-dregs');
const appFilters = document.getElementById('app-filters');
const dregFilters = document.getElementById('dreg-filters');
const dregBreakdownSection = document.getElementById('dreg-breakdown-section');
const distributorBarChartContainer = document.getElementById('distributorBarChartContainer');

// Utility: Clear shared sections before module switch
function clearContent() {
  document.getElementById('summary').innerHTML = '';
  document.getElementById('barChart').innerHTML = '';
  document.getElementById('results').innerHTML = '';
  document.getElementById('dregBreakdownChart').innerHTML = '';
  document.getElementById('distributorBarChart').innerHTML = '';
}

// Navigation events
navApps.addEventListener('click', async (e) => {
  e.preventDefault();
  setActiveTab('apps');
  clearContent();
  const { loadAppModule } = await import('./appModule.js');
  loadAppModule(); // triggers app logic
});

navDregs.addEventListener('click', async (e) => {
  e.preventDefault();
  setActiveTab('dregs');
  clearContent();
  const { loadDregModule } = await import('./dregModule.js');
  loadDregModule(); // triggers dreg logic
});

// Set active tab and toggle sections
function setActiveTab(tab) {
  const isApp = tab === 'apps';
  navApps.classList.toggle('active', isApp);
  navDregs.classList.toggle('active', !isApp);
  appFilters.style.display = isApp ? 'block' : 'none';
  dregFilters.style.display = isApp ? 'none' : 'block';
  dregBreakdownSection.style.display = isApp ? 'none' : 'block';
  distributorBarChartContainer.style.display = isApp ? 'none' : 'block';
}

// Dark mode toggle
document.getElementById('darkModeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
});

// Auto-load apps module on page load
window.addEventListener('DOMContentLoaded', async () => {
  setActiveTab('apps');
  const { loadAppModule } = await import('./appModule.js');
  loadAppModule();
});
