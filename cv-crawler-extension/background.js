const DB_KEY = 'cv_crawler_data';

async function getStorage() {
  const result = await chrome.storage.local.get(DB_KEY);
  return result[DB_KEY] || { jobs: [], settings: { maxPages: 5 } };
}

async function setStorage(data) {
  await chrome.storage.local.set({ [DB_KEY]: data });
}

async function addJobs(newJobs, platform) {
  const data = await getStorage();
  const existingIds = new Set(data.jobs.map(j => j.id));
  const existingKeys = new Set(
    data.jobs.map(j => (j.title + '|' + j.company).toLowerCase())
  );

  let added = 0;
  for (const job of newJobs) {
    const key = (job.title + '|' + job.company).toLowerCase();
    if (!existingIds.has(job.id) && !existingKeys.has(key)) {
      data.jobs.push(job);
      existingIds.add(job.id);
      existingKeys.add(key);
      added++;
    }
  }

  await setStorage(data);
  return added;
}

async function clearJobs() {
  const data = await getStorage();
  data.jobs = [];
  await setStorage(data);
}

async function exportData(format) {
  const data = await getStorage();
  const jobs = data.jobs;
  if (jobs.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let content, filename, mimeType;

  if (format === 'csv') {
    const headers = ['Company', 'Title', 'Location', 'Salary', 'Platform', 'PostedDate', 'URL', 'CrawledAt'];
    const rows = jobs.map(j => [
      escapeCsv(j.company),
      escapeCsv(j.title),
      escapeCsv(j.location),
      escapeCsv(j.salary),
      j.platformName || j.platform,
      escapeCsv(j.postedDate),
      j.url,
      j.crawledAt
    ].join(','));
    content = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    filename = `cv-crawler-companies-${timestamp}.csv`;
    mimeType = 'text/csv';
  } else {
    content = JSON.stringify(jobs, null, 2);
    filename = `cv-crawler-companies-${timestamp}.json`;
    mimeType = 'application/json';
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.DOWNLOADS],
      justification: 'Export CSV/JSON files using Blob'
    });
  } catch (err) {
    if (!err.message.includes('already exists')) {
      return { ok: false, error: err.message };
    }
  }

  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: 'EXPORT_DOWNLOAD',
      content,
      filename,
      mimeType
    }, response => {
      chrome.offscreen.closeDocument().catch(() => {});
      resolve(response || { filename, count: jobs.length });
    });
  });
}

function escapeCsv(str) {
  if (!str) return '""';
  const s = String(str).replace(/"/g, '""');
  return `"${s}"`;
}

const BATCH_KEY = 'batch_state';
let _batchTabIds = new Set();

async function getBatch() {
  const data = await chrome.storage.session.get(BATCH_KEY);
  return data[BATCH_KEY] || { queue: [], done: 0, total: 0, serverUrl: 'http://localhost:3000' };
}

async function saveBatch(state) {
  await chrome.storage.session.set({ [BATCH_KEY]: state });
}

async function processBatchQueue() {
  const state = await getBatch();
  if (state.queue.length === 0) {
    console.log('[CV Crawler] batch complete:', state.done, '/', state.total);
    return;
  }
  const company = state.queue.shift();
  state.done++;
  await saveBatch(state);
  console.log('[CV Crawler] batch processing:', company, '(' + state.done + '/' + state.total + ')');
  try {
    const res = await fetch(state.serverUrl + '/api/companies/search-url?company=' + encodeURIComponent(company));
    const data = await res.json();
    if (data.ok && data.url) {
      const tab = await chrome.tabs.create({ url: data.url, active: false });
      _batchTabIds.add(tab.id);
    }
  } catch (err) {
    console.log('[CV Crawler] batch error:', company, err.message);
    setTimeout(() => processBatchQueue(), 500);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (_batchTabIds.has(tabId)) {
    _batchTabIds.delete(tabId);
    setTimeout(() => processBatchQueue(), 1000);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'PLATFORM_DETECTED':
      chrome.action.setBadgeText({ text: 'OK', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: sender.tab.id });
      sendResponse({ ok: true });
      break;

    case 'CRAWL_BATCH': {
      addJobs(message.jobs, message.platform).then(added => {
        chrome.action.setBadgeText({ text: String(added) });
      });
      sendResponse({ ok: true });
      break;
    }

    case 'CRAWL_STATUS':
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
      sendResponse({ ok: true });
      break;

    case 'CRAWL_DONE':
      chrome.action.setBadgeText({ text: String(message.totalJobs) });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      sendResponse({ ok: true });
      break;

    case 'GET_JOBS':
      getStorage().then(data => sendResponse({ jobs: data.jobs }));
      return true;

    case 'GET_STATS':
      getStorage().then(data => {
        const jobs = data.jobs;
        const companies = [...new Set(jobs.map(j => j.company.toLowerCase()))].length;
        const platforms = [...new Set(jobs.map(j => j.platform))];
        const platformCounts = {};
        platforms.forEach(p => { platformCounts[p] = jobs.filter(j => j.platform === p).length; });

        sendResponse({
          total: jobs.length,
          uniqueCompanies: companies,
          platformCounts,
          lastCrawl: jobs.length > 0 ? jobs[jobs.length - 1].crawledAt : null,
          settings: data.settings
        });
      });
      return true;

    case 'GET_SETTINGS':
      getStorage().then(data => {
        sendResponse(data.settings);
      });
      return true;

    case 'CLEAR_JOBS':
      clearJobs().then(() => {
        chrome.action.setBadgeText({ text: '' });
        sendResponse({ ok: true });
      });
      return true;

    case 'EXPORT_CSV':
      exportData('csv').then(result => sendResponse(result));
      return true;

    case 'EXPORT_JSON':
      exportData('json').then(result => sendResponse(result));
      return true;

    case 'UPDATE_SETTINGS':
      getStorage().then(data => {
        data.settings = { ...data.settings, ...message.settings };
        setStorage(data);
        sendResponse({ ok: true });
      });
      return true;

    case 'FORWARD_TO_TAB': {
      chrome.tabs.sendMessage(sender.tab.id, message.payload, response => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse(response);
      });
      return true;
    }

    case 'CLOSE_THIS_TAB':
      if (sender.tab?.id) {
        chrome.tabs.remove(sender.tab.id);
      }
      sendResponse({ ok: true });
      break;

    case 'START_BATCH_EMAIL': {
      const companies = message.companies || [];
      const st = { queue: [...companies], done: 0, total: companies.length, serverUrl: message.serverUrl || 'http://localhost:3000' };
      saveBatch(st).then(() => { if (companies.length > 0) processBatchQueue(); });
      sendResponse({ ok: true, total: companies.length });
      break;
    }

    case 'GET_BATCH_STATUS':
      getBatch().then(state => sendResponse({ running: state.queue.length > 0, done: state.done, total: state.total }));
      return true;

    case 'ABORT_BATCH':
      saveBatch({ queue: [], done: 0, total: 0, serverUrl: 'http://localhost:3000' }).then(() => _batchTabIds.clear());
      sendResponse({ ok: true });
      break;

    case 'SEND_TO_TAB': {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, message.payload, response => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            sendResponse(response || { ok: true });
          });
        } else {
          sendResponse({ ok: false, error: 'No active tab' });
        }
      });
      return true;
    }
  }
});
