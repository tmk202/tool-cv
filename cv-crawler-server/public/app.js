const API = '';
let currentPage = 1;
let currentFilters = {};

async function api(path, options = {}) {
  const res = await fetch(API + path, options);
  return res.json();
}

async function loadStats() {
  const stats = await api('/api/stats');
  if (!stats.ok) return;
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-companies').textContent = stats.uniqueCompanies;
  document.getElementById('stat-platforms').textContent = (stats.platforms || []).length;
  document.getElementById('total-badge').textContent = `${stats.total} jobs`;

  const sel = document.getElementById('filter-platform');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">All platforms</option>';
  (stats.platforms || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.platform;
    opt.textContent = `${p.platformName || p.platform} (${p.count})`;
    sel.appendChild(opt);
  });
  sel.value = currentVal;
}

async function loadJobs(page = 1) {
  currentPage = page;
  const title = document.getElementById('filter-title').value.trim();
  const location = document.getElementById('filter-location').value.trim();
  const company = document.getElementById('filter-company').value.trim();
  const exclude = document.getElementById('filter-exclude').value.trim();
  const platform = document.getElementById('filter-platform').value;

  currentFilters = { title, location, company, exclude, platform };

  const params = new URLSearchParams({ page, limit: 20 });
  if (title) params.set('title', title);
  if (location) params.set('location', location);
  if (company) params.set('company', company);
  if (exclude) params.set('exclude', exclude);
  if (platform) params.set('platform', platform);

  const result = await api(`/api/jobs?${params}`);
  if (!result.ok) return;

  const container = document.getElementById('job-list');
  document.getElementById('result-count').textContent =
    `Showing ${result.jobs.length} of ${result.total} results`;

  if (result.jobs.length === 0) {
    container.innerHTML = '<div class="empty-state">No jobs found matching your filters</div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  container.innerHTML = result.jobs.map(job => `
    <div class="job-card">
      <div class="job-company">${esc(job.company)}</div>
      <div class="job-title">${esc(job.title)}</div>
      <div class="job-meta">
        <span>📍 ${esc(job.location)}</span>
        <span>💰 ${esc(job.salary)}</span>
        <span>📅 ${esc(job.postedDate)}</span>
        <span class="job-platform-badge">${job.platformName || job.platform}</span>
        ${job.url ? `<a href="${esc(job.url)}" target="_blank" class="job-url">🔗 Link</a>` : ''}
      </div>
    </div>
  `).join('');

  renderPagination(result.page, result.totalPages, result.total);
}

function renderPagination(page, totalPages, total) {
  const container = document.getElementById('pagination');
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  html += `<button ${page <= 1 ? 'disabled' : ''} onclick="loadJobs(${page - 1})">◀</button>`;

  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="${i === page ? 'active' : ''}" onclick="loadJobs(${i})">${i}</button>`;
  }

  html += `<button ${page >= totalPages ? 'disabled' : ''} onclick="loadJobs(${page + 1})">▶</button>`;
  container.innerHTML = html;
}

function esc(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

document.getElementById('btn-filter').addEventListener('click', () => loadJobs(1));
document.getElementById('btn-clear-filter').addEventListener('click', () => {
  document.getElementById('filter-title').value = '';
  document.getElementById('filter-location').value = '';
  document.getElementById('filter-company').value = '';
  document.getElementById('filter-exclude').value = '';
  document.getElementById('filter-platform').value = '';
  loadJobs(1);
});

['filter-title', 'filter-location', 'filter-company', 'filter-exclude'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') loadJobs(1);
  });
});

document.getElementById('btn-export-csv').addEventListener('click', () => {
  const params = new URLSearchParams(currentFilters);
  window.open(`/api/jobs/export?format=csv&${params}`, '_blank');
});

document.getElementById('btn-export-json').addEventListener('click', () => {
  const params = new URLSearchParams(currentFilters);
  window.open(`/api/jobs/export?format=json&${params}`, '_blank');
});

document.getElementById('btn-clear-jobs').addEventListener('click', async () => {
  if (!confirm('Xoá tất cả jobs?')) return;
  const result = await api('/api/jobs', { method: 'DELETE' });
  if (result.ok) {
    await loadStats();
    loadJobs(1);
  }
});

loadStats();
loadJobs(1);

setInterval(loadStats, 10000);
