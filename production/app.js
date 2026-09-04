/* =========================================================
   PuppetStrings — App Logic
   FEC API calls, candidate search, Chart.js rendering
   ========================================================= */

const API_BASE = "https://api.open.fec.gov/v1";
const API_KEY = "TfZbtrW87TYCWwI6zkjOxSk0FO4nmkIhgxmfajdq"; // Replace with your key from https://api.data.gov/signup/

// ── DOM refs ──
const input = document.getElementById("candidate-input");
const searchBtn = document.getElementById("search-btn");
const suggestions = document.getElementById("search-suggestions");
const loader = document.getElementById("loader");
const errorBanner = document.getElementById("error-banner");
const dashboard = document.getElementById("dashboard");

// Chart instances (so we can destroy before re-rendering)
let charts = {};

// ── Helpers ──

async function fec(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  params.api_key = API_KEY;
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FEC API ${res.status}: ${res.statusText}`);
  return res.json();
}

function $(id) { return document.getElementById(id); }

function money(n) {
  if (n == null || isNaN(n)) return "—";
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function showError(msg) {
  errorBanner.textContent = msg;
  show(errorBanner);
}

// ── Chart.js global defaults ──
Chart.defaults.color = "#8888a4";
Chart.defaults.borderColor = "rgba(255,255,255,0.06)";
Chart.defaults.font.family = "'Inter', sans-serif";

const CHART_COLORS = [
  "#7c5cfc", "#00d4aa", "#3b82f6", "#f59e0b",
  "#e74c3c", "#8b5cf6", "#06b6d4", "#ec4899",
  "#84cc16", "#f97316", "#14b8a6", "#a855f7",
];

function destroyCharts() {
  Object.values(charts).forEach(c => c.destroy());
  charts = {};
}

// ── Search ──

let searchTimeout;

input.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  const q = input.value.trim();
  if (q.length < 2) { hide(suggestions); return; }
  searchTimeout = setTimeout(() => fetchSuggestions(q), 350);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    hide(suggestions);
    triggerSearch();
  }
});

searchBtn.addEventListener("click", () => {
  hide(suggestions);
  triggerSearch();
});

// Click outside closes suggestions
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-box")) hide(suggestions);
});

async function fetchSuggestions(q) {
  try {
    const data = await fec("/candidates/search/", { q, per_page: 8, sort: "-receipts" });
    renderSuggestions(data.results || []);
  } catch { /* silent */ }
}

function renderSuggestions(results) {
  if (!results.length) { hide(suggestions); return; }
  suggestions.innerHTML = results.map(c => `
    <div class="suggestion-item" data-id="${c.candidate_id}">
      <span class="name">${c.name}</span>
      <span class="detail">${c.party || ""} · ${c.office_full || ""} · ${c.state || ""}</span>
    </div>
  `).join("");
  show(suggestions);

  suggestions.querySelectorAll(".suggestion-item").forEach(el => {
    el.addEventListener("click", () => {
      hide(suggestions);
      loadCandidate(el.dataset.id);
    });
  });
}

function triggerSearch() {
  const q = input.value.trim();
  if (!q) return;
  // Do a search, pick the top result
  fec("/candidates/search/", { q, per_page: 1, sort: "-receipts" })
    .then(data => {
      if (data.results && data.results.length) {
        loadCandidate(data.results[0].candidate_id);
      } else {
        showError(`No candidates found for "${q}"`);
      }
    })
    .catch(() => showError("Search failed. Check your API key and try again."));
}

// ── Load Candidate Pipeline ──

async function loadCandidate(candidateId) {
  hide(dashboard);
  hide(errorBanner);
  show(loader);
  destroyCharts();

  try {
    // 1. Candidate info
    const candData = await fec(`/candidate/${candidateId}/`);
    const cand = candData.results[0];

    // 2. Committees
    const commData = await fec(`/candidate/${candidateId}/committees/`);
    const committee = commData.results.find(c => c.designation === "P") || commData.results[0];
    if (!committee) throw new Error("No committee found for this candidate.");
    const committeeId = committee.committee_id;

    // 3. Financial totals
    const totalsData = await fec(`/candidate/${candidateId}/totals/`);
    const totals = totalsData.results[0] || {};

    // 4. Parallel data fetches
    const [sizeData, stateData, employerData, pacData] = await Promise.all([
      fec("/schedules/schedule_a/by_size/", { committee_id: committeeId, cycle: 2024 }).catch(() => null),
      fec("/schedules/schedule_a/by_state/", { committee_id: committeeId, cycle: 2024, sort: "-total", per_page: 10 }).catch(() => null),
      fec("/schedules/schedule_a/by_employer/", { committee_id: committeeId, cycle: 2024, sort: "-total", per_page: 10 }).catch(() => null),
      fec("/schedules/schedule_a/", { committee_id: committeeId, two_year_transaction_period: 2024, contributor_type: "C", sort: "-contribution_receipt_amount", per_page: 10 }).catch(() => null),
    ]);

    // Render everything
    renderCandidateCard(cand, totals);
    renderSizeChart(sizeData);
    renderStateChart(stateData);
    renderEmployerChart(employerData);
    renderPacChart(pacData);

    hide(loader);
    show(dashboard);

    // Animate cards
    dashboard.querySelectorAll(".card").forEach((card, i) => {
      card.classList.remove("fade-in");
      void card.offsetWidth; // force reflow
      card.style.animationDelay = `${i * 0.1}s`;
      card.classList.add("fade-in");
    });

  } catch (err) {
    hide(loader);
    showError(err.message || "Something went wrong loading this candidate.");
    console.error(err);
  }
}

// ── Render: Candidate Info Card ──

function renderCandidateCard(cand, totals) {
  $("cand-name").textContent = cand.name;
  $("cand-office").textContent = cand.office_full || cand.office || "—";
  $("cand-state").textContent = cand.state || "—";
  $("cand-party").textContent = cand.party_full || cand.party || "—";
  $("cand-status").textContent = cand.incumbent_challenge_full || "—";

  $("stat-receipts").textContent = money(totals.receipts);
  $("stat-disbursements").textContent = money(totals.disbursements);
  $("stat-cash").textContent = money(totals.cash_on_hand_end_period);
  $("stat-debt").textContent = money(totals.debts_owed_by_committee);

  // Color the badge by party
  const badge = $("party-badge");
  const party = (cand.party || "").toUpperCase();
  if (party === "DEM") badge.style.background = "#3b82f6";
  else if (party === "REP") badge.style.background = "#e74c3c";
  else badge.style.background = "#8888a4";
}

// ── Render: Charts ──

const SIZE_LABELS = {
  0: "$1–$199",
  200: "$200–$499",
  500: "$500–$999",
  1000: "$1,000–$1,999",
  2000: "$2,000+",
};

function renderSizeChart(data) {
  const canvas = $("chart-size");
  if (!data || !data.results || !data.results.length) {
    canvas.parentElement.querySelector("h3").textContent = "Donation Size Breakdown (no data)";
    return;
  }
  const results = data.results;
  const labels = results.map(r => SIZE_LABELS[r.size] || `$${r.size}`);
  const values = results.map(r => r.total || 0);

  charts.size = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderWidth: 0,
        hoverOffset: 12,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "right", labels: { padding: 14, usePointStyle: true, pointStyle: "circle" } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${money(ctx.raw)}` } },
      },
    },
  });
}

