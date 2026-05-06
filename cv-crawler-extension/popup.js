let isCrawling = false;

document.addEventListener('DOMContentLoaded', async () => {
  await refreshStats();
  await detectCurrentPlatform();
  setupEventListeners();
});

async function sendMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || {});
    });
  });
}

async function sendToActiveTab(msg, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (!tabs.length) {
            resolve({ ok: false, error: 'No active tab' });
            return;
          }
          chrome.tabs.sendMessage(tabs[0].id, msg, response => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(response || { ok: true });
          });
        });
      });
      if (result.ok !== false || attempt === retries - 1) return result;
    } catch (e) {
      if (attempt === retries - 1) return { ok: false, error: e.message };
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { ok: false, error: 'Max retries exceeded' };
}

async function detectCurrentPlatform() {
  const platformNameEl = document.getElementById('platform-name');
  const platformIconEl = document.getElementById('platform-icon');
  const debugEl = document.getElementById('debug-info');

  const result = await sendToActiveTab({ type: 'PING' });
  if (result && result.platform) {
    const platform = getPlatformInfo(result.platform);
    platformNameEl.textContent = platform ? platform.name : result.platform;
    platformIconEl.textContent = '🌐';
    platformNameEl.style.color = '#1a73e8';
    if (debugEl) debugEl.textContent = '';
  } else if (result && result.isEmailSearch) {
    platformNameEl.textContent = 'Google Search';
    platformIconEl.textContent = '📧';
    platformNameEl.style.color = '#28a745';
  } else {
    platformNameEl.textContent = 'Không hỗ trợ';
    platformNameEl.style.color = '#999';
    platformIconEl.textContent = '🚫';
  }
  if (debugEl) { debugEl.textContent = ''; debugEl.style.display = 'none'; }

  const emailSection = document.getElementById('email-section');
  const emailCountBadge = document.getElementById('email-count-badge');
  const emailList = document.getElementById('email-list');

  if (result && result.isEmailSearch && result.emails && result.emails.length > 0) {
    emailSection.classList.remove('hidden');
    emailCountBadge.textContent = result.emailCount;
    emailList.innerHTML = result.emails.map(e => `<div>${escapeHtml(e)}</div>`).join('');
    window.__foundEmails = result.emails;

    const saveBtn = document.getElementById('btn-save-emails');
    const isBatch = result.url && result.url.includes('email tuyển dụng');
    if (isBatch) {
      saveBtn.textContent = '⏳ Auto-saving...';
      saveBtn.disabled = true;
      setTimeout(() => {
        saveBtn.textContent = '✅ Auto-saved';
        saveBtn.disabled = true;
        setTimeout(() => emailSection.classList.add('hidden'), 2000);
      }, 2000);
    }
  } else {
    emailSection.classList.add('hidden');
  }
}

function getPlatformInfo(id) {
  const platforms = {
    google: { name: 'Google Jobs' },
    topcv: { name: 'TopCV' },
    itviec: { name: 'ITViec' },
    vietnamworks: { name: 'VietnamWorks' },
    careerviet: { name: 'CareerViet' },
    vieclam24h: { name: 'ViecLam24h' },
    jobsgo: { name: 'JobsGo' },
    topdev: { name: 'TopDev' },
    glints: { name: 'Glints' }
  };
  return platforms[id] || null;
}

async function refreshStats() {
  const result = await sendMessage({ type: 'GET_STATS' });
  if (!result) return;

  document.getElementById('stat-total').textContent = result.total || 0;
  document.getElementById('stat-companies').textContent = result.uniqueCompanies || 0;
  document.getElementById('stat-platforms').textContent = Object.keys(result.platformCounts || {}).length || 0;
  document.getElementById('job-count').textContent = result.total || 0;

  const inputMax = document.getElementById('input-max-pages');
  if (result.settings && result.settings.maxPages) {
    inputMax.value = result.settings.maxPages;
  }

  renderJobList(result.jobs || []);
}

