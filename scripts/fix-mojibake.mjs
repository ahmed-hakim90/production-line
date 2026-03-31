import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import iconv from 'iconv-lite';

const root = process.cwd();
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.css', '.html',
]);

const ignoreDirs = new Set([
  '.git',
  '.firebase',
  'node_modules',
  'dist',
  'functions/lib',
  'coverage',
  '.cursor',
]);

function shouldIgnoreDir(dirName, fullPath) {
  if (ignoreDirs.has(dirName)) return true;
  const p = fullPath.replace(/\\/g, '/');
  if (p.includes('/functions/lib/')) return true;
  return false;
}

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (shouldIgnoreDir(e.name, full)) continue;
      walk(full, out);
      continue;
    }
    const ext = path.extname(e.name).toLowerCase();
    if (!TEXT_EXTS.has(ext)) continue;
    out.push(full);
  }
}

const args = new Set(process.argv.slice(2));
const applySafe = args.has('--apply');
const applyArabic = args.has('--apply-arabic');
const mode = applySafe || applyArabic ? 'apply' : 'report';
const maxEditsPerFile = 500;

// Safe, deterministic replacements (no language/content guessing).
const SAFE_REPLACEMENTS = [
  { label: 'emDash_mojibake', from: '\u00e2\u20ac\u201d', to: '—' }, // — (common)
  { label: 'enDash_mojibake', from: '\u00e2\u20ac\u201c', to: '–' }, // – (common)
  { label: 'rightDoubleQuote_mojibake', from: '\u00e2\u20ac\u009d', to: '”' },
  { label: 'leftDoubleQuote_mojibake', from: '\u00e2\u20ac\u009c', to: '“' },
  { label: 'rightSingleQuote_mojibake', from: '\u00e2\u20ac\u0099', to: '’' },
  { label: 'leftSingleQuote_mojibake', from: '\u00e2\u20ac\u0098', to: '‘' },
  { label: 'ellipsis_mojibake', from: '\u00e2\u20ac\u00a6', to: '…' },
  { label: 'nbsp_mojibake', from: '\u00c2\u00a0', to: '\u00a0' },
];

// Heuristic “Arabic mojibake” detector (report-only).
// Common pattern: lots of repeated Arabic letters (often ط/ظ) interleaved with
// Latin-1/CP1252 symbols like â, €, ™, … etc.
// We do NOT auto-fix these because it can change meaning; we only report.
const AR_MOJIBAKE_RE = /(?:[طظ][^\s]{1,3}){6,}/g;
const AR_TOKEN_RE = /[طظ][\u0600-\u06FF]{1,}/g;

function looksLikeArabic(text) {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const total = text.length || 1;
  return arabic / total >= 0.6;
}

function fixArabicMojibakeChunk(chunk) {
  // Attempt: encode current Unicode string as windows-1256 bytes,
  // then decode bytes as UTF-8 to recover original Arabic.
  // This pattern matches the common “ظ†ط¸...” corruption.
  const bytes = iconv.encode(chunk, 'windows1256');
  const decoded = iconv.decode(bytes, 'utf8');
  if (!decoded || decoded === chunk) return null;
  if (decoded.includes('�')) return null;
  if (!looksLikeArabic(decoded)) return null;
  return decoded;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function applyAll(content) {
  const edits = [];
  let out = content;
  for (const r of SAFE_REPLACEMENTS) {
    const n = countOccurrences(out, r.from);
    if (n > 0) {
      out = out.split(r.from).join(r.to);
      edits.push({ kind: 'safe', label: r.label, count: n });
    }
  }
  return { out, edits };
}

function applyArabicFixes(content) {
  const edits = [];
  let out = content;
  const seen = new Map();

  let m;
  while ((m = AR_MOJIBAKE_RE.exec(content)) !== null) {
    const bad = m[0];
    if (seen.has(bad)) continue;
    const fixed = fixArabicMojibakeChunk(bad);
    seen.set(bad, fixed);
  }
  while ((m = AR_TOKEN_RE.exec(content)) !== null) {
    const bad = m[0];
    if (seen.has(bad)) continue;
    const fixed = fixArabicMojibakeChunk(bad);
    seen.set(bad, fixed);
  }

  for (const [bad, fixed] of seen.entries()) {
    if (!fixed) continue;
    const n = countOccurrences(out, bad);
    if (n > 0) {
      out = out.split(bad).join(fixed);
      edits.push({ kind: 'arabic', label: 'win1256_to_utf8', count: n });
    }
  }

  return { out, edits };
}

function snippetLines(content, idx, radius = 60) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + radius);
  return content.slice(start, end).replace(/\r/g, '');
}

function reportFile(file, content) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const safeMatches = SAFE_REPLACEMENTS
    .map((r) => ({ label: r.label, count: countOccurrences(content, r.from) }))
    .filter((x) => x.count > 0);

  const arHits = [];
  let m;
  while ((m = AR_MOJIBAKE_RE.exec(content)) !== null) {
    arHits.push({ index: m.index, match: m[0] });
    if (arHits.length >= 5) break;
  }

  return { rel, safeMatches, arHits };
}

function main() {
  const files = [];
  walk(root, files);

  const report = {
    mode,
    root,
    scannedFiles: files.length,
    files: [],
    totals: {
      safeEdits: 0,
      filesEdited: 0,
      filesWithArabicMojibake: 0,
    },
  };

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    const fileReport = reportFile(file, content);
    if (fileReport.safeMatches.length === 0 && fileReport.arHits.length === 0) continue;

    if (fileReport.arHits.length > 0) report.totals.filesWithArabicMojibake += 1;

    if (mode === 'apply') {
      const safe = applySafe ? applyAll(content) : { out: content, edits: [] };
      const arabic = applyArabic ? applyArabicFixes(safe.out) : { out: safe.out, edits: [] };
      const out = arabic.out;
      const edits = [...safe.edits, ...arabic.edits];
      const changed = out !== content;
      if (changed) {
        const editCount = edits.reduce((acc, e) => acc + e.count, 0);
        if (editCount > maxEditsPerFile) {
          throw new Error(`Refusing to edit ${fileReport.rel}: too many edits (${editCount}).`);
        }
        fs.writeFileSync(file, out, 'utf8');
        report.totals.safeEdits += editCount;
        report.totals.filesEdited += 1;
      }
      fileReport.appliedSafeEdits = edits;
    }

    fileReport.arExamples = fileReport.arHits.map((h) => ({
      index: h.index,
      snippet: snippetLines(content, h.index),
    }));
    report.files.push(fileReport);
  }

  const outPath = path.join(root, 'scripts', 'fix-mojibake.report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`fix-mojibake: wrote report to ${path.relative(root, outPath)}`);
  // eslint-disable-next-line no-console
  console.log(`fix-mojibake: scanned ${report.scannedFiles} files, edited ${report.totals.filesEdited} files, safeEdits=${report.totals.safeEdits}`);
  // eslint-disable-next-line no-console
  console.log(`fix-mojibake: filesWithArabicMojibake=${report.totals.filesWithArabicMojibake}`);
}

main();