function renderStateChart(data) {
  const canvas = $("chart-state");
  if (!data || !data.results || !data.results.length) return;
  const results = data.results.slice(0, 10);
  const labels = results.map(r => r.state);
  const values = results.map(r => r.total || 0);

  charts.state = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Contributions",
        data: values,
        backgroundColor: CHART_COLORS[1],
        borderRadius: 6,
        maxBarThickness: 44,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => money(ctx.raw) } },
      },
      scales: {
        x: { ticks: { callback: v => money(v) }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { grid: { display: false } },
      },
    },
  });
}

function renderEmployerChart(data) {
  const canvas = $("chart-employer");
  if (!data || !data.results || !data.results.length) return;
  const results = data.results.filter(r => r.employer && r.employer !== "NONE" && r.employer !== "N/A").slice(0, 10);
  const labels = results.map(r => truncate(r.employer, 28));
  const values = results.map(r => r.total || 0);

  charts.employer = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Contributions",
        data: values,
        backgroundColor: CHART_COLORS[2],
        borderRadius: 6,
        maxBarThickness: 44,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => money(ctx.raw) } },
      },
      scales: {
        x: { ticks: { callback: v => money(v) }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

function renderPacChart(data) {
  const canvas = $("chart-pac");
  if (!data || !data.results || !data.results.length) return;
  const results = data.results.slice(0, 10);
  const labels = results.map(r => truncate(r.committee_name || r.contributor_name || "Unknown", 32));
  const values = results.map(r => r.contribution_receipt_amount || 0);

  charts.pac = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Contribution Amount",
        data: values,
        backgroundColor: CHART_COLORS[3],
        borderRadius: 6,
        maxBarThickness: 44,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => money(ctx.raw) } },
      },
      scales: {
        x: { ticks: { callback: v => money(v) }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
