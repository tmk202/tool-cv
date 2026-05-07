let currentPlatform = null;
let currentCategory = '';
let isCrawling = false;
let shouldStop = false;

function findElement(root, selectors, scope = null) {
  if (!selectors || typeof selectors[Symbol.iterator] !== 'function') return null;
  const s = scope || root;
  for (const sel of selectors) {
    try {
      const el = s.querySelector(sel);
      if (el) return el;
    } catch (e) {
    }
  }
  return null;
}

function findAllElements(root, selectors, scope = null) {
  if (!selectors || typeof selectors[Symbol.iterator] !== 'function') return null;
  const s = scope || root;
  for (const sel of selectors) {
    try {
      const els = s.querySelectorAll(sel);
      if (els.length > 0) return els;
    } catch (e) {
    }
  }
  return null;
}

function getText(el) {
  if (!el) return '';
  return cleanText(el.textContent || el.innerText || '');
}

function getHref(el) {
  if (!el) return '';
  return el.href || el.getAttribute('href') || '';
}

function extractEmailsFromPage() {
  const text = document.body.innerText || '';
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const found = text.match(emailRegex) || [];
  const unique = [...new Set(found.map(e => e.toLowerCase()))];
  const platformDomains = [
    'topcv.vn', 'itviec.com', 'vietnamworks.com', 'careerviet.vn',
    'vieclam24h.vn', 'jobsgo.vn', 'topdev.vn', 'glints.com',
    'linkedin.com', 'facebook.com', 'google.com', 'youtube.com',
    'example.com'
  ];
  const validTlds = ['com', 'vn', 'net', 'org', 'edu', 'gov', 'info', 'io', 'co', 'jp', 'kr', 'cn', 'sg', 'th', 'my', 'ph', 'id', 'hk', 'tw', 'de', 'uk', 'fr', 'au', 'ca', 'in', 'br', 'mx', 'eu', 'me', 'pro', 'dev', 'app', 'ai', 'tech', 'online', 'site', 'store', 'cloud'];
  return unique.filter(e => {
    const domain = e.split('@')[1];
    if (!domain) return false;
    const parts = domain.split('.');
    const tld = parts[parts.length - 1];
    if (tld.length < 2 || tld.length > 6) return false;
    if (parts.length > 3) return false;
    if (platformDomains.some(d => domain === d || domain.endsWith('.' + d))) return false;
    if (domain.match(/\.(png|jpg|jpeg|gif|css|js|svg|ico)$/i)) return false;
    if (!validTlds.includes(tld) && tld.length > 3) return false;
    return true;
  });
}

function extractCompanyName(text) {
  const clean = cleanText(text);
  const normalized = clean
    .replace(/^(công ty|cty|ct|cong ty)\s*/i, '')
    .replace(/(tuyển dụng|tuyen dung|tuyển)$/i, '')
    .trim();
  return normalized || clean;
}

function extractJobFromCard(platform, card) {
  const s = platform.selectors;

  const titleEl = findElement(document, s.title, card);
  const title = getText(titleEl);
  if (!title) return null;

  const companyRaw = getText(findElement(document, s.company, card));
  const company = extractCompanyName(companyRaw);

  const location = getText(findElement(document, s.location, card));
  const salary = getText(findElement(document, s.salary, card));
  const postedDate = getText(findElement(document, s.postedDate, card));
  const linkEl = findElement(document, s.link, card);
  const url = getHref(linkEl);

  return {
    id: generateId(),
    platform: platform.id,
    platformName: platform.name,
    title,
    company: company || 'N/A',
    location: location || 'N/A',
    salary: salary || 'N/A',
    postedDate: postedDate || 'N/A',
    url: url || window.location.href,
    crawledAt: new Date().toISOString(),
    category: currentCategory
  };
}

function extractJobsFromPage(platform) {
  if (platform.extract) {
    const result = platform.extract(document, generateId, cleanText);
    if (result && result.length > 0) return result;
  }

  if (!platform.selectors || !platform.selectors.container) return [];
  const containers = findAllElements(document, platform.selectors.container);
  if (!containers || containers.length === 0) {
    return [];
  }

  const jobs = [];
  const seen = new Set();

  for (const card of containers) {
    const job = extractJobFromCard(platform, card);
    if (job) {
      const key = (job.title + '|' + job.company).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        jobs.push(job);
      }
    }
  }

  return jobs;
}

