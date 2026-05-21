#!/usr/bin/env node
/**
 * Generate Hakimo ERP handover PDF with screenshots from local dev.
 * Usage: node scripts/handover/generate-handover.mjs
 *
 * Env (optional):
 *   HANDOVER_BASE_URL=http://localhost:3001
 *   HANDOVER_TENANT_SLUG=sokany
 *   HANDOVER_CHROME_PROFILE=/path/to/Chrome/Profile 1
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'docs/handover');
const SCREEN_DIR = path.join(OUT_DIR, '_screenshots');
const BUILD_DIR = path.join(OUT_DIR, '_build');
const PDF_PATH = path.join(OUT_DIR, 'Hakimo-ERP-Handover-2026-05.pdf');
const HTML_PATH = path.join(BUILD_DIR, 'handover.html');

const BASE_URL = process.env.HANDOVER_BASE_URL || 'http://localhost:3001';
const TENANT = process.env.HANDOVER_TENANT_SLUG || 'sokany-eg';
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const DEFAULT_CHROME_PROFILE = path.join(
  process.env.HOME || '',
  'Library/Application Support/Google/Chrome/Profile 1',
);
const CHROME_PROFILE_SRC =
  process.env.HANDOVER_CHROME_PROFILE || DEFAULT_CHROME_PROFILE;
const CHROME_PROFILE_DST = path.join(OUT_DIR, '_chrome-profile');

/** @type {{ id: string, file: string, path: string, caption: string, waitText?: string, fullPage?: boolean }[]} */
const SCREENSHOTS = [
  { id: 'home', file: '01-home.png', path: '/', caption: 'الصفحة الرئيسية — لوحة التحكم', waitText: 'الرئيسية' },
  { id: 'menu', file: '02-menu.png', path: '/', caption: 'القائمة الجانبية — مجموعات الإنتاج والمخازن والتكاليف', waitText: 'الإنتاج' },
  { id: 'quick', file: '10-quick-action.png', path: '/quick-action', caption: 'إدخال سريع — تقرير إنتاج يومي', waitText: 'إدخال' },
  { id: 'reports', file: '11-reports.png', path: '/reports', caption: 'تقارير الإنتاج', waitText: 'تقرير' },
  { id: 'plans', file: '12-production-plans.png', path: '/production-plans', caption: 'خطط الإنتاج', waitText: 'خطة' },
  { id: 'workorders', file: '13-work-orders.png', path: '/work-orders', caption: 'أوامر الشغل', waitText: 'أمر' },
  { id: 'lines', file: '14-lines.png', path: '/lines', caption: 'خطوط الإنتاج', waitText: 'خط' },
  { id: 'routing', file: '15-routing.png', path: '/production/routing', caption: 'مسارات الإنتاج', waitText: 'مسار' },
  { id: 'products', file: '16-products.png', path: '/products', caption: 'كتالوج المنتجات', waitText: 'منتج' },
  { id: 'materials', file: '20-materials.png', path: '/manufacturing/materials', caption: 'المواد التصنيعية', waitText: 'مادة' },
  { id: 'planning', file: '21-planning-run.png', path: '/manufacturing/planning-run', caption: 'تخطيط احتياجات المواد', waitText: 'تخطيط' },
  { id: 'inv-dash', file: '30-inventory.png', path: '/inventory', caption: 'لوحة المخزون', waitText: 'مخزون' },
  { id: 'warehouses', file: '31-warehouses.png', path: '/inventory/warehouses', caption: 'إدارة المخازن', waitText: 'مخزن' },
  { id: 'balances', file: '32-balances.png', path: '/inventory/balances', caption: 'أرصدة المخزون', waitText: 'رصيد' },
  { id: 'transactions', file: '33-transactions.png', path: '/inventory/transactions', caption: 'حركات المخزون', waitText: 'حركة' },
  { id: 'approvals', file: '34-transfer-approvals.png', path: '/inventory/transfer-approvals', caption: 'اعتماد التحويلات', waitText: 'تحويل' },
  { id: 'quickxfer', file: '35-quick-transfer.png', path: '/quick-inventory-transfer', caption: 'تحويل سريع بين المخازن', waitText: 'تحويل' },
  { id: 'movements', file: '36-movements.png', path: '/inventory/movements', caption: 'إدخال حركة مخزون', waitText: 'حركة' },
  { id: 'counts', file: '37-counts.png', path: '/inventory/counts', caption: 'جرد المخزون', waitText: 'جرد' },
  { id: 'settings-routing', file: '38-settings-routing.png', path: '/settings', caption: 'إعدادات توجيه المخزون (النظام)', waitText: 'إعدادات', fullPage: true },
  { id: 'monthly-costs', file: '40-monthly-costs.png', path: '/monthly-costs', caption: 'تكلفة الإنتاج الشهرية', waitText: 'تكلفة' },
  { id: 'cost-health', file: '41-cost-health.png', path: '/costs/health', caption: 'صحة بيانات التكاليف', waitText: 'صحة' },
  { id: 'cost-centers', file: '42-cost-centers.png', path: '/cost-centers', caption: 'مراكز التكلفة', waitText: 'مركز' },
  { id: 'cost-settings', file: '43-cost-settings.png', path: '/cost-settings', caption: 'إعدادات التكلفة', waitText: 'إعدادات' },
  { id: 'assets', file: '44-assets.png', path: '/costs/assets', caption: 'الأصول والإهلاك', waitText: 'أصل' },
  { id: 'roles', file: '50-roles.png', path: '/roles', caption: 'الأدوار والصلاحيات', waitText: 'دور' },
];

