import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';

const root = process.cwd();
const base = path.join(root, 'modules');
const exts = new Set(['.ts', '.tsx']);

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (exts.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
}

const files = [];
walk(base, files);

const chunkRe = /[A-Za-z0-9_\-\u0600-\u06FF\u00A0-\u00FF]{3,}/g;
const noisyRe = /[§©£¢¤¥¦¬®°±²³µ¶·¸¹º»¼½¾¿]/;

const score = (s) => (s.match(noisyRe) ? 10 : 0) + ((s.match(/[طظ]/g) ?? []).length);

function decodeCandidates(s) {
  const out = new Set([s]);
  try { out.add(iconv.decode(iconv.encode(s, 'latin1'), 'utf8')); } catch {}
  try { out.add(iconv.decode(iconv.encode(s, 'windows1256'), 'utf8')); } catch {}
  return [...out];
}

let totalFiles = 0;
let total = 0;
for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const uniq = [...new Set(src.match(chunkRe) ?? [])];
  let changed = 0;
  for (const bad of uniq) {
    if (!noisyRe.test(bad)) continue;
    const cands = decodeCandidates(bad).filter((c) => c && !c.includes('�'));
    let best = bad;
    let bestScore = score(bad);
    for (const c of cands) {
      const s = score(c);
      if (s < bestScore) {
        best = c;
        bestScore = s;
      }
    }
    if (best === bad) continue;
    const n = src.split(bad).length - 1;
    if (!n) continue;
    src = src.split(bad).join(best);
    changed += n;
  }
  if (changed > 0) {
    fs.writeFileSync(file, src, 'utf8');
    console.log(`${path.relative(root, file).replace(/\\/g, '/')}: ${changed}`);
    total += changed;
    totalFiles += 1;
  }
}

console.log(`files changed: ${totalFiles}`);
console.log(`replacements: ${total}`);

