'use strict';
/**
 * DawaDiary — Playwright smoke test (loads index.html from disk).
 * Checks: page loads with no console errors / page errors, a medicine can
 * be added through the real UI, a dose can be marked taken, a symptom can
 * be logged, the trend text appears, and the summary shows the medicine.
 * Screenshot goes to /tmp (never into the repo — the repo is text-only).
 *
 * Run: node tests/smoke.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/pwtest/node_modules/playwright-core');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = 'file://' + path.join(__dirname, '..', 'index.html');
const shotPath = '/tmp/dawadiary-smoke.png';

const failures = [];
function check(name, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures.push(name);
}

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  check('page title', (await page.title()).includes('DawaDiary'), await page.title());
  check('disclaimer visible', (await page.locator('.disclaimer').first().textContent()).includes('Not medical advice'));
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

  // --- add a medicine through the UI ---
  await page.click('[data-tab="medicines"]');
  await page.fill('#med-name', 'Paracetamol');
  await page.fill('#med-dose', '500 mg');
  await page.click('.time-pick[data-time="08:00"]');
  await page.click('.time-pick[data-time="20:00"]');
  await page.click('#med-submit');
  await page.waitForTimeout(300);
  const medListText = await page.locator('#medicine-list').textContent();
  check('medicine appears in list', medListText.includes('Paracetamol') && medListText.includes('08:00, 20:00'), medListText.trim());

  // --- today's schedule shows it; mark the 08:00 dose taken ---
  await page.click('[data-tab="today"]');
  await page.waitForTimeout(300);
  const schedText = await page.locator('#schedule-list').textContent();
  check('schedule lists the medicine', schedText.includes('Paracetamol'), schedText.trim().slice(0, 120));
  const takenBtn = page.locator('[data-mark="taken"]').first();
  if (await takenBtn.count()) {
    await takenBtn.click();
    await page.waitForTimeout(300);
    const stats = await page.locator('#today-stats').textContent();
    check('taken count becomes 1 after marking', stats.includes('1'), stats.trim());
  } else {
    check('a Taken button exists', false, 'no pending dose button found (dose may already be logged from a previous run)');
  }

  // --- log a symptom ---
  await page.click('[data-tab="symptoms"]');
  await page.fill('#sym-name', 'Headache');
  await page.fill('#sym-date', new Date().toISOString().slice(0, 10));
  await page.click('#symptom-form button[type="submit"]');
  await page.waitForTimeout(300);
  const symListText = await page.locator('#symptom-list').textContent();
  check('symptom appears in list', symListText.includes('Headache'), symListText.trim());
  const trendText = await page.locator('#trend-text').textContent();
  check('trend text renders', trendText.length > 10, trendText.trim());

  // --- summary shows the medicine and the disclaimer ---
  await page.click('[data-tab="summary"]');
  await page.waitForTimeout(300);
  const summaryText = await page.locator('#summary-text').textContent();
  check('summary mentions medicine', summaryText.includes('Paracetamol'), summaryText.slice(0, 120));
  check('summary carries disclaimer', summaryText.includes('not medical advice'));

  // --- localStorage persisted ---
  const stored = await page.evaluate(() => localStorage.getItem('dawa-diary-v1'));
  check('data persisted to localStorage', !!stored && stored.includes('Paracetamol'));

  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`Screenshot saved to ${shotPath}`);
} finally {
  await browser.close();
}

console.log(failures.length === 0 ? '\nSMOKE: ALL CHECKS PASSED' : `\nSMOKE: ${failures.length} CHECK(S) FAILED: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
