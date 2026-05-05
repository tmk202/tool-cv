const PLATFORMS = [
  {
    id: 'topcv',
    name: 'TopCV',
    domains: ['topcv.vn'],
    matchUrl: /topcv\.vn/i,
    jobPageUrl: /topcv\.vn\/(tim-viec-lam|viec-lam|job)/i,
    selectors: {
      container: [
        '.job-item-inner',
        '.job-list-item',
        'div[class*="job-item"]',
        'tr[class*="job-"]',
        '.jobs-list-item',
        'div[class*="job-list"] > div',
        '[class*="job-item"]'
      ],
      title: [
        'h3.title a',
        '.job-title a',
        '.title a[href*="topcv"]',
        'a[class*="job-title"]',
        'h3 a',
        '[class*="title"] a[href*="topcv"]',
        'a[href*="topcv"][class*="title"]'
      ],
      company: [
        '.company-name a',
        '.company a',
        '[class*="company"] a[href*="company"]',
        '.company',
        '[class*="company"]',
        '.employer a',
        '.recruiter'
      ],
      location: [
        '.address',
        '.location',
        '[class*="address"]',
        '[class*="location"]',
        '.place',
        '.city'
      ],
      salary: [
        '.salary',
        '.money',
        '[class*="salary"]',
        '[class*="money"]',
        '.price'
      ],
      postedDate: [
        '.time',
        '.posted-date',
        '.date',
        '.deadline',
        '[class*="time"]',
        '[class*="date"]',
        'time'
      ],
      link: [
        'a[href*="topcv.vn"][class*="title"]',
        'h3.title a',
        'a[href*="/chi-tiet"]',
        'a[href*="/job/"]'
      ]
    },
    pagination: {
      type: 'click',
      selector: [
        'a.page-next',
        'a.next',
        '.pagination .next a',
        'a[rel="next"]',
        '.pager .next a',
        'li.next a'
      ]
    }
  },
  {
    id: 'itviec',
    name: 'ITViec',
    domains: ['itviec.com'],
    matchUrl: /itviec\.com/i,
    jobPageUrl: /itviec\.com\/(jobs|search)/i,
    selectors: {
      container: [
        'div.job',
        '.job-card',
        'div[class*="job-item"]',
        '.jobs-list > div',
        '[class*="job-card"]',
        'div[class*="job_"]',
        'article[class*="job"]'
      ],
      title: [
        'h2 a',
        'h3 a',
        '.job-title a',
        '[class*="title"] a',
        'a[class*="job-title"]',
        'a[href*="/jobs/"]'
      ],
      company: [
        'a[data-label="company-name"]',
        '.company__name',
        '.company-name',
        '[class*="company"]',
        '.employer',
        'a[href*="/companies/"]'
      ],
      location: [
        '.address',
        '.location',
        '[class*="address"]',
        '[class*="location"]',
        '.job-location'
      ],
      salary: [
        '.salary',
        '[class*="salary"]',
        '.money',
        '[class*="money"]'
      ],
      postedDate: [
        '.date',
        '[class*="date"]',
        '.time',
        '.posted-date',
        '.created-at'
      ],
      link: [
        'a[href*="/jobs/"]',
        'h2 a',
        'h3 a'
      ]
    },
    pagination: {
      type: 'click',
      selector: [
        '.pagination a.next',
        'a[rel="next"]',
        'li.page-item:last-child a',
        'a.next_page'
      ]
    }
  },
  {
    id: 'vietnamworks',
    name: 'VietnamWorks',
    domains: ['vietnamworks.com'],
    matchUrl: /vietnamworks\.com/i,
    jobPageUrl: /vietnamworks\.com\/(tim-viec-lam|job-search|find-jobs)/i,
    selectors: {
      container: [
        '[class*="job-item"]',
        '.job-card',
        'div[class*="card"]',
        '.jobs-list > div',
        'article[class*="job"]',
        '[class*="job-search-result"] > div'
      ],
      title: [
        '[class*="job-title"] a',
        'a[class*="job-title"]',
        'h2 a',
        'h3 a',
        '[class*="title"] a[href*="vietnamworks"]'
      ],
      company: [
        '[class*="company"] a',
        '[class*="employer"]',
        '[class*="company-name"]',
        '[class*="recruiter"]'
      ],
      location: [
        '[class*="location"]',
        '[class*="address"]',
        '.job-location',
        '[class*="city"]'
      ],
      salary: [
        '[class*="salary"]',
        '[class*="money"]'
      ],
      postedDate: [
        '[class*="date"]',
        '[class*="time"]',
        '[class*="posted"]'
      ],
      link: [
        'a[href*="vietnamworks.com"][class*="title"]',
        'a[href*="/job/"]',
        'a[href*="/tim-viec-lam/"]'
      ]
    },
    pagination: {
      type: 'click',
      selector: [
        'a[rel="next"]',
        'a.next',
        '.pagination .next a',
        'li.next a'
      ]
    }
  },
  {
    id: 'careerviet',
    name: 'CareerViet',
    domains: ['careerviet.vn'],
    matchUrl: /careerviet\.vn/i,
    jobPageUrl: /careerviet\.vn\/(tim-viec-lam|job)/i,
    selectors: {
      container: [
        '.job-item',
        'div[class*="job-item"]',
        '.list-job > div',
        'tr[class*="job"]',
        '.search-job-item'
      ],
      title: [
        'h3.title a',
        '.job-title a',
        'a[class*="title"]',
        'a[href*="careerviet"][class*="job"]',
        'a[href*="/job/"]'
      ],
      company: [
        '.company a',
        '[class*="company"] a',
        '.employer',
        '[class*="employer"]'
      ],
      location: [
        '.address',
        '.location',
        '[class*="location"]',
        '[class*="address"]'
      ],
      salary: [
        '.salary',
        '.money',
        '[class*="salary"]'
      ],
      postedDate: [
        '.date',
        '[class*="date"]',
        '.time',
        '.posted-date'
      ],
      link: [
        'a[href*="/job/"]',
        'h3.title a',
        'a[href*="careerviet"]'
      ]
    },
    pagination: {
      type: 'click',
      selector: [
        'a[rel="next"]',
        'a.next',
        '.pagination .next a',
        '.next-page'
      ]
    }
  },
  {
    id: 'vieclam24h',
    name: 'ViecLam24h',
    domains: ['vieclam24h.vn'],
    matchUrl: /vieclam24h\.vn/i,
    jobPageUrl: /vieclam24h\.vn\/(tim-kiem|tim-viec)/i,
    selectors: {
      container: [
        '.job-item',
        'div[class*="job-item"]',
        '.list-job .item',
        'div[class*="result-item"]',
        '.search-result > div',
        'div[class*="job-"]'
      ],
      title: [
        'h3 a',
        '.job-title a',
        'a[class*="title"]',
        'a[href*="vieclam24h"][class*="job"]',
        'a[href*="/chi-tiet"]'
      ],
      company: [
        '.company a',
        '[class*="company"]',
        '[class*="employer"]',
        '.recruiter'
      ],
      location: [
        '.address',
        '.location',
        '[class*="address"]',
        '[class*="location"]'
      ],
      salary: [
        '.salary',
        '[class*="salary"]',
        '.money',
        '.price'
      ],
      postedDate: [
        '.date',
        '[class*="date"]',
        '.time',
        '[class*="post"]'
      ],
      link: [
        'a[href*="/chi-tiet"]',
        'h3 a',
        'a[href*="vieclam24h"]'
      ]
    },
    pagination: {
      type: 'click',
      selector: [
        'a[rel="next"]',
        'a.next',
        '.pagination .next a',
        '.next-page',
        'li.next a'
      ]
    }
  },
  {
    id: 'jobsgo',
    name: 'JobsGo',
    domains: ['jobsgo.vn'],
    matchUrl: /jobsgo\.vn/i,
    jobPageUrl: /jobsgo\.vn\/(viec-lam|tim-viec)/i,
    selectors: {
      container: [
        '.job-item',
        'div[class*="job-item"]',
        '.list-job .item',
        '.search-result > div',
        'div[class*="card"]'
      ],
      title: [
        'h3 a',
        '.job-title a',
        'a[class*="job"]',
        'a[href*="jobsgo"][class*="title"]',
        'a[href*="/viec-lam/"]'
      ],
      company: [
        '.company a',
        '[class*="company"]',
        '.employer',
        '.recruiter'
      ],
      location: [
        '.address',
        '.location',
        '[class*="address"]',
        '[class*="location"]'
      ],
      salary: [
        '.salary',
        '[class*="salary"]',
        '.money'
      ],
      postedDate: [
        '.date',
        '.time',
        '[class*="date"]',
        '[class*="post"]'
      ],
      link: [
        'a[href*="/viec-lam/"]',
        'h3 a',
        'a[href*="jobsgo"]'
      ]
    },
    pagination: {
      type: 'click',
      selector: [
        'a[rel="next"]',
        'a.next',
        '.pagination .next a',
        '.next-page'
      ]
    }
  },
  {
    id: 'topdev',
    name: 'TopDev',
    domains: ['topdev.vn'],
    matchUrl: /topdev\.vn/i,
    jobPageUrl: /topdev\.vn\/(viec-lam|job|tim-viec)/i,
    selectors: {
      container: [
        '.job-item',
        'div[class*="job-item"]',
        '.post-item',
        '.list-job > div',
        'div[class*="job-card"]'
      ],
      title: [
        'h3 a',
        '.job-title a',
        'a[class*="job"]',
        'a[href*="topdev"]'
      ],
      company: [
        '.company a',
        '[class*="company"]',
        '.employer',
        '.recruiter'
      ],
      location: [
        '.address',
        '.location',
        '[class*="address"]',
        '[class*="location"]'
      ],
      salary: [
        '.salary',
        '[class*="salary"]',
        '.money'
      ],
      postedDate: [
        '.date',
        '.time',
        '[class*="date"]',
        '[class*="time"]'
      ],
      link: [
        'a[href*="/viec-lam/"]',
        'h3 a',
        'a[href*="topdev"]'
      ]
    },
    pagination: {
      type: 'click',
      selector: [
        'a[rel="next"]',
        'a.next',
        '.pagination .next a',
        '.next-page'
      ]
    }
  },
  {
    id: 'glints',
    name: 'Glints',
    domains: ['glints.com'],
    matchUrl: /glints\.com/i,
    jobPageUrl: /glints\.com\/vn\/(opportunities|jobs)/i,
    selectors: {
      container: [
        '[class*="OpportunityCard"]',
        '[class*="job-card"]',
        'div[class*="card"]',
        'a[class*="opportunity"]',
        '.search-results > div',
        'a[href*="/vn/opportunities/"]'
      ],
      title: [
        '[class*="title"]',
        'h2',
        'h3',
        '[class*="job-title"]'
      ],
      company: [
        '[class*="company"]',
        '[class*="employer"]',
        '[class*="organisation"]'
      ],
      location: [
        '[class*="location"]',
        '[class*="address"]'
      ],
      salary: [
        '[class*="salary"]',
        '[class*="money"]',
        '[class*="compensation"]'
      ],
      postedDate: [
        '[class*="date"]',
        '[class*="time"]',
        '[class*="posted"]'
      ],
      link: [
        'a[href*="/vn/opportunities/"]'
      ]
    },
    pagination: {
      type: 'scroll',
      selector: []
    }
  },
  {
    id: 'google',
    name: 'Google Jobs',
    domains: ['google.com'],
    matchUrl: /google\.com\/search/i,
    jobPageUrl: /google\.com\/search/i,
    selectors: {},
    pagination: {
      type: 'scroll',
      selector: []
    },
    extract: function(doc, generateId, cleanText) {
      console.log('[CV Crawler] Google extract start');
      const jobs = [];
      const seen = new Set();

      const cards = doc.querySelectorAll('div.GoEOPd');
      console.log('[CV Crawler] job cards found:', cards.length);

      for (const card of cards) {
        const divs = card.children;
        if (!divs || divs.length < 2) continue;

        let title = '', company = '', location = '';

        for (const d of divs) {
          const cls = d.className || '';
          const txt = (d.textContent || '').trim();
          if (!txt) continue;

          if (cls.includes('tNxQIb') && !title) {
            title = txt;
          } else if (cls.includes('wHYlTd') && cls.includes('a3jPc') && !company) {
            company = txt;
          } else if (cls.includes('wHYlTd') && cls.includes('FqK3wc') && !location) {
            location = txt;
          }
        }

        if (!title) {
          title = divs[0]?.textContent?.trim() || '';
        }
        if (!company && divs.length > 1) {
          company = divs[1]?.textContent?.trim() || '';
        }
        if (!location && divs.length > 2) {
          location = divs[2]?.textContent?.trim() || '';
        }

        if (title && company) {
          const key = (title + '|' + company).toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            jobs.push({
              id: generateId(), platform: 'google', platformName: 'Google Jobs',
              title, company,
              location: location || 'N/A',
              salary: 'N/A', postedDate: 'N/A',
              url: window.location.href, crawledAt: new Date().toISOString()
            });
          }
        }
      }

      console.log('[CV Crawler] Google extracted:', jobs.length);
      return jobs;
    }
  }
];

function detectPlatform(url) {
  console.log('[CV Crawler] detectPlatform:', url);
  for (const p of PLATFORMS) {
    if (p.matchUrl.test(url)) {
      console.log('[CV Crawler] matched:', p.name);
      return p;
    }
  }
  console.log('[CV Crawler] no platform matched for:', url);
  return null;
}

function isJobPage(url) {
  for (const p of PLATFORMS) {
    if (p.jobPageUrl && p.jobPageUrl.test(url)) return true;
  }
  return false;
}

function getPlatformById(id) {
  return PLATFORMS.find(p => p.id === id) || null;
}
