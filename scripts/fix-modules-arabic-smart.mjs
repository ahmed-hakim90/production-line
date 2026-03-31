import fs from 'node:fs';
import path from 'node:path';
import iconv from 'iconv-lite';

const root = process.cwd();
const targetRoot = path.join(root, 'modules');
const exts = new Set(['.ts', '.tsx']);

const skipDirs = new Set(['node_modules', 'dist', '.git']);

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue;
      walk(full, out);
      continue;
    }
    if (exts.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
}

const tokenRe = /[\u0600-\u06FF]{2,}/g;
const mojibakePairRe = /(ط[اأإآء-ي]|ظ[اأإآء-ي])/g;
const hardBadRe = /(ط§ظ|ظ„ط|ظ…ط|ط¹ظ|ظ†ط|ظˆط|ط¯ظ|â€”|â€“|â€¦|â€|Ã|Â)/g;

function score(s) {
  const pair = (s.match(mojibakePairRe) ?? []).length;
  const hard = (s.match(hardBadRe) ?? []).length;
  const repl = (s.match(/�/g) ?? []).length;
  return pair * 2 + hard * 6 + repl * 20;
}

function decodeWith(enc, token) {
  try {
    return iconv.decode(iconv.encode(token, enc), 'utf8');
  } catch {
    return token;
  }
}

function bestToken(token) {
  const cands = [
    token,
    decodeWith('windows1256', token),
    decodeWith('latin1', token),
  ];

  let best = token;
  let bestScore = score(token);
  for (const c of cands) {
    if (!c || c.includes('�')) continue;
    const s = score(c);
    if (s < bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

const files = [];
walk(targetRoot, files);

let totalFiles = 0;
let totalRepl = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const uniq = [...new Set(src.match(tokenRe) ?? [])];
  let changed = 0;

  for (const tok of uniq) {
    if (score(tok) === 0) continue;
    const fixed = bestToken(tok);
    if (!fixed || fixed === tok) continue;
    if (score(fixed) >= score(tok)) continue;
    const n = src.split(tok).length - 1;
    if (!n) continue;
    src = src.split(tok).join(fixed);
    changed += n;
  }

  // common punctuation artifacts
  src = src
    .split('â€¹').join('‹')
    .split('â€؛').join('›')
    .split('â€¢').join('•');

  if (changed > 0) {
    fs.writeFileSync(file, src, 'utf8');
    totalFiles += 1;
    totalRepl += changed;
    console.log(`${path.relative(root, file).replace(/\\/g, '/')}: ${changed}`);
  }
}

console.log(`files changed: ${totalFiles}`);
console.log(`total replacements: ${totalRepl}`);