async function scrollToBottom() {
  let lastHeight = 0;

  const listbox = document.querySelector('[role="listbox"]');

  for (let i = 0; i < 25; i++) {
    if (listbox) {
      listbox.scrollTop = listbox.scrollHeight;
      const event = new Event('scroll', { bubbles: true });
      listbox.dispatchEvent(event);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(600 + Math.random() * 400);

    if (listbox && listbox.children.length > 0) {
      await sleep(500);
      break;
    }

    const currentHeight = document.documentElement.scrollHeight;
    if (currentHeight === lastHeight && (!listbox || listbox.children.length === 0)) {
      if (i > 5) break;
    }
    lastHeight = currentHeight;
  }

  await sleep(300);
}

async function clickNextPage(platform) {
  const pagination = platform.pagination;
  if (pagination.type === 'scroll') return false;

  const btn = findElement(document, pagination.selector);
  if (!btn) return false;
  if (btn.disabled || btn.classList.contains('disabled')) return false;

  btn.click();
  return true;
}

async function waitForContent() {
  const base = 1000 + Math.random() * 800;
  await sleep(base);

  try {
    await new Promise((resolve) => {
      let timer = setTimeout(resolve, 2500);
      const obs = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(resolve, 500);
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: false });
      setTimeout(() => {
        obs.disconnect();
        resolve();
      }, 4000);
    });
  } catch {
    await sleep(1500);
  }
}