function copyChromeProfile() {
  if (!fs.existsSync(CHROME_PROFILE_SRC)) {
    console.warn(`Chrome profile not found: ${CHROME_PROFILE_SRC}`);
    return false;
  }
  fs.mkdirSync(CHROME_PROFILE_DST, { recursive: true });
  const copyEntry = (name) => {
    const src = path.join(CHROME_PROFILE_SRC, name);
    const dst = path.join(CHROME_PROFILE_DST, name);
    if (!fs.existsSync(src)) return;
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dst, { recursive: true, force: true });
    } else {
      fs.copyFileSync(src, dst);
    }
  };
  copyEntry('Local State');
  copyEntry('Preferences');
  copyEntry('IndexedDB');
  copyEntry('Local Storage');
  copyEntry('Session Storage');
  copyEntry('Cookies');
  return true;
}

function tenantUrl(logicalPath) {
  const p = logicalPath.startsWith('/') ? logicalPath : `/${logicalPath}`;
  return `${BASE_URL}/t/${TENANT}${p === '/' ? '/' : p}`;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function loadEnvLocal() {
  return loadEnvFile(path.join(ROOT, '.env.local'));
}

function loadHandoverCredentials() {
  const credPath = path.join(OUT_DIR, '.credentials');
  const examplePath = path.join(OUT_DIR, '.credentials.example');
  const file = fs.existsSync(credPath) ? credPath : examplePath;
  const parsed = loadEnvFile(file);
  return {
    email: process.env.HANDOVER_EMAIL || parsed.HANDOVER_EMAIL,
    password: process.env.HANDOVER_PASSWORD || parsed.HANDOVER_PASSWORD,
    tenant: process.env.HANDOVER_TENANT_SLUG || parsed.HANDOVER_TENANT_SLUG || TENANT,
  };
}

async function signInWithPassword(page, slug) {
  const env = loadEnvLocal();
  const { email, password } = loadHandoverCredentials();
  if (!email || !password) {
    console.warn('Missing HANDOVER_EMAIL/PASSWORD in docs/handover/.credentials');
    return false;
  }

  const apiKey = env.VITE_FIREBASE_API_KEY;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!data.idToken) {
    console.warn('Firebase signIn failed:', data.error?.message || 'unknown');
    return false;
  }

  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  await page.goto(`${BASE_URL}/t/${slug}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  if (!page.url().includes('/login')) {
    return true;
  }

  const hasLoginForm = await page
    .locator('#login-email')
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  if (!hasLoginForm) {
    return !page.url().includes('/login');
  }
  await page.locator('#login-email').fill(email);
  await page.locator('#login-pwd').fill(password);
  await page.waitForTimeout(400);
  await page.locator('button[type="submit"]:not([disabled])').click({ timeout: 20000 });

  try {
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
  } catch {
    /* fallback: CDN auth then hard reload */
    const signedIn = await page.evaluate(
      async ({ config, email, password }) => {
        const { initializeApp, getApps, deleteApp } = await import(
          'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'
        );
        const { getAuth, signInWithEmailAndPassword } = await import(
          'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js'
        );
        for (const a of getApps()) await deleteApp(a);
        const app = initializeApp(config);
        const auth = getAuth(app);
        await signInWithEmailAndPassword(auth, email, password);
        return !!auth.currentUser;
      },
      { config: firebaseConfig, email, password },
    );
    if (!signedIn) return false;
    await page.goto(`${BASE_URL}/t/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(5000);
  }

  await page.waitForTimeout(3000);
  const ok = !page.url().includes('/login');
  if (ok) console.log(`Signed in as ${email}`);
  return ok;
}

