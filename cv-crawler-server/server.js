import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const db = new Database(join(__dirname, 'jobs.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL DEFAULT '',
    platformName TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    salary TEXT NOT NULL DEFAULT '',
    postedDate TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    crawledAt TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_title ON jobs(title);
  CREATE INDEX IF NOT EXISTS idx_location ON jobs(location);
  CREATE INDEX IF NOT EXISTS idx_company ON jobs(company);
  CREATE INDEX IF NOT EXISTS idx_platform ON jobs(platform);

  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    email TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_emails_company ON emails(company);
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO jobs (id, platform, platformName, title, company, location, salary, postedDate, url, crawledAt)
  VALUES (@id, @platform, @platformName, @title, @company, @location, @salary, @postedDate, @url, @crawledAt)
`);

const insertBatch = db.transaction((jobs) => {
  let added = 0;
  for (const job of jobs) {
    const result = insertStmt.run(job);
    if (result.changes > 0) added++;
  }
  return added;
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, 'public')));

app.post('/api/jobs/batch', (req, res) => {
  try {
    const { jobs } = req.body;
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.json({ ok: false, error: 'No jobs provided' });
    }
    const added = insertBatch(jobs);
    const total = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
    res.json({ ok: true, added, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/jobs', (req, res) => {
  try {
    const title = (req.query.title || '').trim();
    const location = (req.query.location || '').trim();
    const company = (req.query.company || '').trim();
    const platform = (req.query.platform || '').trim();
    const excludeRaw = (req.query.exclude || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = {};

    if (title) {
      conditions.push('LOWER(title) LIKE @title');
      params.title = `%${title.toLowerCase()}%`;
    }
    if (location) {
      conditions.push('LOWER(location) LIKE @location');
      params.location = `%${location.toLowerCase()}%`;
    }
    if (company) {
      conditions.push('LOWER(company) LIKE @company');
      params.company = `%${company.toLowerCase()}%`;
    }
    if (platform) {
      conditions.push('platform = @platform');
      params.platform = platform;
    }
    if (excludeRaw) {
      const keywords = excludeRaw.split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      keywords.forEach((kw, i) => {
        conditions.push(`LOWER(title) NOT LIKE @exclude${i}`);
        params[`exclude${i}`] = `%${kw}%`;
      });
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM jobs ${where}`).get(params);
    const total = countRow.total;
    const totalPages = Math.ceil(total / limit);

    const rows = db.prepare(`SELECT * FROM jobs ${where} ORDER BY crawledAt DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset });

    res.json({ ok: true, jobs: rows, page, limit, total, totalPages });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
    const companies = db.prepare('SELECT COUNT(DISTINCT LOWER(company)) as count FROM jobs').get().count;
    const platforms = db.prepare('SELECT platform, platformName, COUNT(*) as count FROM jobs GROUP BY platform ORDER BY count DESC').all();
    const byLocation = db.prepare('SELECT LOWER(TRIM(location)) as loc, COUNT(*) as count FROM jobs GROUP BY loc ORDER BY count DESC LIMIT 20').all();
    const recentPlatform = db.prepare("SELECT platformName, COUNT(*) as count FROM jobs GROUP BY platform ORDER BY MAX(crawledAt) DESC LIMIT 1").get();

    res.json({ ok: true, total, uniqueCompanies: companies, platforms, byLocation, recentPlatform });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/companies', (req, res) => {
  try {
    const companies = db.prepare(`
      SELECT LOWER(TRIM(j.company)) as name, MIN(j.crawledAt) as firstSeen,
        (SELECT COUNT(*) FROM emails e WHERE LOWER(TRIM(e.company)) = LOWER(TRIM(j.company))) as emailCount
      FROM jobs j GROUP BY LOWER(TRIM(j.company))
      ORDER BY emailCount ASC, name ASC
    `).all();
    res.json({ ok: true, companies });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/emails', (req, res) => {
  try {
    const company = (req.query.company || '').trim().toLowerCase();
    let rows;
    if (company) {
      rows = db.prepare('SELECT * FROM emails WHERE LOWER(TRIM(company)) = ? ORDER BY createdAt DESC').all(company);
    } else {
      rows = db.prepare('SELECT * FROM emails ORDER BY createdAt DESC').all();
    }
    res.json({ ok: true, emails: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/emails', (req, res) => {
  try {
    const { company, email, source } = req.body;
    if (!company || !email) return res.json({ ok: false, error: 'Missing company or email' });
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    db.prepare('INSERT OR IGNORE INTO emails (id, company, email, source, verified, createdAt) VALUES (?, ?, ?, ?, 0, ?)').run(id, company.trim(), email.trim(), (source || '').trim(), new Date().toISOString());
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/emails/batch', (req, res) => {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) return res.json({ ok: false, error: 'No emails' });
    const insert = db.prepare('INSERT OR IGNORE INTO emails (id, company, email, source, verified, createdAt) VALUES (?, ?, ?, ?, 0, ?)');
    const batch = db.transaction((items) => {
      let added = 0;
      for (const item of items) {
        if (!item.company || !item.email) continue;
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        const r = insert.run(id, item.company.trim(), item.email.trim(), (item.source || '').trim(), new Date().toISOString());
        if (r.changes > 0) added++;
      }
      return added;
    });
    const added = batch(emails);
    res.json({ ok: true, added });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/emails', (req, res) => {
  try {
    const { company } = req.query;
    if (company) {
      db.prepare('DELETE FROM emails WHERE LOWER(TRIM(company)) = ?').run(company.toLowerCase().trim());
    } else {
      db.prepare('DELETE FROM emails').run();
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/companies/search-url', (req, res) => {
  const company = (req.query.company || '').trim();
  if (!company) return res.json({ ok: false });
  const url = `https://www.google.com/search?q=${encodeURIComponent('"' + company + '" email tuyển dụng OR HR OR recruitment')}`;
  res.json({ ok: true, url });
});

app.delete('/api/jobs', (req, res) => {
  try {
    db.prepare('DELETE FROM jobs').run();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/jobs/export', (req, res) => {
  try {
    const format = req.query.format || 'json';
    const jobs = db.prepare('SELECT * FROM jobs ORDER BY crawledAt DESC').all();
    if (format === 'csv') {
      const headers = ['Company', 'Title', 'Location', 'Salary', 'Platform', 'PostedDate', 'URL', 'CrawledAt'];
      const rows = jobs.map(j => headers.map(h => {
        const val = j[h === 'Company' ? 'company' : h === 'Title' ? 'title' : h === 'Location' ? 'location' : h === 'Salary' ? 'salary' : h === 'Platform' ? 'platformName' : h === 'PostedDate' ? 'postedDate' : h === 'URL' ? 'url' : h === 'CrawledAt' ? 'crawledAt' : ''];
        return `"${String(val || '').replace(/"/g, '""')}"`;
      }).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="cv-crawler-export.csv"');
      res.send('\uFEFF' + headers.join(',') + '\n' + rows.join('\n'));
    } else {
      res.json(jobs);
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`CV Crawler Server running at http://localhost:${PORT}`);
});