function handleMessage(message, sender, sendResponse) {
  switch (message.type) {
    case 'PING':
      const isEmailSearch = window.location.hostname.includes('google.com') && 
        window.location.pathname.includes('search') && 
        !window.location.search.includes('udm=8');
      const foundEmails = isEmailSearch ? extractEmailsFromPage() : [];
      sendResponse({
        ok: true,
        platform: currentPlatform ? currentPlatform.id : null,
        platformName: currentPlatform ? currentPlatform.name : null,
        url: window.location.href,
        isJobPage: currentPlatform ? isJobPage(window.location.href) : false,
        isEmailSearch,
        emailCount: foundEmails.length,
        emails: foundEmails.slice(0, 20)
      });
      return;

    case 'GET_PLATFORM':
      sendResponse({ platform: currentPlatform });
      return;

    case 'DUMP_DEBUG':
      console.log('=== CV Crawler DEBUG ===');
      console.log('URL:', window.location.href);
      console.log('Platform:', currentPlatform?.name || 'none');
      const q = new URLSearchParams(window.location.search).get('q') || '';
      console.log('search query:', q);
      const listbox = document.querySelector('[role="listbox"]');
      console.log('[role="listbox"]:', !!listbox, '| children:', listbox?.children.length || 0, '| tag:', listbox?.tagName, '| class:', listbox?.className?.slice(0, 60));
      const mainText = document.body.innerText || '';
      const linesAll = mainText.split('\n').map(l => l.trim()).filter(Boolean);
      const candidates = linesAll.filter(l => l.length > 8 && l.length < 60 && l.includes(' ') && !l.match(/^[a-z]/) && !l.match(/^(google|about|cookie|sign|search|image|all|map|video|news|settings|help|privacy|terms|accessibility|skip|job type|date posted|ai mode|sorted)/i));
      console.log('candidate title lines:', candidates.slice(0, 10));
      function findJobInDOM(text) {
        const safe = text.replace(/'/g, "&apos;").slice(0, 35);
        try {
          const el = document.evaluate(`//*[text()[contains(., '${safe}')]]`, document, null, 9, null).singleNodeValue;
          if (!el) return null;
          const p = el.parentElement;
          return {
            tag: el.tagName, class: (el.className || '').slice(0, 50),
            parent: { tag: p?.tagName, class: (p?.className || '').slice(0, 50), children: p?.children.length },
            grandparent: { tag: p?.parentElement?.tagName, class: (p?.parentElement?.className || '').slice(0, 50) },
            greatGP: { tag: p?.parentElement?.parentElement?.tagName, class: (p?.parentElement?.parentElement?.className || '').slice(0, 50) },
            depth: getDepth(el),
            html: p?.innerHTML?.slice(0, 300)
          };
        } catch(e) { return {error: e.message}; }
      }
      function getDepth(el) { let d = 0; while (el.parentElement) { el = el.parentElement; d++; } return d; }
      const jobTitle = candidates.find(c => c.match(/Engineer|Developer|Manager|Intern|Staff|Senior|Junior|Lead/));
      if (jobTitle) {
        const info = findJobInDOM(jobTitle);
        console.log('job title found:', jobTitle);
        console.log('job location:', JSON.stringify(info, null, 2));
      } else {
        console.log('no job title found in candidates, using:', candidates[4]);
        const info2 = findJobInDOM(candidates[4] || candidates[0]);
        console.log('fallback location:', JSON.stringify(info2, null, 2));
      }
      console.log('=== END DEBUG ===');
      sendResponse({ ok: true, logged: true });
      return;

    case 'EXTRACT_EMAILS':
      const emails = extractEmailsFromPage();
      sendResponse({ ok: true, emails });
      return;

    case 'EXTRACT_SINGLE':
      if (!currentPlatform) {
        sendResponse({ jobs: [] });
        return;
      }
      sendResponse({ jobs: extractJobsFromPage(currentPlatform), platform: currentPlatform.id });
      return;

    case 'START_CRAWL':
      if (isCrawling) {
        sendResponse({ ok: false, error: 'Already crawling' });
        return;
      }
      if (!currentPlatform) {
        sendResponse({ ok: false, error: 'No platform detected on this page' });
        return;
      }
      isCrawling = true;
      shouldStop = false;
      currentCategory = message.category || '';
      sendResponse({ ok: true });
      runCrawlLoop(currentPlatform, message.maxPages || 5);
      return;

    case 'STOP_CRAWL':
      shouldStop = true;
      isCrawling = false;
      sendResponse({ ok: true });
      return;
  }
}

chrome.runtime.onMessage.addListener(handleMessage);

async function runCrawlLoop(platform, maxPages) {
  let pageNum = 0;
  let allJobs = [];

  chrome.runtime.sendMessage({
    type: 'CRAWL_STATUS',
    status: 'running',
    platform: platform.id,
    message: 'Starting crawl...'
  });

  while (pageNum < maxPages && !shouldStop) {
    pageNum++;

    chrome.runtime.sendMessage({
      type: 'CRAWL_STATUS',
      status: 'running',
      platform: platform.id,
      message: `Page ${pageNum}/${maxPages}...`,
      page: pageNum,
      totalPages: maxPages
    });

    await waitForContent();
    await scrollToBottom();

    const jobs = extractJobsFromPage(platform);
    allJobs.push(...jobs);

    if (jobs.length > 0) {
      chrome.runtime.sendMessage({
        type: 'CRAWL_BATCH',
        platform: platform.id,
        jobs,
        page: pageNum,
        totalJobs: allJobs.length
      });
    }

    if (pageNum >= maxPages || shouldStop) break;

    chrome.runtime.sendMessage({
      type: 'CRAWL_STATUS',
      status: 'running',
      platform: platform.id,
      message: `Going to page ${pageNum + 1}...`
    });

    const clicked = await clickNextPage(platform);
    if (!clicked) {
      chrome.runtime.sendMessage({
        type: 'CRAWL_STATUS',
        status: 'done',
        platform: platform.id,
        message: 'No more pages'
      });
      break;
    }

    await sleep(800 + Math.random() * 500);
    await waitForContent();
  }

  isCrawling = false;
  chrome.runtime.sendMessage({
    type: 'CRAWL_DONE',
    platform: platform.id,
    totalJobs: allJobs.length,
    pages: pageNum
  });
}

function detectAndNotify(url) {
  console.log('[CV Crawler] detectAndNotify:', url);
  const detected = detectPlatform(url);
  chrome.runtime.sendMessage({
    type: 'PLATFORM_DETECTED',
    platform: detected ? detected.id : null,
    platformName: detected ? detected.name : null,
    url: url,
    isJobPage: detected ? isJobPage(url) : false
  });
  if (detected) {
    console.log('[CV Crawler] detected:', detected.name, '| isJobPage:', isJobPage(url));
    currentPlatform = detected;
  } else {
    console.log('[CV Crawler] no platform for:', url);
    currentPlatform = null;
  }
}

async function autoFindEmails() {
  let shouldClose = false;
  let companyName = '';

  try {
    const url = window.location.href;
    if (!url.includes('google.com/search') || url.includes('udm=8')) return;

    const params = new URLSearchParams(window.location.search);
    const query = (params.get('q') || '').toLowerCase().trim();
    if (!query.includes('email tuyển dụng') && !query.includes('email tuyen dung')) return;

    const cvCompany = params.get('cv_company');
    if (cvCompany && cvCompany.trim()) {
      companyName = cvCompany.trim();
    } else {
      const companyQuery = query.replace(/email tuyển dụng|email tuyen dung|email|tuyển dụng|hr|recruitment/gi, '').trim();
      companyName = companyQuery.replace(/\s+/g, ' ').trim();
    }
    if (!companyName) return;

    shouldClose = true;
    console.log('[CV Crawler] auto email search for:', companyName);

    await scrollToBottom();
    await sleep(1000);

    const emails = extractEmailsFromPage();
    console.log('[CV Crawler] found emails:', emails);

    if (emails.length > 0) {
      for (const email of emails) {
        try {
          await fetch('http://localhost:3000/api/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company: companyName, email, source: url })
          });
        } catch (err) {
          console.log('[CV Crawler] save error:', err.message);
        }
      }
    }
  } catch (err) {
    console.log('[CV Crawler] autoFindEmails error:', err.message);
  }

  if (shouldClose && companyName) {
    chrome.runtime.sendMessage({ type: 'CLOSE_THIS_TAB', company: companyName });
  }
}

(function init() {
  console.log('[CV Crawler] content script loaded on:', window.location.href);
  detectAndNotify(window.location.href);

  if (window.location.href.includes('google.com/search') && !window.location.href.includes('udm=8')) {
    setTimeout(autoFindEmails, 3000);
  }

  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('[CV Crawler] URL changed:', lastUrl);
      detectAndNotify(lastUrl);
    }
  });
  urlObserver.observe(document.querySelector('title'), { childList: true, subtree: true });

  window.addEventListener('popstate', () => {
    console.log('[CV Crawler] popstate:', window.location.href);
    detectAndNotify(window.location.href);
  });
})();