async function detectTenantSlug(page) {
  for (const slug of [TENANT, 'sokany', 'default', 'hakimo']) {
    await page.goto(`${BASE_URL}/t/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const url = page.url();
    if (!url.includes('/login') && !url.includes('/setup') && !url.includes('/pending')) {
      return slug;
    }
  }
  return TENANT;
}

async function waitForAppReady(page, waitText) {
  await page.waitForTimeout(1500);
  if (page.url().includes('/login')) return false;
  if (waitText) {
    try {
      await page.getByText(waitText, { exact: false }).first().waitFor({ timeout: 12000 });
    } catch {
      /* page may use icons only */
    }
  }
  await page.waitForTimeout(800);
  return true;
}

async function captureScreenshots() {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  const AUTH_STATE = path.join(OUT_DIR, '_auth-state.json');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ar-EG',
    ...(fs.existsSync(AUTH_STATE) ? { storageState: AUTH_STATE } : {}),
  });

  const page = context.pages()[0] || (await context.newPage());
  const creds = loadHandoverCredentials();
  let slug = creds.tenant || TENANT;
  let loggedIn = await signInWithPassword(page, slug);
  if (!loggedIn) {
    slug = await detectTenantSlug(page);
    loggedIn = await signInWithPassword(page, slug);
    if (!loggedIn) {
      console.warn('Could not authenticate — screenshots may show login page only.');
    }
  }
  console.log(`Using tenant slug: ${slug} (auth: ${loggedIn})`);

  if (loggedIn) {
    await context.storageState({ path: AUTH_STATE });
  }

  const results = {};
  for (const shot of SCREENSHOTS) {
    const url = `${BASE_URL}/t/${slug}${shot.path === '/' ? '/' : shot.path}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2000);
      if (page.url().includes('/login')) {
        await signInWithPassword(page, slug);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(2500);
      }
      const ok = await waitForAppReady(page, shot.waitText);
      const out = path.join(SCREEN_DIR, shot.file);
      if (shot.id === 'menu') {
        const sidebar = page.locator('aside, nav[aria-label], .erp-sidebar, [class*="sidebar"]').first();
        if (await sidebar.count()) {
          await sidebar.screenshot({ path: out });
        } else {
          await page.screenshot({ path: out, fullPage: false });
        }
      } else {
        await page.screenshot({ path: out, fullPage: !!shot.fullPage });
      }
      results[shot.id] = ok ? 'ok' : 'login-redirect';
      console.log(`  ${shot.file}: ${results[shot.id]}`);
    } catch (err) {
      results[shot.id] = `error: ${err.message}`;
      console.warn(`  ${shot.file}: FAILED — ${err.message}`);
    }
  }

  await context.close();
  await browser.close();
  return { slug, results };
}

function imgTag(file, caption, figNum) {
  const full = path.join(SCREEN_DIR, file);
  if (!fs.existsSync(full)) {
    return `<p class="missing">[لم تُلتقط لقطة: ${caption}]</p>`;
  }
  const rel = path.relative(BUILD_DIR, full).split(path.sep).join('/');
  return `<figure><img src="${rel}" alt="${caption}" /><figcaption>الشكل ${figNum}: ${caption}</figcaption></figure>`;
}

