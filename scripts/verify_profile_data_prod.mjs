/**
 * Production Profile live-data checks (signed-out + optional headed).
 *   node scripts/verify_profile_data_prod.mjs
 *   node scripts/verify_profile_data_prod.mjs --headed
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
mkdirSync(OUT, { recursive: true });
const headed = process.argv.includes('--headed');
const BASE = 'https://www.reelseattle.com';

const browser = await chromium.launch({
  headless: !headed,
  slowMo: headed ? 50 : 0,
});
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
});
/** @type {string[]} */
const notes = [];

try {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.locator('.v2-nav-button', { hasText: 'Profile' }).click();
  await page.waitForSelector('[data-profile-source="live"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(800);

  const root = page.locator('.v2-profile');
  const identityMode = await root.getAttribute('data-profile-identity');
  const source = await root.getAttribute('data-profile-source');
  const identityText = (
    await page.locator('[data-profile-section="identity"]').innerText()
  ).replace(/\s+/g, ' ');
  const account = page.locator('[data-profile-section="account"]');
  const authStatus = await account.getAttribute('data-auth-status');
  const values = await page
    .locator('.v2-profile-activity-value')
    .allTextContents();

  notes.push(`source=${source}`);
  notes.push(`identity-mode=${identityMode}`);
  notes.push(`auth-status=${authStatus}`);
  notes.push(`has-mattheus=${/Mattheus/i.test(identityText)}`);
  notes.push(`has-seattle-wa=${/Seattle,\s*WA/i.test(identityText)}`);
  notes.push(
    `has-sign-in-cta=${/Sign in to sync your Reel Seattle activity/i.test(identityText)}`,
  );
  notes.push(
    `has-membership=${(await page.locator('[data-profile-section="membership"]').count()) > 0}`,
  );
  notes.push(`activity-values=${JSON.stringify(values)}`);
  notes.push(
    `is-fixture-counts=${JSON.stringify(values) === JSON.stringify(['83', '27', '46', '3'])}`,
  );

  await page.screenshot({
    path: join(OUT, 'profile-data-prod-01-signed-out.png'),
    fullPage: true,
  });
  notes.push('shot=profile-data-prod-01-signed-out.png');

  if (headed) {
    console.log('\n=== HEADED PROFILE VERIFY ===');
    console.log('1. Sign in with Google');
    console.log('2. Confirm real name/email (not Mattheus)');
    console.log('3. Edit display name → save → visible update');
    console.log('4. Clear display name → Google fallback');
    console.log('5. Confirm activity counts match your local stores');
    console.log('Waiting up to 12 minutes for data-auth-status=signed_in...');
    try {
      await page.waitForSelector('[data-auth-status="signed_in"]', {
        timeout: 12 * 60 * 1000,
      });
      notes.push('headed-signed-in=true');
      const signedIdentity = (
        await page.locator('[data-profile-section="identity"]').innerText()
      ).replace(/\s+/g, ' ');
      notes.push(`signed-has-mattheus=${/Mattheus/i.test(signedIdentity)}`);
      await page.screenshot({
        path: join(OUT, 'profile-data-prod-02-signed-in.png'),
        fullPage: true,
      });
    } catch {
      notes.push('headed-signed-in=false');
    }
  }

  writeFileSync(
    join(OUT, 'profile-data-prod-notes.txt'),
    notes.join('\n') + '\n',
  );
  for (const line of notes) console.log(line);
} finally {
  await browser.close();
}
