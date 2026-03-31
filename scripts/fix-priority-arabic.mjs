import fs from 'node:fs';
import iconv from 'iconv-lite';

const files = [
  'modules/dashboards/pages/AdminDashboard.tsx',
  'modules/dashboards/pages/FactoryManagerDashboard.tsx',
  'modules/dashboards/pages/EmployeeDashboard.tsx',
  'modules/dashboards/pages/Dashboard.tsx',
  'modules/production/pages/Products.tsx',
];

const tokenRe = /[طظ][^\s'"`<>()[\]{}:,;]{1,}/g;

function looksArabic(text) {
  const ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  return ar / Math.max(text.length, 1) >= 0.55;
}

function decodeToken(token) {
  try {
    const decoded = iconv.decode(iconv.encode(token, 'windows1256'), 'utf8');
    if (!decoded || decoded === token || decoded.includes('�')) return null;
    if (!looksArabic(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

let total = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const unique = [...new Set(src.match(tokenRe) ?? [])];
  let changed = 0;
  for (const bad of unique) {
    const fixed = decodeToken(bad);
    if (!fixed) continue;
    const count = src.split(bad).length - 1;
    if (!count) continue;
    src = src.split(bad).join(fixed);
    changed += count;
  }
  fs.writeFileSync(file, src, 'utf8');
  total += changed;
  console.log(`${file}: ${changed}`);
}

console.log(`total replacements: ${total}`);

