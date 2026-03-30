import fs from 'node:fs';
import path from 'node:path';

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

const PAIRS = [
  ['ط§', 'ا'],
  ['ط¨', 'ب'],
  ['طھ', 'ت'],
  ['ط«', 'ث'],
  ['ط¬', 'ج'],
  ['ط­', 'ح'],
  ['ط®', 'خ'],
  ['ط¯', 'د'],
  ['ط°', 'ذ'],
  ['ط±', 'ر'],
  ['ط²', 'ز'],
  ['ط³', 'س'],
  ['ط´', 'ش'],
  ['طµ', 'ص'],
  ['ط¶', 'ض'],
  ['ط·', 'ط'],
  ['ط¸', 'ظ'],
  ['ط¹', 'ع'],
  ['ط؛', 'غ'],
  ['ظپ', 'ف'],
  ['ظ‚', 'ق'],
  ['ظƒ', 'ك'],
  ['ظ„', 'ل'],
  ['ظ…', 'م'],
  ['ظ†', 'ن'],
  ['ظ‡', 'ه'],
  ['ظˆ', 'و'],
  ['ظٹ', 'ي'],
  ['ظ‰', 'ى'],
  ['ط©', 'ة'],
  ['ط¥', 'إ'],
  ['ط£', 'أ'],
  ['ط¢', 'آ'],
  ['ط¦', 'ئ'],
  ['ط¤', 'ؤ'],
  ['ط¡', 'ء'],
  ['ط،', '،'],
  ['ط›', '؟'],
  ['ط؛ظٹط±', 'غير'],
  ['ط¬ط¯ط§ظ‹', 'جداً'],
  ['â€¹', '‹'],
  ['â€؛', '›'],
  ['â€¢', '•'],
];

const files = [];
walk(base, files);

let changedFiles = 0;
let total = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  let local = 0;
  for (const [bad, good] of PAIRS) {
    const n = src.split(bad).length - 1;
    if (!n) continue;
    src = src.split(bad).join(good);
    local += n;
  }
  if (local > 0) {
    fs.writeFileSync(file, src, 'utf8');
    changedFiles += 1;
    total += local;
    console.log(`${path.relative(root, file).replace(/\\/g, '/')}: ${local}`);
  }
}

console.log(`changed files: ${changedFiles}`);
console.log(`total replacements: ${total}`);