function buildHtml(slug) {
  const today = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  let fig = 0;
  const figCap = (file, cap) => imgTag(file, cap, ++fig);

  const sections = SCREENSHOTS.map((s) => figCap(s.file, s.caption)).join('\n');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>دليل تسليم Hakimo ERP — الإنتاج والمخازن والتكاليف</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Cairo', system-ui, sans-serif; font-size: 11pt; line-height: 1.65; color: #1a1a2e; margin: 0; }
    .cover { page-break-after: always; min-height: 90vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg, #0f3460 0%, #16213e 50%, #1a1a2e 100%); color: #fff; padding: 48px; }
    .cover h1 { font-size: 28pt; margin: 0 0 12px; }
    .cover p { font-size: 13pt; opacity: 0.9; max-width: 520px; }
    .cover .meta { margin-top: 32px; font-size: 11pt; opacity: 0.75; }
    h2 { color: #0f3460; border-bottom: 2px solid #e94560; padding-bottom: 6px; margin-top: 28px; page-break-after: avoid; }
    h3 { color: #16213e; margin-top: 18px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: right; }
    th { background: #f0f4f8; }
    figure { margin: 16px 0; page-break-inside: avoid; }
    figure img { max-width: 100%; border: 1px solid #ddd; border-radius: 6px; }
    figcaption { font-size: 9.5pt; color: #555; margin-top: 6px; text-align: center; }
    .missing { color: #c0392b; font-style: italic; }
    ul, ol { padding-right: 22px; }
    .checklist li { margin: 6px 0; }
    .toc { page-break-after: always; }
    .toc a { color: #0f3460; text-decoration: none; }
    .note { background: #fff8e6; border-right: 4px solid #f39c12; padding: 10px 14px; margin: 12px 0; font-size: 10pt; }
    code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 9.5pt; direction: ltr; display: inline-block; }
    footer.doc-footer { font-size: 9pt; color: #888; text-align: center; margin-top: 24px; }
  </style>
</head>
<body>

<section class="cover">
  <h1>Hakimo ERP</h1>
  <p>دليل تسليم وتدريب — موديولات الإنتاج، المواد التصنيعية، المخازن، والتكاليف</p>
  <p class="meta">الإصدار ${PKG.version} · ${today}<br/>المستأجر (Tenant): <strong>${slug}</strong> · البيئة: تطوير محلي (${BASE_URL})</p>
</section>

<nav class="toc">
  <h2>فهرس المحتويات</h2>
  <ol>
    <li><a href="#ch1">مقدمة ونطاق النظام</a></li>
    <li><a href="#ch2">البنية والتدفقات بين الموديولات</a></li>
    <li><a href="#ch3">الصفحات الرئيسية (لوحات التحكم)</a></li>
    <li><a href="#ch4">موديول الإنتاج</a></li>
    <li><a href="#ch5">المواد التصنيعية وقائمة المواد (BOM)</a></li>
    <li><a href="#ch6">موديول المخازن</a></li>
    <li><a href="#ch7">موديول التكاليف</a></li>
    <li><a href="#ch8">الصلاحيات والأدوار</a></li>
    <li><a href="#ch9">تشغيل يومي وقائمة تحقق</a></li>
    <li><a href="#ch10">جاهزية التشغيل الكامل</a></li>
    <li><a href="#ch11">المراقبة والمتابعة اليومية</a></li>
    <li><a href="#ch12">التحليلات وحدود النظام</a></li>
  </ol>
</nav>

<h2 id="ch1">1. مقدمة ونطاق النظام</h2>
<p><strong>Hakimo ERP</strong> نظام ويب متعدد المستأجرين (Multi-tenant) لإدارة المصنع: كل شركة لها مسار URL خاص <code>/t/{slug}/</code> وبيانات معزولة في Firestore.</p>
<p>هذا الدليل يغطي:</p>
<ul>
  <li><strong>الإنتاج</strong> — تقارير يومية، خطط، أوامر شغل، خطوط، مسارات، دورات توريد.</li>
  <li><strong>المواد التصنيعية</strong> — مواد، BOM، تخطيط احتياجات (مرتبط بالإنتاج والمخزون).</li>
  <li><strong>المخازن</strong> — مخازن، أرصدة، حركات، تحويلات، جرد، توجيه مخزون.</li>
  <li><strong>التكاليف</strong> — مراكز تكلفة، تكلفة شهرية، أصول، صحة البيانات.</li>
</ul>
<div class="note">صفحة <code>/products/raw-materials</code> قديمة (قراءة فقط). استخدم <code>/manufacturing/materials</code> للمواد الجديدة.</div>

<h2 id="ch2">2. البنية والتدفقات بين الموديولات</h2>
<p>التسلسل التشغيلي الموصى به:</p>
<ol>
  <li>إعداد <strong>مخازن</strong> + <strong>توجيه مخزون</strong> من الإعدادات.</li>
  <li>تعريف <strong>مواد تصنيعية</strong> و<strong>BOM</strong> لكل منتج.</li>
  <li>إنشاء <strong>خطة إنتاج</strong> → توليد <strong>احتياجات مواد</strong> → <strong>أمر شغل</strong>.</li>
  <li>تسجيل <strong>تقرير إنتاج</strong> (إدخال سريع أو التقارير) → حركات/تحويلات مخزون تلقائية.</li>
  <li><strong>اعتماد تحويلات</strong> إن كان التوجيه يتطلب موافقة.</li>
  <li>نهاية الشهر: <strong>مراكز تكلفة</strong> → <strong>تكلفة إنتاج شهرية</strong>.</li>
</ol>
<table>
  <tr><th>الحدث</th><th>الخدمة / الملف</th><th>التأثير</th></tr>
  <tr><td>حفظ تقرير إنتاج</td><td><code>productionInventoryService</code></td><td>حركة مخزون + طلب تحويل</td></tr>
  <tr><td>خطة إنتاج</td><td><code>materialRequirementService</code></td><td>احتياجات مواد في Firestore</td></tr>
  <tr><td>تكلفة تشغيل</td><td><code>costCalculations</code> + <code>modules/costs</code></td><td>تكلفة شهرية ومراكز</td></tr>
  <tr><td>تكلفة مادة</td><td><code>materialCostEngine</code></td><td>تقديرات BOM والتخطيط</td></tr>
</table>

<h2 id="ch3">3. الصفحات الرئيسية</h2>
<p>المسار <code>/</code> يعرض لوحة حسب الصلاحية: مدير نظام، مدير مصنع، موظف، أو لوحة عامة (<code>HomeDashboardRouter</code>).</p>
${figCap('01-home.png', 'الصفحة الرئيسية')}
${figCap('02-menu.png', 'القائمة الجانبية')}

<h2 id="ch4">4. موديول الإنتاج</h2>
<table>
  <tr><th>الصفحة</th><th>المسار</th><th>الصلاحية</th><th>الغرض</th></tr>
  <tr><td>إدخال سريع</td><td><code>/quick-action</code></td><td>quickAction.view</td><td>تقرير يومي سريع</td></tr>
  <tr><td>التقارير</td><td><code>/reports</code></td><td>reports.view</td><td>عرض وتعديل واستيراد</td></tr>
  <tr><td>خطط الإنتاج</td><td><code>/production-plans</code></td><td>plans.view</td><td>تخطيط ومتابعة واحتياجات</td></tr>
  <tr><td>أوامر الشغل</td><td><code>/work-orders</code></td><td>workOrders.view</td><td>تتبع ومسح</td></tr>
  <tr><td>خطوط الإنتاج</td><td><code>/lines</code></td><td>lines.view</td><td>إعداد الخطوط</td></tr>
  <tr><td>مسارات الإنتاج</td><td><code>/production/routing</code></td><td>routing.view</td><td>خطوات زمنية للمنتج</td></tr>
  <tr><td>المنتجات</td><td><code>/products</code></td><td>products.view</td><td>كتالوج + BOM</td></tr>
</table>
${figCap('10-quick-action.png', 'إدخال سريع')}
${figCap('11-reports.png', 'تقارير الإنتاج')}
${figCap('12-production-plans.png', 'خطط الإنتاج')}
${figCap('13-work-orders.png', 'أوامر الشغل')}
${figCap('14-lines.png', 'خطوط الإنتاج')}
${figCap('15-routing.png', 'مسارات الإنتاج')}
${figCap('16-products.png', 'المنتجات')}

<h2 id="ch5">5. المواد التصنيعية و BOM</h2>
<p>المجموعات: <code>materials</code>, <code>boms</code>, <code>bom_items</code>, <code>production_plan_material_requirements</code>.</p>
${figCap('20-materials.png', 'المواد التصنيعية')}
${figCap('21-planning-run.png', 'تخطيط احتياجات المواد')}

<h2 id="ch6">6. موديول المخازن</h2>
<table>
  <tr><th>الصفحة</th><th>المسار</th><th>الغرض</th></tr>
  <tr><td>لوحة المخزون</td><td><code>/inventory</code></td><td>KPIs وتحذيرات</td></tr>
  <tr><td>المخازن</td><td><code>/inventory/warehouses</code></td><td>تعريف المخازن وأدوارها</td></tr>
  <tr><td>الأرصدة</td><td><code>/inventory/balances</code></td><td>عرض وتعديل</td></tr>
  <tr><td>الحركات</td><td><code>/inventory/transactions</code></td><td>سجل الحركات</td></tr>
  <tr><td>اعتماد التحويلات</td><td><code>/inventory/transfer-approvals</code></td><td>موافقة تحويلات الإنتاج/اليدوي</td></tr>
  <tr><td>تحويل سريع</td><td><code>/quick-inventory-transfer</code></td><td>تحويل متعدد الأسطر</td></tr>
  <tr><td>إدخال حركة</td><td><code>/inventory/movements</code></td><td>وارد/صادر/تحويل/تسوية</td></tr>
  <tr><td>الجرد</td><td><code>/inventory/counts</code></td><td>جلسات جرد</td></tr>
</table>
${figCap('30-inventory.png', 'لوحة المخزون')}
${figCap('31-warehouses.png', 'إدارة المخازن')}
${figCap('32-balances.png', 'الأرصدة')}
${figCap('33-transactions.png', 'الحركات')}
${figCap('34-transfer-approvals.png', 'اعتماد التحويلات')}
${figCap('35-quick-transfer.png', 'تحويل سريع')}
${figCap('36-movements.png', 'إدخال حركة')}
${figCap('37-counts.png', 'الجرد')}
${figCap('38-settings-routing.png', 'توجيه المخزون')}

<h2 id="ch7">7. موديول التكاليف</h2>
<table>
  <tr><th>نوع التكلفة</th><th>المصدر</th><th>الاستخدام</th></tr>
  <tr><td>تكلفة وحدة مادة/BOM</td><td>materialCostEngine</td><td>تخطيط واحتياجات</td></tr>
  <tr><td>تكلفة تشغيل/محاسبة</td><td>costCalculations + modules/costs</td><td>شهرية ومراكز وأصول</td></tr>
</table>
${figCap('40-monthly-costs.png', 'تكلفة الإنتاج الشهرية')}
${figCap('41-cost-health.png', 'صحة بيانات التكاليف')}
${figCap('42-cost-centers.png', 'مراكز التكلفة')}
${figCap('43-cost-settings.png', 'إعدادات التكلفة')}
${figCap('44-assets.png', 'الأصول')}

<h2 id="ch8">8. الصلاحيات والأدوار</h2>
<table>
  <tr><th>الدور النموذجي</th><th>صلاحيات أساسية</th><th>صفحات رئيسية</th></tr>
  <tr><td>مشرف إنتاج</td><td>reports.*, plans.view, workOrders.view</td><td>تقارير، خطط، أوامر شغل</td></tr>
  <tr><td>أمين مخزن</td><td>inventory.*</td><td>مخازن، أرصدة، حركات، اعتماد</td></tr>
  <tr><td>محاسب تكاليف</td><td>costs.view, costs.manage</td><td>مراكز، شهرية، أصول</td></tr>
  <tr><td>مدير مصنع</td><td>factoryDashboard + مجموعات متعددة</td><td>لوحة مصنع + إشراف</td></tr>
</table>
${figCap('50-roles.png', 'الأدوار والصلاحيات')}

<h2 id="ch9">9. تشغيل يومي وقائمة تحقق</h2>
<ul class="checklist">
  <li>☐ إعداد مخازن + توجيه مخزون قبل أول تقرير إنتاج</li>
  <li>☐ مواد تصنيعية + BOM للمنتجات النشطة</li>
  <li>☐ خطوط إنتاج + ربط عمال ومشرفين</li>
  <li>☐ دورة: خطة → أمر شغل → تقرير → اعتماد تحويل</li>
  <li>☐ نهاية الشهر: مراكز تكلفة → تكلفة شهرية → صحة البيانات</li>
</ul>
<h3>جلسة تدريب مقترحة (90 دقيقة)</h3>
<ol>
  <li>15 د — مقدمة ولوحة التحكم</li>
  <li>25 د — إنتاج + BOM</li>
  <li>25 د — مخازن وتوجيه</li>
  <li>15 د — تكاليف</li>
  <li>10 د — صلاحيات وأسئلة</li>
</ol>
<h3>أسئلة شائعة</h3>
<ul>
  <li><strong>تحويل يدوي vs تلقائي:</strong> التقارير تنشئ <code>production_auto</code>؛ التحويل السريع <code>manual</code>.</li>
  <li><strong>سالب المخزن:</strong> يتطلب صلاحية <code>inventory.finishedStock.allowNegativeApprove</code> عند الاعتماد.</li>
  <li><strong>خط التعبئة:</strong> لا يزيد كمية أمر الشغل بنفس منطق خط التجميع.</li>
</ul>

<h2 id="ch10">10. جاهزية التشغيل الكامل</h2>
<p>التشغيل «الكامل» يعني: البيانات والإعدادات جاهزة قبل الاعتماد على المخزون التلقائي والتكلفة الشهرية.</p>
<h3>مرحلة A — أسبوع الإعداد (إلزامي)</h3>
<table>
  <tr><th>#</th><th>المهمة</th><th>المسار</th></tr>
  <tr><td>A1</td><td>3+ مخازن</td><td><code>/inventory/warehouses</code></td></tr>
  <tr><td>A3</td><td>توجيه مخزون V1 (WIP + تم الصنع)</td><td><code>/settings</code></td></tr>
  <tr><td>A4</td><td>مزامنة ترحيل V1</td><td><code>/settings</code></td></tr>
  <tr><td>B1–B2</td><td>مواد تصنيعية + BOM لكل منتج نشط</td><td><code>/manufacturing/materials</code>, <code>/products</code></td></tr>
  <tr><td>C1</td><td>تكلفة شراء لكل مادة</td><td>تفاصيل المادة</td></tr>
  <tr><td>D1</td><td>خطوط + ربط عمال/مشرفين</td><td><code>/lines</code></td></tr>
  <tr><td>E1–E2</td><td>مراكز تكلفة + إعدادات عمالة</td><td><code>/cost-centers</code>, <code>/cost-settings</code></td></tr>
</table>
<div class="note">تحقق آلي: <code>npm run handover:readiness</code> — يقرأ Firestore ويطبع نسبة الجاهزية.</div>
<h3>علامات نجاح</h3>
<ul>
  <li>لا رسالة «توجيه المخازن غير مكتمل» على <code>/inventory</code>.</li>
  <li>بعد تقرير إنتاج: حركة/تحويل في المخزون.</li>
  <li>متوسط تكلفة وحدة &gt; 0 على لوحة Admin بعد إقفال شهر (وليس بيانات ناقصة).</li>
</ul>
<h3>فجوات في دورة التشغيل (ليست صفحات ناقصة)</h3>
<ul>
  <li>احتياجات المواد: توليد <strong>يدوي</strong> من الخطة — ليس تلقائياً عند الإنشاء.</li>
  <li>اعتماد التحويلات: إلزامي إذا <code>requireApprovalForAutoTransfers</code> مفعّل.</li>
  <li>إقفال التكلفة الشهرية: عملية إدارية من <code>/monthly-costs</code>.</li>
</ul>

<h2 id="ch11">11. المراقبة والمتابعة اليومية</h2>
<p>لا يوجد «مركز عمليات» واحد — استخدم الروتين التالي (15–25 دقيقة):</p>
<h3>مدير مصنع / مشرف إنتاج</h3>
<table>
  <tr><th>الترتيب</th><th>الصفحة</th><th>المسار</th><th>التركيز</th></tr>
  <tr><td>1</td><td>لوحة المصنع</td><td><code>/</code></td><td>إنتاج، هالك، خطوط</td></tr>
  <tr><td>2</td><td>خطط الإنتاج</td><td><code>/production-plans</code></td><td>تأخير، follow-up نقص</td></tr>
  <tr><td>3</td><td>أوامر الشغل</td><td><code>/work-orders</code></td><td>عالقة</td></tr>
  <tr><td>4</td><td>التقارير</td><td><code>/reports</code></td><td>اكتمال اليوم</td></tr>
</table>
<h3>أمين مخزن</h3>
<table>
  <tr><th>الترتيب</th><th>الصفحة</th><th>المسار</th><th>التركيز</th></tr>
  <tr><td>1</td><td>لوحة المخزون</td><td><code>/inventory</code></td><td>معلق، سالب، توجيه</td></tr>
  <tr><td>2</td><td>اعتماد التحويلات</td><td><code>/inventory/transfer-approvals</code></td><td>production_auto / manual</td></tr>
  <tr><td>3</td><td>الحركات</td><td><code>/inventory/transactions</code></td><td>مراجعة سريعة</td></tr>
</table>
<h3>محاسب</h3>
<p><code>/costs/health</code> — معالجة مشاكل حرجة قبل نهاية الشهر.</p>
<div class="note">مرجع تفصيلي: <code>docs/handover/OPS_DAILY_ROUTINE.md</code></div>

<h2 id="ch12">12. التحليلات وحدود النظام</h2>
<h3>متاح اليوم</h3>
<table>
  <tr><th>التحليل</th><th>أين</th></tr>
  <tr><td>KPIs + رسوم إنتاج/تكلفة</td><td>لوحات <code>/</code>, Admin, Factory</td></tr>
  <tr><td>تحليلات مسارات</td><td><code>/production/routing/analytics</code></td></tr>
  <tr><td>تخطيط احتياجات</td><td><code>/manufacturing/planning-run</code></td></tr>
  <tr><td>تكلفة شهرية + انحراف</td><td><code>/monthly-costs</code></td></tr>
  <tr><td>صحة بيانات التكاليف</td><td><code>/costs/health</code></td></tr>
  <tr><td>تصدير Excel</td><td>تقارير، خطط، أرصدة، تكاليف</td></tr>
</table>
<h3>روتين شهري (مرجع)</h3>
<ol>
  <li>صحة تكاليف → إقفال شهر → تحليل انحراف.</li>
  <li>تحليلات مسارات للمنتجات ذات routing.</li>
  <li>تخطيط احتياجات قبل الذروة.</li>
  <li>جرد + تصدير أرصدة عند الحاجة.</li>
</ol>
<p>مرجع: <code>docs/handover/OPS_MONTHLY_ROUTINE.md</code></p>
<h3>ما ينقص (لا تتوقعه من النظام حالياً)</h3>
<table>
  <tr><th>#</th><th>النقص</th></tr>
  <tr><td>1</td><td>لوحة تحليلات مخزون (ABC، دوران، تقادم)</td></tr>
  <tr><td>2</td><td>تقرير تنفيذي PDF/Excel موحّد (إنتاج + مخزون + تكلفة)</td></tr>
  <tr><td>3</td><td>مركز عمليات / inbox للتنبيهات</td></tr>
  <tr><td>4</td><td>SLA لتحويلات معلقة</td></tr>
  <tr><td>5</td><td>ربط تقرير → تحويل في شاشة واحدة</td></tr>
  <tr><td>6</td><td>OEE/كفاءة خط موحّدة (routing analytics جزئي فقط)</td></tr>
  <tr><td>7</td><td>تذكيرات push/email للخطط والتحويلات</td></tr>
</table>
<h3>تطوير مقترح لاحقاً</h3>
<ul>
  <li>Tenant readiness dashboard (% إعداد).</li>
  <li>Ops inbox (تحويلات + خطط + cost health).</li>
  <li>تحليلات مخزون متقدمة.</li>
</ul>

<footer class="doc-footer">Hakimo ERP v${PKG.version} — مستند تسليم داخلي — ${today}</footer>
</body>
</html>`;
}

async function exportPdf() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${HTML_PATH}`, { waitUntil: 'load' });
  await page.pdf({
    path: PDF_PATH,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
  });
  await browser.close();
}

async function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(SCREEN_DIR, { recursive: true });

  const contentOnly = process.env.HANDOVER_CONTENT_ONLY === '1';
  const creds = loadHandoverCredentials();
  let slug = creds.tenant || TENANT;

  if (!contentOnly) {
    console.log('Capturing screenshots...');
    const cap = await captureScreenshots();
    slug = cap.slug;
  } else {
    console.log('Skipping screenshots (HANDOVER_CONTENT_ONLY=1)...');
  }

  console.log('Building HTML...');
  const html = buildHtml(slug);
  fs.writeFileSync(HTML_PATH, html, 'utf8');

  console.log('Exporting PDF...');
  await exportPdf();

  const stat = fs.statSync(PDF_PATH);
  console.log(`Done: ${PDF_PATH} (${(stat.size / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
