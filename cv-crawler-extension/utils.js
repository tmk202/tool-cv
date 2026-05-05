function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseSalary(text) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean;
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN');
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function trimText(text, maxLen = 200) {
  const clean = cleanText(text);
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen) + '...';
}
