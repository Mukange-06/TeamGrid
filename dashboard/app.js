// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const API_BASE = 'http://localhost:3000';

const POLLUTANT_LABELS = {
  pm25:        'PM₂.₅',
  pm10:        'PM₁₀',
  no:          'NO',
  no2:         'NO₂',
  ozone:       'Ozone',
  benzene:     'Benzene',
  toluene:     'Toluene',
  xylene:      'Xylene',
  mp_xylene:   'm,p-Xylene',
  eth_benzene: 'Ethylbenzene',
  co:          'CO',
  nh3:         'NH₃',
  so2:         'SO₂',
};

const HEALTH_COLORS = {
  'Good':                           '#22c55e',
  'Moderate':                       '#eab308',
  'Unhealthy for Sensitive Groups': '#f97316',
  'Unhealthy':                      '#ef4444',
  'Hazardous':                      '#7c3aed',
};

const HEALTH_ORDER = [
  'Good',
  'Moderate',
  'Unhealthy for Sensitive Groups',
  'Unhealthy',
  'Hazardous',
];

const YEAR_PALETTE = [
  '#06b6d4', '#8b5cf6', '#22c55e', '#f59e0b',
  '#ef4444', '#ec4899', '#10b981', '#f97316',
  '#3b82f6', '#84cc16',
];

const MONTH_LABELS = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
const state = {
  pollutant:     'pm25',
  city:          'all',
  yearMin:       null,
  yearMax:       null,
  monthlyData:   [],
  stationData:   [],
  stationPage:   1,
  stationSearch: '',
  stationSort:   { col: 'pollution_rank', dir: 'asc' },
};

// ═══════════════════════════════════════════════════════════════
// CHART REGISTRY
// ═══════════════════════════════════════════════════════════════
const charts = {};

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function fmt(v, decimals = 2) {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(decimals);
}

