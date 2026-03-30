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

const countTZ = (s) => (s.match(/[طظ]/g) ?? []).length;
const countAr = (s) => (s.match(/[\u0600-\u06FF]/g) ?? []).length;

function tryDecode(word) {
  try {
    return iconv.decode(iconv.encode(word, 'windows1256'), 'utf8');
  } catch {
    return word;
  }
}

let total = 0;
for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const uniq = [...new Set(src.match(tokenRe) ?? [])];
  let changed = 0;
  for (const bad of uniq) {
    const badTZ = countTZ(bad);
    if (badTZ < 2) continue;
    const fixed = tryDecode(bad);
    if (!fixed || fixed === bad || fixed.includes('�')) continue;
    const fixedAr = countAr(fixed);
    const fixedTZ = countTZ(fixed);
    if (fixedAr < 2) continue;
    if (fixedTZ >= badTZ) continue;
    const n = src.split(bad).length - 1;
    if (!n) continue;
    src = src.split(bad).join(fixed);
    changed += n;
  }
  fs.writeFileSync(file, src, 'utf8');
  total += changed;
  console.log(`${file}: ${changed}`);
}
console.log(`total replacements: ${total}`);

