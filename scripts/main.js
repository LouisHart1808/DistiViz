// -------------------------------
// Main entry: tab routing + module lazy-loading
// -------------------------------

// DOM references (defensive: elements may be absent in some tabs)

const regionalMapSection = document.getElementById('regionalMapSection');
const navApps = document.getElementById('nav-apps');
const navDregs = document.getElementById('nav-dregs');
const navCampaign = document.getElementById('nav-campaign');
const navCompare = document.getElementById('nav-compare');
const appFilters = document.getElementById('app-filters');
const dregFilters = document.getElementById('dreg-filters');
const dregBreakdownSection = document.getElementById('dreg-breakdown-section');
const distributorBarChartContainer = document.getElementById('distributorBarChartContainer');
const topCountriesChartSection = document.getElementById('topCountriesChartSection');
const campaignCheckerSection = document.getElementById('campaignCheckerSection');
const compareSection = document.getElementById('compareSection');

// shared visual containers
const summary = document.getElementById('summary');
const barChart = document.getElementById('barChart');
const results = document.getElementById('results');
const dregBreakdownChart = document.getElementById('dregBreakdownChart');
const distributorBarChart = document.getElementById('distributorBarChart');

// Utilities
const setDisplay = (el, value) => { if (el) el.style.display = value; };
const showAll = (nodes) => nodes.forEach(n => setDisplay(n, 'block'));
const hideAll = (nodes) => nodes.forEach(n => setDisplay(n, 'none'));

/**
 * Clear shared content containers to avoid cross-tab leftovers
 */
function clearContent() {
  if (summary) summary.innerHTML = '';
  if (barChart) barChart.innerHTML = '';
  if (results) results.innerHTML = '';
  if (dregBreakdownChart) dregBreakdownChart.innerHTML = '';
  if (distributorBarChart) distributorBarChart.innerHTML = '';
}

// Centralized tab configuration: which module to load + visibility rules
const tabConfig = {
  apps: {
    loader: () => import('./appModule.js').then(m => m.loadAppModule()),
    show: [appFilters],
    hide: [dregFilters, dregBreakdownSection, distributorBarChartContainer, regionalMapSection, topCountriesChartSection, campaignCheckerSection, compareSection]
  },
  dregs: {
    loader: () => import('./dregModule.js').then(m => m.loadDregModule()),
    show: [dregFilters, dregBreakdownSection, distributorBarChartContainer, regionalMapSection, topCountriesChartSection],
    hide: [appFilters, campaignCheckerSection, compareSection]
  },
  campaign: {
    loader: () => import('./campaignModule.js').then(m => m.loadCampaignModule()),
    show: [campaignCheckerSection],
    hide: [appFilters, dregFilters, dregBreakdownSection, distributorBarChartContainer, regionalMapSection, topCountriesChartSection, compareSection]
  },
  compare: {
    loader: () => import('./compareModule.js').then(m => {
      if (m && typeof m.refreshOptions === 'function') {
        m.refreshOptions();
      }
    }),
    show: [compareSection],
    hide: [appFilters, dregFilters, dregBreakdownSection, distributorBarChartContainer, regionalMapSection, topCountriesChartSection, campaignCheckerSection]
  }
};

/**
 * Set active tab and toggle visibility accordingly
 * @param {'apps' | 'dregs' | 'campaign' | 'compare'} tab
 */
function setActiveTab(tab) {
  // Nav active state (defensive: nav may not exist during early paint)
  document.querySelectorAll('.navbar-container a').forEach(link => link.classList.remove('active'));
  const activeLink = document.getElementById(`nav-${tab}`);
  if (activeLink) activeLink.classList.add('active');

  // Toggle sections visibility
  const { show = [], hide = [] } = tabConfig[tab] || {};
  hideAll(hide);
  showAll(show);

  // Persist selection and sync hash
  try { localStorage.setItem('activeTab', tab); } catch (_) {}
}

// Attach tab navigation listeners (apps/dregs/campaign/compare)
Object.keys(tabConfig).forEach(tab => {
  const link = document.getElementById(`nav-${tab}`);
  if (!link) return;
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
    setActiveTab(tab);
    clearContent();
    await tabConfig[tab].loader();
  });
});

// Dark mode toggle
const darkToggle = document.getElementById('darkModeToggle');
if (darkToggle) {
  darkToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    try { localStorage.setItem('prefersDark', document.body.classList.contains('dark-mode') ? '1' : '0'); } catch (_) {}
  });

  // Restore preference
  try {
    const pref = localStorage.getItem('prefersDark');
    if (pref === '1') document.body.classList.add('dark-mode');
  } catch (_) {}
}

// Deep-linking via URL hash + persistence fallback
function resolveInitialTab() {
  const hashTab = (location.hash || '').replace('#', '').trim();
  if (hashTab && tabConfig[hashTab]) return hashTab;
  try {
    const saved = localStorage.getItem('activeTab');
    if (saved && tabConfig[saved]) return saved;
  } catch (_) {}
  return 'apps';
}

// Handle back/forward navigation for tabs
window.addEventListener('hashchange', async () => {
  const tab = resolveInitialTab();
  setActiveTab(tab);
  clearContent();
  await tabConfig[tab].loader();
});

// Initial load
window.addEventListener('DOMContentLoaded', async () => {
  const tab = resolveInitialTab();
  setActiveTab(tab);
  await tabConfig[tab].loader();
});