function fmtBig(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function polLabel(key) {
  return POLLUTANT_LABELS[key] || key;
}

function healthColor(status) {
  return HEALTH_COLORS[status] || '#94a3b8';
}

function healthColorFromValue(value, pollutant) {
  const v = Number(value);
  if (pollutant === 'pm25') {
    if (v <= 12)    return HEALTH_COLORS['Good'];
    if (v <= 35.4)  return HEALTH_COLORS['Moderate'];
    if (v <= 55.4)  return HEALTH_COLORS['Unhealthy for Sensitive Groups'];
    if (v <= 150.4) return HEALTH_COLORS['Unhealthy'];
    return HEALTH_COLORS['Hazardous'];
  }
  if (pollutant === 'pm10') {
    if (v <= 54)  return HEALTH_COLORS['Good'];
    if (v <= 154) return HEALTH_COLORS['Moderate'];
    if (v <= 254) return HEALTH_COLORS['Unhealthy for Sensitive Groups'];
    if (v <= 354) return HEALTH_COLORS['Unhealthy'];
    return HEALTH_COLORS['Hazardous'];
  }
  // Generic fallback
  if (v <= 25)  return HEALTH_COLORS['Good'];
  if (v <= 75)  return HEALTH_COLORS['Moderate'];
  if (v <= 150) return HEALTH_COLORS['Unhealthy for Sensitive Groups'];
  if (v <= 300) return HEALTH_COLORS['Unhealthy'];
  return HEALTH_COLORS['Hazardous'];
}

function isDark() {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

function cc() {
  return {
    text:          isDark() ? '#e2e8f0'                : '#0f172a',
    muted:         isDark() ? '#94a3b8'                : '#64748b',
    grid:          isDark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    tooltipBg:     isDark() ? '#1e293b'                : '#ffffff',
    tooltipBorder: isDark() ? 'rgba(255,255,255,0.1)'  : 'rgba(0,0,0,0.1)',
    surface:       isDark() ? '#0f172a'                : '#ffffff',
  };
}

function tooltipOpts() {
  const c = cc();
  return {
    backgroundColor: c.tooltipBg,
    borderColor:     c.tooltipBorder,
    borderWidth:     1,
    titleColor:      c.text,
    bodyColor:       c.muted,
    padding:         10,
    cornerRadius:    6,
    displayColors:   true,
    boxWidth:        10,
    boxHeight:       10,
  };
}

function legendOpts(position = 'top') {
  return {
    position,
    labels: {
      color:    cc().muted,
      boxWidth:  12,
      boxHeight: 12,
      padding:   12,
      font:      { size: 11 },
    },
  };
}

function xScaleOpts(extra = {}) {
  return {
    grid:  { color: cc().grid },
    ticks: { color: cc().muted, font: { size: 11 } },
    ...extra,
  };
}

function yScaleOpts(extra = {}) {
  return {
    grid:  { color: cc().grid },
    ticks: { color: cc().muted, font: { size: 11 } },
    ...extra,
  };
}

// ═══════════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════════
async function fetchJSON(endpoint) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error(`[AQ] fetchJSON(${endpoint}):`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SKELETON / ERROR HELPERS
// ═══════════════════════════════════════════════════════════════
function unSkeleton(...ids) {
  ids.forEach(id => document.getElementById(id)?.classList.remove('skeleton'));
}

function showError(id, msg = '⚠ Failed to load data') {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('skeleton');
  if (!el.querySelector('.error-state')) {
    const div = document.createElement('div');
    div.className = 'error-state';
    div.textContent = msg;
    el.appendChild(div);
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — KPI CARDS
// ═══════════════════════════════════════════════════════════════
async function loadKPICards() {
  const data = await fetchJSON('/api/overview');
  unSkeleton('kpi-stations','kpi-readings','kpi-cities','kpi-hazardous','kpi-unhealthy');

  if (!data) {
    ['kpi-stations','kpi-readings','kpi-cities','kpi-hazardous','kpi-unhealthy']
      .forEach(id => showError(id));
    return;
  }

  document.getElementById('val-stations').textContent = fmtBig(data.totalStations);
  document.getElementById('val-readings').textContent  = fmtBig(data.totalReadings);
  document.getElementById('val-cities').textContent    = fmtBig(data.totalCities);

  const hazEl = document.getElementById('val-hazardous');
  hazEl.textContent = fmtBig(data.hazardousCount);
  if (Number(data.hazardousCount) > 0) hazEl.classList.add('badge-red');

  const unhEl = document.getElementById('val-unhealthy');
  unhEl.textContent = fmtBig(data.unhealthyCount);
  if (Number(data.unhealthyCount) > 0) unhEl.classList.add('badge-orange');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2A — REALTIME CHART
// ═══════════════════════════════════════════════════════════════
async function loadRealtimeChart() {
  const data = await fetchJSON('/api/realtime');
  unSkeleton('card-realtime');
  if (!data) { showError('card-realtime'); return; }

  const pol = state.pollutant;
  const rows = data
    .filter(d => d.pollutant === pol)
    .sort((a, b) => Number(b.avg_value) - Number(a.avg_value))
    .slice(0, 8);

  if (!rows.length) { showError('card-realtime', `No realtime data for ${polLabel(pol)}`); return; }

  destroyChart('realtime');
  const ctx = document.getElementById('chart-realtime').getContext('2d');

  charts['realtime'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(d => d.city),
      datasets: [
        {
          label:           `Avg ${polLabel(pol)}`,
          data:            rows.map(d => d.avg_value),
          backgroundColor: '#06b6d4',
          borderRadius:    4,
          borderSkipped:   false,
        },
        {
          label:           `Peak ${polLabel(pol)}`,
          data:            rows.map(d => d.peak_value),
          backgroundColor: 'rgba(239,68,68,0.75)',
          borderRadius:    4,
          borderSkipped:   false,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend:  legendOpts('top'),
        tooltip: tooltipOpts(),
      },
      scales: {
        x: xScaleOpts({ beginAtZero: true }),
        y: yScaleOpts(),
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2B — HOURLY PROFILE
// ═══════════════════════════════════════════════════════════════
async function loadHourlyChart() {
  const pol  = state.pollutant;
  const data = await fetchJSON(`/api/hourly-profile?pollutant=${pol}`);
  unSkeleton('card-hourly');
  if (!data) { showError('card-hourly'); return; }

  destroyChart('hourly');
  const ctx = document.getElementById('chart-hourly').getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, 'rgba(6,182,212,0.28)');
  grad.addColorStop(1, 'rgba(6,182,212,0)');

  charts['hourly'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => `${String(d.hour).padStart(2,'0')}:00`),
      datasets: [{
        label:                `${polLabel(pol)} avg`,
        data:                 data.map(d => d.avg_value),
        borderColor:          '#06b6d4',
        backgroundColor:      grad,
        tension:              0.4,
        fill:                 true,
        pointRadius:          3,
        pointHoverRadius:     6,
        pointBackgroundColor: '#06b6d4',
        borderWidth:          2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutCubic' },
      plugins: {
        legend:  { display: false },
        tooltip: tooltipOpts(),
      },
      scales: {
        x: xScaleOpts({ ticks: { color: cc().muted, font: { size: 10 }, maxRotation: 45 } }),
        y: yScaleOpts({ beginAtZero: true }),
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3A — MONTHLY TREND
// ═══════════════════════════════════════════════════════════════
async function loadMonthlyTrend() {
  const pol  = state.pollutant;
  const data = await fetchJSON(`/api/monthly-trend?pollutant=${pol}`);
  unSkeleton('card-monthly');
  if (!data) { showError('card-monthly'); return; }

  state.monthlyData = data;

  const years = [...new Set(data.map(d => Number(d.year)))].sort();
  if (!years.length) return;

  const dataMin = years[0];
  const dataMax = years[years.length - 1];

  const slMin = document.getElementById('year-min');
  const slMax = document.getElementById('year-max');

  slMin.min = dataMin; slMin.max = dataMax;
  slMax.min = dataMin; slMax.max = dataMax;

  if (!state.yearMin || state.yearMin < dataMin) state.yearMin = dataMin;
  if (!state.yearMax || state.yearMax > dataMax) state.yearMax = dataMax;

  slMin.value = state.yearMin;
  slMax.value = state.yearMax;
  document.getElementById('year-range-display').textContent =
    `${state.yearMin} – ${state.yearMax}`;

  renderMonthlyChart();
}

function renderMonthlyChart() {
  if (!state.monthlyData.length) return;

  const years = [...new Set(state.monthlyData.map(d => Number(d.year)))]
    .filter(y => y >= (state.yearMin || 0) && y <= (state.yearMax || 9999))
    .sort();

  const datasets = years.map((year, i) => {
    const byMonth = {};
    state.monthlyData
      .filter(d => Number(d.year) === year)
      .forEach(d => { byMonth[Number(d.month)] = Number(d.avg_value); });

    return {
      label:            String(year),
      data:             Array.from({ length: 12 }, (_, m) => byMonth[m + 1] ?? null),
      borderColor:      YEAR_PALETTE[i % YEAR_PALETTE.length],
      backgroundColor:  'transparent',
      tension:          0.35,
      pointRadius:      3,
      pointHoverRadius: 6,
      spanGaps:         true,
      borderWidth:      2,
    };
  });

  destroyChart('monthly');
  const ctx = document.getElementById('chart-monthly').getContext('2d');

  charts['monthly'] = new Chart(ctx, {
    type: 'line',
    data: { labels: MONTH_LABELS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend:  legendOpts('top'),
        tooltip: tooltipOpts(),
        zoom: {
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
          pan:  { enabled: true, mode: 'x' },
        },
      },
      scales: {
        x: xScaleOpts(),
        y: yScaleOpts({ beginAtZero: false }),
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3B — DAILY SPARKLINE
// ═══════════════════════════════════════════════════════════════
async function loadDailySparkline() {
  const pol  = state.pollutant;
  const data = await fetchJSON(`/api/daily-trend?pollutant=${pol}&days=30`);
  unSkeleton('card-daily');
  if (!data) { showError('card-daily'); return; }

  destroyChart('daily');
  const ctx = document.getElementById('chart-daily').getContext('2d');

  const labels = data.map(d => {
    const dt = new Date(d.date);
    return isNaN(dt) ? d.date : `${dt.getMonth() + 1}/${dt.getDate()}`;
  });

  charts['daily'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type:            'bar',
          label:           'Avg Value',
          data:            data.map(d => d.avg_value),
          backgroundColor: 'rgba(6,182,212,0.42)',
          borderColor:     'rgba(6,182,212,0.65)',
          borderWidth:     1,
          borderRadius:    2,
          order:           2,
        },
        {
          type:            'line',
          label:           'Peak Value',
          data:            data.map(d => d.peak_value),
          borderColor:     '#ef4444',
          backgroundColor: 'transparent',
          tension:         0.3,
          pointRadius:     2,
          pointHoverRadius: 5,
          borderWidth:     2,
          order:           1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend:  legendOpts('top'),
        tooltip: tooltipOpts(),
      },
      scales: {
        x: xScaleOpts({
          ticks: {
            color: cc().muted, font: { size: 9 },
            maxRotation: 45, autoSkip: true, maxTicksLimit: 12,
          },
        }),
        y: yScaleOpts({ beginAtZero: true }),
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4A — STATION TABLE
// ═══════════════════════════════════════════════════════════════
async function loadStationTable() {
  const data = await fetchJSON('/api/station-profile');
  unSkeleton('card-stations', 'card-health-donut');
  if (!data) { showError('card-stations'); showError('card-health-donut'); return; }

  state.stationData = data;
  populateCityDropdown(data);
  renderStationTable();
  renderHealthDonut(data);
}

function renderStationTable() {
  const { stationData, stationSearch, stationSort } = state;
  const PAGE_SIZE = 10;

  let rows = [...stationData];

  if (stationSearch) {
    const q = stationSearch.toLowerCase();
    rows = rows.filter(d =>
      (d.station_name || '').toLowerCase().includes(q) ||
      (d.city         || '').toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    const av  = a[stationSort.col];
    const bv  = b[stationSort.col];
    const dir = stationSort.dir === 'asc' ? 1 : -1;
    if (av == null) return  dir;
    if (bv == null) return -dir;
    if (typeof av === 'string') return dir * av.localeCompare(bv);
    return dir * (Number(av) - Number(bv));
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.stationPage = Math.min(state.stationPage, totalPages);
  const pageRows = rows.slice(
    (state.stationPage - 1) * PAGE_SIZE,
    state.stationPage * PAGE_SIZE
  );

  const COL_DEFS = [
    { key: 'pollution_rank', label: 'Rank' },
    { key: 'station_name',   label: 'Station' },
    { key: 'city',           label: 'City' },
    { key: 'state',          label: 'State' },
    { key: 'avg_value',      label: 'Avg Value' },
    { key: 'reading_count',  label: 'Readings' },
    { key: 'health_status',  label: 'Health' },
  ];

  const thead = COL_DEFS.map(({ key, label }) => {
    const active = stationSort.col === key;
    const cls    = `sortable${active ? ` ${stationSort.dir === 'asc' ? 'sort-asc' : 'sort-desc'}` : ''}`;
    return `<th class="${cls}" data-col="${key}">${label}</th>`;
  }).join('');

  const tbody = pageRows.length
    ? pageRows.map(d => `
        <tr>
          <td><strong>${d.pollution_rank ?? '—'}</strong></td>
          <td>${d.station_name ?? '—'}</td>
          <td>${d.city  ?? '—'}</td>
          <td>${d.state ?? '—'}</td>
          <td>${fmt(d.avg_value)}</td>
          <td>${d.reading_count ? Number(d.reading_count).toLocaleString() : '—'}</td>
          <td>
            <span class="health-badge" style="background:${healthColor(d.health_status)}">
              ${d.health_status ?? '—'}
            </span>
          </td>
        </tr>`
      ).join('')
    : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:1.5rem">
         No results found
       </td></tr>`;

  document.getElementById('station-table-wrap').innerHTML = `
    <table class="data-table">
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  `;

  document.querySelectorAll('#station-table-wrap .sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (state.stationSort.col === col) {
        state.stationSort.dir = state.stationSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.stationSort = { col, dir: 'asc' };
      }
      state.stationPage = 1;
      renderStationTable();
    });
  });

  renderPagination(state.stationPage, totalPages);
}

function renderPagination(page, total) {
  const wrap = document.getElementById('station-pagination');
  if (total <= 1) { wrap.innerHTML = ''; return; }

  const btns = [];

  if (page > 1)
    btns.push(`<button class="page-btn" data-page="${page - 1}">‹</button>`);

  const start = Math.max(1, page - 2);
  const end   = Math.min(total, page + 2);

  if (start > 1) {
    btns.push(`<button class="page-btn" data-page="1">1</button>`);
    if (start > 2) btns.push(`<span class="page-ellipsis">…</span>`);
  }

  for (let i = start; i <= end; i++) {
    btns.push(`<button class="page-btn${i === page ? ' active' : ''}" data-page="${i}">${i}</button>`);
  }

  if (end < total) {
    if (end < total - 1) btns.push(`<span class="page-ellipsis">…</span>`);
    btns.push(`<button class="page-btn" data-page="${total}">${total}</button>`);
  }

  if (page < total)
    btns.push(`<button class="page-btn" data-page="${page + 1}">›</button>`);

  wrap.innerHTML = btns.join('');
  wrap.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.stationPage = Number(btn.dataset.page);
      renderStationTable();
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4B — HEALTH STATUS DONUT
// ═══════════════════════════════════════════════════════════════
function renderHealthDonut(data) {
  const counts = {};
  data.forEach(d => {
    const s = d.health_status || 'Unknown';
    counts[s] = (counts[s] || 0) + 1;
  });

  const labels = HEALTH_ORDER.filter(l => counts[l]);
  const values = labels.map(l => counts[l]);
  const colors = labels.map(l => healthColor(l));
  const total  = data.length;

  destroyChart('health-donut');
  const ctx = document.getElementById('chart-health-donut').getContext('2d');

  charts['health-donut'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: colors,
        borderWidth:     2,
        borderColor:     cc().surface,
        hoverOffset:     8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      animation: { animateRotate: true, duration: 750 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:    cc().muted,
            boxWidth:  12,
            boxHeight: 12,
            padding:   10,
            font:      { size: 11 },
            generateLabels: chart => {
              const ds = chart.data;
              return ds.labels.map((label, i) => ({
                text:      `${label} (${ds.datasets[0].data[i]})`,
                fillStyle: ds.datasets[0].backgroundColor[i],
                hidden:    false,
                index:     i,
              }));
            },
          },
        },
        tooltip: {
          ...tooltipOpts(),
          callbacks: {
            label: ctx =>
              ` ${ctx.label}: ${ctx.raw} stations (${((ctx.raw / total) * 100).toFixed(1)}%)`,
          },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5A — POLLUTANT STATISTICS TABLE
// ═══════════════════════════════════════════════════════════════
async function loadPollutantStats() {
  const data = await fetchJSON('/api/pollutant-profile');
  unSkeleton('card-pollutant-stats', 'card-heatmap');
  if (!data) { showError('card-pollutant-stats'); showError('card-heatmap'); return; }

  renderPollutantStatsTable(data);
  renderCorrelationHeatmap(data);
}

function renderPollutantStatsTable(data) {
  let sortCol = 'pollutant';
  let sortDir = 'asc';

  const COLS = [
    { key: 'pollutant', label: 'Pollutant', str: true },
    { key: 'avg',       label: 'Avg' },
    { key: 'min',       label: 'Min' },
    { key: 'max',       label: 'Max' },
    { key: 'stddev',    label: 'Std Dev' },
    { key: 'p50',       label: 'P50 (Median)' },
    { key: 'p95',       label: 'P95' },
  ];

  function render() {
    const sorted = [...data].sort((a, b) => {
      const av  = a[sortCol];
      const bv  = b[sortCol];
      const dir = sortDir === 'asc' ? 1 : -1;
      const col = COLS.find(c => c.key === sortCol);
      if (col?.str) return dir * String(av).localeCompare(String(bv));
      return dir * (Number(av) - Number(bv));
    });

    const thead = COLS.map(({ key, label }) => {
      const active = sortCol === key;
      const cls    = `sortable${active ? ` ${sortDir === 'asc' ? 'sort-asc' : 'sort-desc'}` : ''}`;
      return `<th class="${cls}" data-col="${key}">${label}</th>`;
    }).join('');

    const tbody = sorted.map(d => `
      <tr>
        <td><span class="pollutant-tag">${polLabel(d.pollutant)}</span></td>
        <td>${fmt(d.avg)}</td>
        <td>${fmt(d.min)}</td>
        <td>${fmt(d.max)}</td>
        <td>${fmt(d.stddev)}</td>
        <td>${fmt(d.p50)}</td>
        <td>${fmt(d.p95)}</td>
      </tr>`
    ).join('');

    const wrap = document.getElementById('pollutant-stats-wrap');
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    `;

    wrap.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortCol = col; sortDir = 'asc'; }
        render();
      });
    });
  }

  render();
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5B — CORRELATION HEATMAP
// ═══════════════════════════════════════════════════════════════
function renderCorrelationHeatmap(data) {
  const CORR_COLS = [
    { key: 'corr_temp',     label: 'Temperature' },
    { key: 'corr_humidity', label: 'Humidity' },
    { key: 'corr_wind',     label: 'Wind Speed' },
  ];

  function corrBg(v) {
    const n = Number(v);
    if (isNaN(n)) return 'rgba(100,100,100,0.18)';
    const a = Math.abs(n);
    return n > 0
      ? `rgba(239,68,68,${0.12 + a * 0.78})`
      : `rgba(59,130,246,${0.12 + a * 0.78})`;
  }

  function corrFg(v) {
    const n = Number(v);
    if (isNaN(n)) return isDark() ? '#94a3b8' : '#64748b';
    return Math.abs(n) > 0.35 ? '#ffffff' : (isDark() ? '#e2e8f0' : '#1e293b');
  }

  const headerRow = CORR_COLS
    .map(c => `<th class="heatmap-col-header">${c.label}</th>`)
    .join('');

  const bodyRows = data.map(d => {
    const cells = CORR_COLS.map(c => {
      const v   = d[c.key];
      const num = Number(v);
      const txt = isNaN(num) ? '—' : num.toFixed(2);
      return `<td class="heatmap-cell"
                  style="background:${corrBg(v)};color:${corrFg(v)}"
                  title="${c.label} correlation: ${txt}">
                ${txt}
              </td>`;
    }).join('');
    return `<tr>
      <td class="heatmap-row-label">${polLabel(d.pollutant)}</td>
      ${cells}
    </tr>`;
  }).join('');

  document.getElementById('heatmap-wrap').innerHTML = `
    <table class="heatmap-table">
      <thead><tr><th class="heatmap-corner">Pollutant</th>${headerRow}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="heatmap-legend">
      <span style="color:#3b82f6;font-size:0.72rem;font-weight:700">−1</span>
      <div class="legend-bar"></div>
      <span style="color:#ef4444;font-size:0.72rem;font-weight:700">+1</span>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6A — CITY COMPARISON
// ═══════════════════════════════════════════════════════════════
async function loadCityComparison() {
  const data = await fetchJSON('/api/city-pollution');
  unSkeleton('card-city-compare');
  if (!data) { showError('card-city-compare'); return; }

  const pol = state.pollutant;
  const rows = data
    .filter(d => d.pollutant === pol)
    .sort((a, b) => Number(b.avg_value) - Number(a.avg_value))
    .slice(0, 10);

  if (!rows.length) { showError('card-city-compare', `No data for ${polLabel(pol)}`); return; }

  destroyChart('city-compare');
  const ctx = document.getElementById('chart-city-compare').getContext('2d');

  charts['city-compare'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(d => d.city),
      datasets: [{
        label:           `${polLabel(pol)} avg`,
        data:            rows.map(d => d.avg_value),
        backgroundColor: rows.map(d => healthColorFromValue(d.avg_value, pol) + 'cc'),
        borderColor:     rows.map(d => healthColorFromValue(d.avg_value, pol)),
        borderWidth:     1,
        borderRadius:    4,
        borderSkipped:   false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend:  { display: false },
        tooltip: {
          ...tooltipOpts(),
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} µg/m³`,
          },
        },
      },
      scales: {
        x: xScaleOpts({ beginAtZero: true }),
        y: yScaleOpts(),
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6B — SCATTER PLOTS
// ═══════════════════════════════════════════════════════════════
async function loadScatterPlots() {
  const pol  = state.pollutant;
  const data = await fetchJSON(`/api/weather-scatter?pollutant=${pol}`);
  unSkeleton('card-scatter');
  if (!data) { showError('card-scatter'); return; }

  const MAX_PTS = 600;
  const sample  = data.length > MAX_PTS
    ? data.filter((_, i) => i % Math.ceil(data.length / MAX_PTS) === 0)
    : data;

  function makeScatter(canvasId, xKey, xLabel, colour) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label:           `${xLabel} vs ${polLabel(pol)}`,
          data:            sample.map(d => ({ x: d[xKey], y: d.value })),
          backgroundColor: colour.replace('1)', '0.35)'),
          borderColor:     colour.replace('1)', '0.6)'),
          borderWidth:     0,
          pointRadius:     2.5,
          pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend:  { display: false },
          tooltip: {
            ...tooltipOpts(),
            callbacks: {
              label: ctx =>
                ` ${xLabel}: ${fmt(ctx.parsed.x, 1)}, ${polLabel(pol)}: ${fmt(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: xScaleOpts({
            title: {
              display: true,
              text:    xLabel,
              color:   cc().muted,
              font:    { size: 10 },
            },
          }),
          y: yScaleOpts({
            title: {
              display: true,
              text:    polLabel(pol),
              color:   cc().muted,
              font:    { size: 10 },
            },
          }),
        },
      },
    });
  }

  makeScatter('chart-scatter-temp', 'at_c',   'Temp (°C)', 'rgba(6,182,212,1)');
  makeScatter('chart-scatter-wind', 'ws_m_s', 'Wind m/s',  'rgba(139,92,246,1)');
}

// ═══════════════════════════════════════════════════════════════
// URL SYNC
// ═══════════════════════════════════════════════════════════════
function updateURL() {
  const p = new URLSearchParams();
  if (state.pollutant !== 'pm25') p.set('pollutant', state.pollutant);
  if (state.city      !== 'all')  p.set('city',      state.city);
  const q = p.toString();
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}

function readURL() {
  const p = new URLSearchParams(location.search);
  if (p.has('pollutant')) state.pollutant = p.get('pollutant');
  if (p.has('city'))      state.city      = p.get('city');
}

// ═══════════════════════════════════════════════════════════════
// CITY DROPDOWN POPULATION
// ═══════════════════════════════════════════════════════════════
function populateCityDropdown(stationData) {
  const cities = [...new Set(stationData.map(d => d.city).filter(Boolean))].sort();
  const sel    = document.getElementById('city-select');

  const existing = new Set([...sel.options].map(o => o.value));
  cities.forEach(city => {
    if (!existing.has(city)) {
      const opt       = document.createElement('option');
      opt.value       = city;
      opt.textContent = city;
      sel.appendChild(opt);
    }
  });

  sel.value = state.city;
}

// ═══════════════════════════════════════════════════════════════
// POLLUTANT-SPECIFIC RE-FETCH GROUP
// ═══════════════════════════════════════════════════════════════
async function reloadPollutantCharts() {
  await Promise.all([
    loadRealtimeChart(),
    loadHourlyChart(),
    loadMonthlyTrend(),
    loadDailySparkline(),
    loadScatterPlots(),
    loadCityComparison(),
  ]);
}

// ═══════════════════════════════════════════════════════════════
// FILTER HANDLERS
// ═══════════════════════════════════════════════════════════════
function bindFilters() {
  document.getElementById('pollutant-select').addEventListener('change', async function () {
    state.pollutant = this.value;
    updateURL();
    await reloadPollutantCharts();
  });

  document.getElementById('city-select').addEventListener('change', function () {
    state.city = this.value;
    updateURL();
  });

  document.getElementById('station-search').addEventListener('input', function () {
    state.stationSearch = this.value.trim();
    state.stationPage   = 1;
    renderStationTable();
  });

  // Year range sliders
  const slMin = document.getElementById('year-min');
  const slMax = document.getElementById('year-max');
  const disp  = document.getElementById('year-range-display');

  function onSlider() {
    let yMin = Number(slMin.value);
    let yMax = Number(slMax.value);
    if (yMin > yMax) {
      if (this === slMin) yMax = yMin;
      else                yMin = yMax;
      slMin.value = yMin;
      slMax.value = yMax;
    }
    state.yearMin = yMin;
    state.yearMax = yMax;
    disp.textContent = `${yMin} – ${yMax}`;
    renderMonthlyChart();
  }

  slMin.addEventListener('input', onSlider);
  slMax.addEventListener('input', onSlider);

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const html      = document.documentElement;
    const isDarkNow = html.getAttribute('data-theme') !== 'light';
    html.setAttribute('data-theme', isDarkNow ? 'light' : 'dark');
    document.querySelector('.theme-icon').textContent = isDarkNow ? '☀️' : '🌙';
    // Rebuild all charts so colours refresh
    reloadPollutantCharts();
    loadPollutantStats();
  });
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
  // 1. Read URL state first
  readURL();

  // 2. Sync selects to state
  const polSel = document.getElementById('pollutant-select');
  polSel.value = state.pollutant;

  // 3. Bind all filters
  bindFilters();

  // 4. Load everything in parallel where possible
  await Promise.all([
    loadKPICards(),
    loadStationTable(),    // also loads health donut + populates city dropdown
    loadPollutantStats(),  // also loads correlation heatmap
    reloadPollutantCharts(),
  ]);
}

document.addEventListener('DOMContentLoaded', init);