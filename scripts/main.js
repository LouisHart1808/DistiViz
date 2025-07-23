const regionalMapSection = document.getElementById('regionalMapSection');
const navApps = document.getElementById('nav-apps');
const navDregs = document.getElementById('nav-dregs');
const appFilters = document.getElementById('app-filters');
const dregFilters = document.getElementById('dreg-filters');
const dregBreakdownSection = document.getElementById('dreg-breakdown-section');
const distributorBarChartContainer = document.getElementById('distributorBarChartContainer');

// Utility: Clear reusable sections
function clearContent() {
  document.getElementById('summary').innerHTML = '';
  document.getElementById('barChart').innerHTML = '';
  document.getElementById('results').innerHTML = '';
  document.getElementById('dregBreakdownChart').innerHTML = '';
  document.getElementById('distributorBarChart').innerHTML = '';
}

// Active tab logic
function setActiveTab(tab) {
  const navLinks = document.querySelectorAll(".navbar-container a");
  navLinks.forEach(link => link.classList.remove("active"));

  if (tab === 'apps') {
    navApps.classList.add("active");
    appFilters.style.display = 'block';
    dregFilters.style.display = 'none';
    dregBreakdownSection.style.display = 'none';
    distributorBarChartContainer.style.display = 'none';
    regionalMapSection.style.display = 'none';
  } else if (tab === 'dregs') {
    navDregs.classList.add("active");
    appFilters.style.display = 'none';
    dregFilters.style.display = 'block';
    dregBreakdownSection.style.display = 'block';
    distributorBarChartContainer.style.display = 'block';
    regionalMapSection.style.display = 'block';
  }
}

// Navbar tab events
navApps.addEventListener('click', async (e) => {
  e.preventDefault();
  setActiveTab('apps');
  clearContent();
  const { loadAppModule } = await import('./appModule.js');
  loadAppModule();
});

navDregs.addEventListener('click', async (e) => {
  e.preventDefault();
  setActiveTab('dregs');
  clearContent();
  const { loadDregModule } = await import('./dregModule.js');
  loadDregModule();
});

// Dark mode toggle
document.getElementById('darkModeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
});

// Load default tab on startup
window.addEventListener('DOMContentLoaded', async () => {
  setActiveTab('apps');
  const { loadAppModule } = await import('./appModule.js');
  loadAppModule();
});