function renderJobList(jobs) {
  const container = document.getElementById('job-list');
  if (!jobs || jobs.length === 0) {
    container.innerHTML = '<div class="empty-state">Chưa có dữ liệu. Hãy vào trang tuyển dụng và bấm Start!</div>';
    return;
  }

  const recent = jobs.slice(-30).reverse();
  container.innerHTML = recent.map(job => `
    <div class="job-item" title="${escapeHtml(job.title)} - ${escapeHtml(job.company)}">
      <div class="job-company">${escapeHtml(job.company)}</div>
      <div class="job-title">${escapeHtml(job.title)}</div>
      <div class="job-meta">
        <span>${escapeHtml(job.location)}</span>
        <span>•</span>
        <span>${escapeHtml(job.salary)}</span>
        <span class="job-platform-badge">${job.platformName || job.platform}</span>
      </div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupEventListeners() {
  document.getElementById('btn-start').addEventListener('click', startCrawl);
  document.getElementById('btn-stop').addEventListener('click', stopCrawl);
  document.getElementById('btn-detect').addEventListener('click', detectCurrentPlatform);
  document.getElementById('btn-export-csv').addEventListener('click', () => exportData('csv'));
  document.getElementById('btn-export-json').addEventListener('click', () => exportData('json'));
  document.getElementById('btn-clear').addEventListener('click', clearData);
  document.getElementById('input-max-pages').addEventListener('change', saveSettings);
  document.getElementById('btn-send-server').addEventListener('click', sendToServer);
  document.getElementById('server-auto').addEventListener('change', saveServerSettings);
  document.getElementById('server-url').addEventListener('change', saveServerSettings);
  document.getElementById('btn-debug').addEventListener('click', dumpDebug);
  document.getElementById('btn-find-emails').addEventListener('click', findEmails);
  document.getElementById('btn-save-emails').addEventListener('click', saveFoundEmails);
  document.getElementById('btn-batch-start').addEventListener('click', startBatch);
  document.getElementById('btn-batch-stop').addEventListener('click', stopBatch);
  document.getElementById('supported-platforms').addEventListener('click', showPlatforms);
  loadServerSettings();
  updateBatchStatus();
}

async function loadServerSettings() {
  const data = await sendMessage({ type: 'GET_SETTINGS' });
  if (!data) return;
  if (data.serverUrl) document.getElementById('server-url').value = data.serverUrl;
  document.getElementById('server-auto').checked = data.serverAutoSend || false;
  updateServerStatus();
}

async function saveServerSettings() {
  const serverUrl = document.getElementById('server-url').value.trim();
  const serverAutoSend = document.getElementById('server-auto').checked;
  await sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: { serverUrl, serverAutoSend }
  });
  updateServerStatus();
}

function updateServerStatus() {
  const url = document.getElementById('server-url').value.trim();
  const el = document.getElementById('server-status');
  if (url) {
    el.textContent = url.includes('localhost') || url.includes('127.0.0.1') ? '🔴' : '⚪';
    el.className = 'server-status';
  } else {
    el.textContent = '⏹';
    el.className = 'server-status';
  }
}

async function sendToServer() {
  const serverUrl = document.getElementById('server-url').value.trim();
  if (!serverUrl) {
    showServerMsg('Nhập server URL trước!', 'error');
    return;
  }

  const result = await sendMessage({ type: 'GET_JOBS' });
  const jobs = (result && result.jobs) || [];
  if (jobs.length === 0) {
    showServerMsg('Không có dữ liệu để gửi!', 'error');
    return;
  }

  const btn = document.getElementById('btn-send-server');
  btn.disabled = true;
  btn.textContent = '⏳ Đang gửi...';
  showServerMsg(`Đang gửi ${jobs.length} jobs...`, 'sending');

  try {
    const response = await fetch(serverUrl + '/api/jobs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs })
    });
    const data = await response.json();
    if (data.ok) {
      showServerMsg(`✅ Đã gửi ${data.added} jobs (tổng: ${data.total})`, 'success');
    } else {
      showServerMsg('❌ ' + (data.error || 'Lỗi server'), 'error');
    }
  } catch (err) {
    showServerMsg('❌ Không kết nối được server: ' + err.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = '📤 Gửi';
}

function showServerMsg(text, type) {
  const el = document.getElementById('server-msg');
  el.textContent = text;
  el.className = 'server-msg ' + type;
  if (type === 'success') setTimeout(() => el.className = 'server-msg hidden', 5000);
}

async function autoSendToServer() {
  const data = await sendMessage({ type: 'GET_SETTINGS' });
  if (!data || !data.serverAutoSend || !data.serverUrl) return;

  const result = await sendMessage({ type: 'GET_JOBS' });
  const jobs = (result && result.jobs) || [];
  if (jobs.length === 0) return;

  try {
    const response = await fetch(data.serverUrl + '/api/jobs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs })
    });
    const result2 = await response.json();
    if (result2.ok) {
      console.log(`[CV Crawler] Auto-sent ${result2.added} jobs to server`);
    }
  } catch (err) {
    console.log('[CV Crawler] Auto-send failed:', err.message);
  }
}

async function startCrawl() {
  if (isCrawling) return;

  const maxPages = parseInt(document.getElementById('input-max-pages').value) || 5;

  const result = await sendToActiveTab({
    type: 'START_CRAWL',
    maxPages: maxPages
  });

  if (!result.ok) {
    alert(result.error || 'Không thể bắt đầu crawl. Hãy chắc chắn bạn đang ở trang tuyển dụng!');
    return;
  }

  isCrawling = true;
  updateUIForCrawling(true);

  const statusEl = document.getElementById('crawl-status');
  statusEl.classList.remove('hidden');
  document.getElementById('status-text').textContent = 'Đang crawl...';
}

async function stopCrawl() {
  await sendToActiveTab({ type: 'STOP_CRAWL' });
  isCrawling = false;
  updateUIForCrawling(false);
  document.getElementById('crawl-status').classList.add('hidden');
  await refreshStats();
}

function updateUIForCrawling(active) {
  document.getElementById('btn-start').disabled = active;
  document.getElementById('btn-stop').disabled = !active;
  document.getElementById('input-max-pages').disabled = active;
}

async function exportData(format) {
  const msg = format === 'csv' ? { type: 'EXPORT_CSV' } : { type: 'EXPORT_JSON' };
  const result = await sendMessage(msg);
  if (!result) {
    alert('Không có dữ liệu để export!');
  }
}

async function clearData() {
  if (!confirm('Xoá tất cả dữ liệu đã crawl?')) return;
  await sendMessage({ type: 'CLEAR_JOBS' });
  await refreshStats();
}

async function saveSettings() {
  const maxPages = parseInt(document.getElementById('input-max-pages').value) || 5;
  await sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: { maxPages }
  });
}

async function dumpDebug() {
  const result = await sendToActiveTab({ type: 'DUMP_DEBUG' });
  if (result && result.logged) {
    alert('Đã dump debug info ra Console (F12)');
  } else {
    alert('Không thể dump debug: ' + (result?.error || 'content script not found'));
  }
}

async function saveFoundEmails() {
  const emails = window.__foundEmails;
  if (!emails || emails.length === 0) {
    alert('Không có email để lưu!');
    return;
  }
  const serverUrl = document.getElementById('server-url').value.trim() || 'http://localhost:3000';

  try {
    const jobsRes = await fetch(serverUrl + '/api/jobs?limit=500', {
      headers: { 'Content-Type': 'application/json' }
    });
    const jobsData = await jobsRes.json();
    const companies = [...new Set((jobsData.jobs || []).map(j => j.company).filter(Boolean))];

    const pageText = document.body?.innerText?.toLowerCase() || '';
    const payload = emails.map(email => {
      let matchedCompany = '';
      for (const c of companies) {
        if (pageText.includes(c.toLowerCase())) {
          matchedCompany = c;
          break;
        }
      }
      return { email, company: matchedCompany || 'unknown', source: window.location.href };
    });

    const sendResult = await fetch(serverUrl + '/api/emails/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: payload })
    });
    const data = await sendResult.json();
    if (data.ok) {
      alert(`✅ Đã lưu ${data.added} emails mới (tổng: ${emails.length})`);
      document.getElementById('email-section').classList.add('hidden');
    } else {
      alert('❌ ' + (data.error || 'Lỗi server'));
    }
  } catch (err) {
    alert('❌ Lỗi kết nối server: ' + err.message);
  }
}

async function findEmails() {
  const result = await sendToActiveTab({ type: 'EXTRACT_EMAILS' });
  if (!result || !result.emails || result.emails.length === 0) {
    alert('Không tìm thấy email nào trên trang này!');
    return;
  }

  const serverUrl = document.getElementById('server-url').value.trim() || 'http://localhost:3000';
  const emails = result.emails;

  try {
    const response = await fetch(serverUrl + '/api/jobs', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const jobsData = await response.json();
    const companies = [...new Set((jobsData.jobs || []).map(j => j.company).filter(Boolean))];

    const payload = [];
    for (const email of emails) {
      let matchedCompany = '';
      for (const c of companies) {
        if (document.body.innerText.toLowerCase().includes(c.toLowerCase())) {
          matchedCompany = c;
          break;
        }
      }
      payload.push({
        email,
        company: matchedCompany || 'unknown',
        source: window.location.href
      });
    }

    const sendResult = await fetch(serverUrl + '/api/emails/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: payload })
    });
    const data = await sendResult.json();
    if (data.ok) {
      alert(`✅ Tìm thấy ${emails.length} emails, đã lưu ${data.added} emails mới!`);
    } else {
      alert('❌ ' + (data.error || 'Lỗi server'));
    }
  } catch (err) {
    alert('❌ Lỗi: ' + err.message);
  }
}

async function startBatch() {
  const serverUrl = document.getElementById('server-url').value.trim() || 'http://localhost:3000';

  const res = await fetch(serverUrl + '/api/companies');
  const data = await res.json();
  if (!data.ok || !data.companies) return alert('Không lấy được danh sách company!');

  const withoutEmail = data.companies.filter(c => c.emailCount === 0);
  if (withoutEmail.length === 0) return alert('Tất cả company đã có email!');

  const companyNames = withoutEmail.map(c => c.name);
  const result = await sendMessage({
    type: 'START_BATCH_EMAIL',
    companies: companyNames,
    serverUrl
  });

  if (!result || !result.ok) {
    alert('Lỗi khởi động batch: ' + (result?.error || 'Không kết nối được background service'));
    return;
  }

  document.getElementById('btn-batch-start').disabled = true;
  document.getElementById('btn-batch-stop').disabled = false;
  const statusEl = document.getElementById('batch-status');
  statusEl.classList.remove('hidden');
  document.getElementById('batch-status-text').textContent = `Đang xử lý 0/${result.total}...`;
  document.getElementById('batch-progress-fill').style.width = '0%';
  document.getElementById('batch-status-icon').textContent = '▶';
  pollBatchStatus();
}

async function stopBatch() {
  await sendMessage({ type: 'ABORT_BATCH' });
  document.getElementById('btn-batch-start').disabled = false;
  document.getElementById('btn-batch-stop').disabled = true;
  document.getElementById('batch-status').classList.add('hidden');
  document.getElementById('batch-status-icon').textContent = '⏹';
}

async function updateBatchStatus() {
  const result = await sendMessage({ type: 'GET_BATCH_STATUS' });
  if (!result) { setTimeout(pollBatchStatus, 2000); return; }

  if (result.total > 0) {
    document.getElementById('btn-batch-start').disabled = true;
    document.getElementById('btn-batch-stop').disabled = result.running ? false : true;
    const statusEl = document.getElementById('batch-status');
    statusEl.classList.remove('hidden');
    const pct = Math.round((result.done / result.total) * 100);
    document.getElementById('batch-progress-fill').style.width = pct + '%';

    if (result.done >= result.total) {
      document.getElementById('batch-status-text').textContent = `✅ Hoàn tất! ${result.done}/${result.total}`;
      document.getElementById('batch-progress-fill').style.width = '100%';
      document.getElementById('btn-batch-start').disabled = false;
      document.getElementById('btn-batch-stop').disabled = true;
      document.getElementById('batch-status-icon').textContent = '✅';
      setTimeout(() => statusEl.classList.add('hidden'), 5000);
      return;
    }

    document.getElementById('batch-status-text').textContent = `Đang xử lý ${result.done}/${result.total}...`;
    document.getElementById('batch-status-icon').textContent = '▶';
    setTimeout(pollBatchStatus, 2000);
  } else if (result.running === false && result.done > 0) {
    document.getElementById('batch-status-text').textContent = `✅ Hoàn tất! ${result.done} công ty`;
    document.getElementById('batch-progress-fill').style.width = '100%';
    document.getElementById('btn-batch-start').disabled = false;
    document.getElementById('btn-batch-stop').disabled = true;
    document.getElementById('batch-status-icon').textContent = '✅';
    const statusEl = document.getElementById('batch-status');
    statusEl.classList.remove('hidden');
    setTimeout(() => statusEl.classList.add('hidden'), 5000);
  }
}

function pollBatchStatus() {
  updateBatchStatus();
}

function showPlatforms(e) {
  e.preventDefault();
  const list = ['Google Jobs', 'TopCV', 'ITViec', 'VietnamWorks', 'CareerViet', 'ViecLam24h', 'JobsGo', 'TopDev', 'Glints'];
  alert('Hỗ trợ: ' + list.join(', '));
}

chrome.runtime.onMessage.addListener(async (message) => {
  switch (message.type) {
    case 'CRAWL_STATUS':
      document.getElementById('status-text').textContent = message.message || 'Đang crawl...';
      if (message.page && message.totalPages) {
        const pct = Math.round((message.page / message.totalPages) * 100);
        document.getElementById('progress-fill').style.width = pct + '%';
      }
      break;

    case 'CRAWL_DONE':
      isCrawling = false;
      updateUIForCrawling(false);
      document.getElementById('crawl-status').classList.add('hidden');
      document.getElementById('status-text').textContent = 'Hoàn tất!';
      document.getElementById('progress-fill').style.width = '100%';
      await refreshStats();
      await autoSendToServer();
      break;

    case 'CRAWL_BATCH':
      refreshStats();
      break;
  }
});
