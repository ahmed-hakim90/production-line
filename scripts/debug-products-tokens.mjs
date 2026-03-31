import fs from 'node:fs';
import iconv from 'iconv-lite';

const s = fs.readFileSync('modules/production/pages/Products.tsx', 'utf8');
const tokenRe = /[\u0600-\u06FF]{3,}/g;
const uniq = [...new Set(s.match(tokenRe) ?? [])];
let shown = 0;
for (const t of uniq) {
  if (!/[طظ]/.test(t)) continue;
  const d = iconv.decode(iconv.encode(t, 'windows1256'), 'utf8');
  if (d === t) continue;
  console.log(JSON.stringify({ bad: t, dec: d }));
  shown += 1;
  if (shown >= 40) break;
}
console.log('shown', shown);

