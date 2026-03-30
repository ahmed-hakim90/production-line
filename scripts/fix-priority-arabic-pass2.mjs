import fs from 'node:fs';
import iconv from 'iconv-lite';

const files = [
  'modules/dashboards/pages/AdminDashboard.tsx',
  'modules/dashboards/pages/FactoryManagerDashboard.tsx',
  'modules/dashboards/pages/EmployeeDashboard.tsx',
  'modules/dashboards/pages/Dashboard.tsx',
  'modules/production/pages/Products.tsx',
];

const tokenRe = /[\u0600-\u06FF]{3,}/g;
const mojibakeScoreRe = /(ط§ظ|ظ„ط|ظ…ط|ط¹ظ|ظ†ط|ظˆط|ط¯ظ|ظƒط|ط±ظ|ظپط|ط®ط)/g;

function score(s) {
  return (s.match(mojibakeScoreRe) ?? []).length;
}

function decodeToken(token) {
  try {
    return iconv.decode(iconv.encode(token, 'windows1256'), 'utf8');
  } catch {
    return token;
  }
}

let total = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const uniq = [...new Set(src.match(tokenRe) ?? [])];
  let changed = 0;
  for (const bad of uniq) {
    // Ignore clear valid words quickly.
    if (score(bad) === 0) continue;
    const fixed = decodeToken(bad);
    if (!fixed || fixed === bad || fixed.includes('�')) continue;
    if (score(fixed) >= score(bad)) continue;
    const count = src.split(bad).length - 1;
    if (!count) continue;
    src = src.split(bad).join(fixed);
    changed += count;
  }
  // Common punctuation leftovers.
  src = src.split('â€¹').join('‹');
  src = src.split('â€؛').join('›');
  src = src.split('â€¢').join('•');
  fs.writeFileSync(file, src, 'utf8');
  total += changed;
  console.log(`${file}: ${changed}`);
}

console.log(`total replacements: ${total}`);

