import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import nodemailer from 'nodemailer';
import fs from 'fs';

const BLOCKED_DOMAINS = [
  'topcv.vn', 'itviec.com', 'vietnamworks.com', 'careerviet.vn',
  'vieclam24h.vn', 'jobsgo.vn', 'topdev.vn', 'glints.com',
  'linkedin.com', 'facebook.com', 'google.com', 'youtube.com',
  'example.com'
];
function isValidEmail(email) {
  const domain = (email || '').split('@')[1];
  if (!domain) return false;
  const parts = domain.split('.');
  const tld = parts[parts.length - 1];
  if (tld.length < 2 || tld.length > 6) return false;
  if (parts.length > 3) return false;
  if (domain.match(/\.(png|jpg|jpeg|gif|css|js|svg|ico)$/i)) return false;
  if (BLOCKED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return false;
  return true;
}

function alreadySent(company, email) {
  const row = db.prepare("SELECT COUNT(*) as c FROM send_log WHERE LOWER(TRIM(company)) = ? AND (',' || LOWER(TRIM(email)) || ',') LIKE '%,' || ? || ',%' AND status = 'sent'").get(company.toLowerCase().trim(), email.toLowerCase().trim());
  return row.c > 0;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EMAIL_TEMPLATE = fs.readFileSync(join(__dirname, '..', 'template.html'), 'utf-8');
const FREELANCER_TEMPLATE = fs.readFileSync(join(__dirname, '..', 'template-freelancer.html'), 'utf-8');
const COLD_EMAIL_TEMPLATE = fs.readFileSync(join(__dirname, '..', 'template-cold-email.html'), 'utf-8');
const VA_TEMPLATE = fs.readFileSync(join(__dirname, '..', 'template-va.html'), 'utf-8');

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const name = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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
    crawledAt TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_category ON jobs(category);
  CREATE INDEX IF NOT EXISTS idx_title ON jobs(title);
  CREATE INDEX IF NOT EXISTS idx_location ON jobs(location);
  CREATE INDEX IF NOT EXISTS idx_company ON jobs(company);
  CREATE INDEX IF NOT EXISTS idx_platform ON jobs(platform);
`);

try { db.exec(`ALTER TABLE jobs ADD COLUMN category TEXT NOT NULL DEFAULT ''`); } catch (e) {}
db.exec(`DELETE FROM jobs WHERE rowid NOT IN (SELECT MIN(rowid) FROM jobs GROUP BY title, company)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_unique ON jobs(title, company)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    email TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_emails_company ON emails(company);
  DROP INDEX IF EXISTS idx_emails_unique;
  CREATE INDEX IF NOT EXISTS idx_emails_email ON emails(email);

  DELETE FROM jobs WHERE rowid NOT IN (SELECT MIN(rowid) FROM jobs GROUP BY title, company);

  CREATE TABLE IF NOT EXISTS smtp_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    host TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 587,
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    fromEmail TEXT NOT NULL DEFAULT '',
    fromName TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS send_log (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    cvFile TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT NOT NULL DEFAULT '',
    sentAt TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS cv_files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL DEFAULT '',
    originalName TEXT NOT NULL DEFAULT '',
    uploadedAt TEXT NOT NULL DEFAULT ''
  );

  INSERT OR IGNORE INTO smtp_config (id, host, port, username, password, fromEmail, fromName) VALUES (1, '', 587, '', '', '', '');
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO jobs (id, platform, platformName, title, company, location, salary, postedDate, url, crawledAt, category)
  VALUES (@id, @platform, @platformName, @title, @company, @location, @salary, @postedDate, @url, @crawledAt, @category)
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
    const category = (req.query.category || '').trim();
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
    if (category) {
      conditions.push('category = @category');
      params.category = category;
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
    const categories = db.prepare('SELECT category, COUNT(*) as count FROM jobs WHERE category != \'\' GROUP BY category ORDER BY count DESC').all();

    res.json({ ok: true, total, uniqueCompanies: companies, platforms, byLocation, recentPlatform, categories });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function shortenName(name) {
  let n = name.trim();
  n = n.replace(/^(công ty|cty|cong ty)\s*(cổ phần|cp|tnhh|tnhh mtv|tnhh 1tv|tnhh 1 thành viên|hợp danh)?\s*/i, '');
  n = n.replace(/^(tổng\s+)?(công\s+ty|cty)\s*(cổ\s+phần|cp|tnhh)?\s*/i, '');
  n = n.replace(/\s*(cổ phần|cp|tnhh|tnhh mtv)\s*$/i, '');
  n = n.replace(/^(việt\s*nam)\s+/i, '').trim();
  return n || name;
}

app.get('/api/companies/search-url', (req, res) => {
  const company = (req.query.company || '').trim();
  if (!company) return res.json({ ok: false });
  const short = shortenName(company);
  const query = short + ' email tuyển dụng';
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&cv_company=${encodeURIComponent(company)}`;
  console.log('[EMAIL] search-url:', company, '→ short:', short);
  res.json({ ok: true, url });
});

app.get('/api/companies', (req, res) => {
  try {
    const companies = db.prepare(`
      SELECT TRIM(j.company) as name, MIN(j.crawledAt) as firstSeen,
        (SELECT COUNT(*) FROM emails e WHERE LOWER(TRIM(e.company)) = LOWER(TRIM(j.company))) as emailCount,
        (SELECT COUNT(*) FROM send_log sl WHERE LOWER(TRIM(sl.company)) = LOWER(TRIM(j.company)) AND sl.status = 'sent') as sentCount,
        (SELECT j2.category FROM jobs j2 WHERE LOWER(TRIM(j2.company)) = LOWER(TRIM(j.company)) AND j2.category != '' GROUP BY j2.category ORDER BY COUNT(*) DESC LIMIT 1) as category
      FROM jobs j GROUP BY LOWER(TRIM(j.company))
      ORDER BY sentCount DESC, emailCount ASC, name ASC
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
    if (!isValidEmail(email)) return res.json({ ok: true, id: null, skipped: true });
    const normalizedCompany = company.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT COUNT(*) as c FROM emails WHERE company = ? AND email = ?').get(normalizedCompany, normalizedEmail);
    if (existing.c > 0) return res.json({ ok: true, id: null, skipped: true });
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    db.prepare('INSERT INTO emails (id, company, email, source, verified, createdAt) VALUES (?, ?, ?, ?, 0, ?)').run(id, normalizedCompany, normalizedEmail, (source || '').trim(), new Date().toISOString());
    console.log('[EMAIL] saved:', normalizedCompany, '→', normalizedEmail);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/emails/batch', (req, res) => {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) return res.json({ ok: false, error: 'No emails' });
    const insert = db.prepare('INSERT INTO emails (id, company, email, source, verified, createdAt) VALUES (?, ?, ?, ?, 0, ?)');
    const check = db.prepare('SELECT COUNT(*) as c FROM emails WHERE company = ? AND email = ?');
    const batch = db.transaction((items) => {
      let added = 0;
      for (const item of items) {
        if (!item.company || !item.email) continue;
        if (!isValidEmail(item.email)) continue;
        const normalCompany = item.company.trim().toLowerCase();
        const normalEmail = item.email.trim().toLowerCase();
        const existing = check.get(normalCompany, normalEmail);
        if (existing.c > 0) continue;
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        insert.run(id, normalCompany, normalEmail, (item.source || '').trim(), new Date().toISOString());
        added++;
      }
      return added;
    });
    const added = batch(emails);
    console.log('[EMAIL] batch saved:', added, '/', emails.length);
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

app.post('/api/jobs/category', (req, res) => {
  try {
    const { company, category } = req.body;
    if (!company) return res.json({ ok: false, error: 'Missing company' });
    db.prepare("UPDATE jobs SET category = ? WHERE LOWER(TRIM(company)) = ?").run(category || '', company.toLowerCase().trim());
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─── SMTP Config ───
app.get('/api/smtp/config', (req, res) => {
  try {
    const config = db.prepare('SELECT * FROM smtp_config WHERE id = 1').get();
    if (config) { const { password, ...safe } = config; safe.hasPassword = !!password; res.json({ ok: true, config: safe }); }
    else res.json({ ok: true, config: null });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/smtp/config', (req, res) => {
  try {
    const { host, port, username, password, fromEmail, fromName } = req.body;
    const existing = db.prepare('SELECT password FROM smtp_config WHERE id = 1').get();
    const finalPassword = password || existing?.password || '';
    db.prepare('UPDATE smtp_config SET host=?, port=?, username=?, password=?, fromEmail=?, fromName=? WHERE id=1')
      .run(host || '', parseInt(port) || 587, username || '', finalPassword, fromEmail || '', fromName || '');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/smtp/test', async (req, res) => {
  try {
    const config = db.prepare('SELECT * FROM smtp_config WHERE id = 1').get();
    if (!config || !config.host) return res.json({ ok: false, error: 'No SMTP config' });
    const transporter = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.port === 465,
      auth: { user: config.username, pass: config.password }
    });
    await transporter.verify();
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

// ─── CV Upload ───
app.post('/api/cv/upload', upload.single('cv'), (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: 'No file' });
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    db.prepare('INSERT INTO cv_files (id, filename, originalName, uploadedAt) VALUES (?, ?, ?, ?)')
      .run(id, req.file.filename, req.file.originalname, new Date().toISOString());
    res.json({ ok: true, id, filename: req.file.originalname });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/cv/list', (req, res) => {
  try {
    const files = db.prepare('SELECT * FROM cv_files ORDER BY uploadedAt DESC').all();
    res.json({ ok: true, files });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/cv/:id', (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM cv_files WHERE id = ?').get(req.params.id);
    if (file) {
      const path = join(UPLOAD_DIR, file.filename);
      if (fs.existsSync(path)) fs.unlinkSync(path);
      db.prepare('DELETE FROM cv_files WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─── Send Email ───

const TEMPLATES = { default: EMAIL_TEMPLATE, freelancer: FREELANCER_TEMPLATE, 'cold-email': COLD_EMAIL_TEMPLATE, va: VA_TEMPLATE };
const TEMPLATE_ROLES = {
  default: 'Software Engineer | AI & Automation Specialist',
  freelancer: 'Freelance Developer',
  'cold-email': 'AI & Automation Solutions',
  va: 'Event Planner | Internal Communications Specialist'
};
const TEMPLATE_LIST = [
  { id: 'default', name: 'Default' },
  { id: 'freelancer', name: 'Freelancer' },
  { id: 'cold-email', name: 'Cold Email' },
  { id: 'va', name: 'VA' }
];

app.get('/api/template', (req, res) => {
  const tpl = TEMPLATES[req.query.type] || EMAIL_TEMPLATE;
  res.json({ ok: true, html: tpl });
});

app.get('/api/templates', (req, res) => {
  res.json({ ok: true, templates: TEMPLATE_LIST });
});

app.post('/api/send', async (req, res) => {
  try {
    const { company, emails, email, role, subject, body, cvId, force } = req.body;
    const toList = emails || (email ? [email] : []);
    if (!company || toList.length === 0) return res.json({ ok: false, error: 'Missing company or email' });

    const unsent = toList.filter(e => force || !alreadySent(company, e));
    if (unsent.length === 0) return res.json({ ok: true, skipped: true, message: 'Already sent to all recipients' });

    const config = db.prepare('SELECT * FROM smtp_config WHERE id = 1').get();
    if (!config || !config.host) return res.json({ ok: false, error: 'No SMTP config. Configure in Send page.' });

    const transporter = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.port === 465,
      auth: { user: config.username, pass: config.password }
    });

    const t = req.body.template;
    const roleDefault = TEMPLATE_ROLES[t] || 'Software Engineer | AI & Automation Specialist';
    const vars = { company, role: role || roleDefault };
    const r = (s) => s.replace(/\{\{(\w+)\}\}/gi, (_, k) => vars[k.toLowerCase()] || `{{${k}}}`);

    const finalSubject = r(subject || 'Application for {{role}} at {{company}}');
    const defaultTpl = TEMPLATES[t] || EMAIL_TEMPLATE;
    const finalBody = r(body || defaultTpl);

    const attachments = [];
    if (cvId) {
      const ids = cvId.split(',');
      for (const id of ids) {
        const cv = db.prepare('SELECT * FROM cv_files WHERE id = ?').get(id.trim());
        if (cv) {
          const cvPath = join(UPLOAD_DIR, cv.filename);
          if (fs.existsSync(cvPath)) {
            attachments.push({ filename: cv.originalName, path: cvPath });
          }
        }
      }
    }

    const allRecipients = unsent.join(',');
    const toStr = unsent[0] || '';
    const bccStr = unsent.length > 1 ? unsent.slice(1).join(',') : undefined;
    const info = await transporter.sendMail({
      from: `"${config.fromName || config.username}" <${config.fromEmail || config.username}>`,
      to: toStr, bcc: bccStr,
      subject: finalSubject,
      html: finalBody,
      attachments
    });

    console.log('[EMAIL] sent:', company, '→', allRecipients.slice(0, 80), '| subject:', finalSubject.slice(0, 40));
    const logId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    db.prepare('INSERT INTO send_log (id, company, email, subject, cvFile, status, error, sentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(logId, company, allRecipients, finalSubject, cvId || '', 'sent', '', new Date().toISOString());

    res.json({ ok: true, messageId: info.messageId, logId, skipped: toList.length - unsent.length });
  } catch (err) {
    console.log('[EMAIL] send failed:', req.body.company, '→', err.message);
    const logId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    const errEmail = (req.body.emails || [req.body.email]).filter(Boolean).join(',') || '';
    db.prepare('INSERT INTO send_log (id, company, email, subject, cvFile, status, error, sentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(logId, req.body.company || '', errEmail, req.body.subject || '', req.body.cvId || '', 'failed', err.message, new Date().toISOString());
    res.json({ ok: false, error: err.message, logId });
  }
});

app.post('/api/send/batch', async (req, res) => {
  try {
    const { subject, body, cvId, template, category } = req.body;
    const catFilter = category ? " AND j.category = '" + category.replace(/'/g, "''") + "'" : '';
    const companies = db.prepare(`
      SELECT DISTINCT LOWER(TRIM(j.company)) as name FROM jobs j
      INNER JOIN emails e ON LOWER(TRIM(e.company)) = LOWER(TRIM(j.company))
      WHERE 1=1${catFilter}
    `).all();
    
    const config = db.prepare('SELECT * FROM smtp_config WHERE id = 1').get();
    if (!config || !config.host) return res.json({ ok: false, error: 'No SMTP config' });

    const transporter = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.port === 465,
      auth: { user: config.username, pass: config.password }
    });

    const attachments = [];
    if (cvId) {
      const ids = cvId.split(',');
      for (const id of ids) {
        const cv = db.prepare('SELECT * FROM cv_files WHERE id = ?').get(id.trim());
        if (cv) {
          const cvPath = join(UPLOAD_DIR, cv.filename);
          if (fs.existsSync(cvPath)) {
            attachments.push({ filename: cv.originalName, path: cvPath });
          }
        }
      }
    }

    function getRoleForCompany(company, tpl) {
  const fallback = TEMPLATE_ROLES[tpl] || 'Software Engineer | AI & Automation Specialist';
  const job = db.prepare("SELECT title FROM jobs WHERE LOWER(TRIM(company)) = ? AND title != 'N/A' ORDER BY crawledAt DESC LIMIT 1").get(company.toLowerCase().trim());
  if (!job || !job.title) return fallback;
  let role = job.title.replace(/(lương|mức lương|thu nhập|upto|up to|tới|đến)\s*[\d.,\s]*[trtriệutriệukmk\$]+\s*/gi, '')
    .replace(/[\d.,]+\s*[-–to]+\s*[\d.,]*\s*[trtriệutriệukmk\$]+\s*/gi, '')
    .replace(/thương lượng|negotiable/gi, '').replace(/\s+/g, ' ').trim();
  return role || fallback;
}

let sent = 0, failed = 0, skipped = 0;
    for (const c of companies) {
      const company = c.name;
      const role = getRoleForCompany(company, template);
      const emails = db.prepare('SELECT email FROM emails WHERE LOWER(TRIM(company)) = ?').all(company);
      const toList = emails.map(e => e.email).filter(Boolean);
      if (toList.length === 0) continue;

      const unsent = toList.filter(e => !alreadySent(company, e));
      if (unsent.length === 0) { skipped++; continue; }

      const vars = { company, role };
      const r = (s) => s.replace(/\{\{(\w+)\}\}/gi, (_, k) => vars[k.toLowerCase()] || `{{${k}}}`);
      const allRecipients = unsent.join(',');
      const toStr = unsent[0] || '';
      const bccStr = unsent.length > 1 ? unsent.slice(1).join(',') : undefined;

      try {
        await transporter.sendMail({
          from: `"${config.fromName || config.username}" <${config.fromEmail || config.username}>`,
          to: toStr, bcc: bccStr,
          subject: r(subject || 'Application for {{role}} at {{company}}'),
          html: r(body || 'Dear HR of {{company}},...'),
          attachments
        });
        sent++;
        const logId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        db.prepare('INSERT INTO send_log (id, company, email, subject, cvFile, status, error, sentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(logId, company, allRecipients, r(subject || 'Application for {{role}} at {{company}}'), cvId || '', 'sent', '', new Date().toISOString());
        console.log('[EMAIL] batch sent:', company, '→', allRecipients.slice(0, 60));
      } catch (err) {
        failed++;
        console.log('[EMAIL] batch failed:', company, err.message);
        const logId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        db.prepare('INSERT INTO send_log (id, company, email, subject, cvFile, status, error, sentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(logId, company, allRecipients, r(subject || 'Application for {{role}} at {{company}}'), cvId || '', 'failed', err.message, new Date().toISOString());
      }
    }

    res.json({ ok: true, sent, failed, skipped, total: companies.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/send/log', (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const logs = db.prepare('SELECT * FROM send_log ORDER BY sentAt DESC LIMIT ?').all(limit);
    const stats = db.prepare("SELECT status, COUNT(*) as count FROM send_log GROUP BY status").all();
    res.json({ ok: true, logs, stats });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/send/log', (req, res) => {
  try { db.prepare('DELETE FROM send_log').run(); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`CV Crawler Server running at http://localhost:${PORT}`);
});
