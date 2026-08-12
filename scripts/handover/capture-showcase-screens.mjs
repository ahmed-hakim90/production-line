#!/usr/bin/env node
/**
 * Capture live module screenshots for docs/company-showcase.
 * Reuses handover credentials — never prints secrets.
 *
 * Usage:
 *   HANDOVER_BASE_URL=http://localhost:3000 node scripts/handover/capture-showcase-screens.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'docs/handover');
const SCREEN_DIR = path.join(OUT_DIR, '_screenshots', 'modules');
const BASE_URL = process.env.HANDOVER_BASE_URL || 'http://localhost:3000';
const TENANT = process.env.HANDOVER_TENANT_SLUG || 'sokany-eg';

const SHOTS = [
  { file: '60-repair-dashboard.png', path: '/repair', waitText: 'صيانة' },
  { file: '61-repair-jobs.png', path: '/repair/jobs', waitText: 'طلب' },
  { file: '62-repair-payments.png', path: '/repair/payments', waitText: 'تحصيل' },
  { file: '63-repair-parts.png', path: '/repair/parts', waitText: 'قطع' },
  { file: '64-repair-treasury.png', path: '/repair/treasury', waitText: 'خزينة' },
  { file: '65-customers.png', path: '/customers', waitText: 'عميل' },
  { file: '70-hr-dashboard.png', path: '/hr/dashboard', waitText: 'HR' },
  { file: '71-hr-employees.png', path: '/hr/employees', waitText: 'موظف' },
  { file: '72-hr-payroll.png', path: '/hr/payroll', waitText: 'راتب' },
  { file: '80-accounting.png', path: '/accounting', waitText: 'حساب' },
  { file: '81-monthly-costs.png', path: '/accounting/monthly-costs', waitText: 'تكلفة' },
  { file: '90-quality-reports.png', path: '/quality/reports', waitText: 'جودة' },
  { file: '91-quality-final.png', path: '/quality/final-inspection', waitText: 'فحص' },
  { file: '50-roles.png', path: '/roles', waitText: 'دور', destRoot: true },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function loadCreds() {
  const parsed = loadEnvFile(path.join(OUT_DIR, '.credentials'));
  return {
    email: process.env.HANDOVER_EMAIL || parsed.HANDOVER_EMAIL,
    password: process.env.HANDOVER_PASSWORD || parsed.HANDOVER_PASSWORD,
    tenant: process.env.HANDOVER_TENANT_SLUG || parsed.HANDOVER_TENANT_SLUG || TENANT,
  };
}

async function signIn(page, slug) {
  const env = loadEnvFile(path.join(ROOT, '.env.local'));
  const { email, password } = loadCreds();
  if (!email || !password || !env.VITE_FIREBASE_API_KEY) {
    console.warn('Missing credentials or Firebase config — aborting capture.');
    return false;
  }

  await page.goto(`${BASE_URL}/t/${slug}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  if (!page.url().includes('/login')) return true;

  const visible = await page.locator('#login-email').isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) return !page.url().includes('/login');

  await page.locator('#login-email').fill(email);
  await page.locator('#login-pwd').fill(password);
  await page.locator('button[type="submit"]:not([disabled])').click({ timeout: 20000 });
  try {
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 });
  } catch {
    console.warn('Login wait timed out');
    return false;
  }
  await page.waitForTimeout(2500);
  console.log('Signed in successfully');
  return !page.url().includes('/login');
}

async function main() {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  const creds = loadCreds();
  const slug = creds.tenant || TENANT;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ar-EG',
  });
  const page = await context.newPage();

  const ok = await signIn(page, slug);
  if (!ok) {
    await browser.close();
    process.exit(1);
  }

  async function dismissWelcomeModal() {
    const btn = page.getByRole('button', { name: /متابعة|حسناً|موافق|إغلاق/ });
    if (await btn.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  async function waitForContent(waitText) {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await dismissWelcomeModal();
    if (waitText) {
      await page.getByText(waitText, { exact: false }).first().waitFor({ timeout: 12000 }).catch(() => {});
    }
    // Prefer real rows/KPIs over skeleton placeholders when possible.
    await page
      .locator('table tbody tr, [data-loaded="true"], .recharts-wrapper, canvas')
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
  }

  for (const shot of SHOTS) {
    const url = `${BASE_URL}/t/${slug}${shot.path}`;
    process.stdout.write(`Capturing ${shot.file} ... `);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitForContent(shot.waitText);
      if (page.url().includes('/login')) {
        console.log('skipped (login wall)');
        continue;
      }
      const dest = shot.destRoot
        ? path.join(OUT_DIR, '_screenshots', shot.file)
        : path.join(SCREEN_DIR, shot.file);
      await page.screenshot({ path: dest, fullPage: false });
      console.log('ok');
    } catch (err) {
      console.log(`fail: ${err.message}`);
    }
  }

  await browser.close();
  console.log('Done. Screenshots in docs/handover/_screenshots/modules/');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
