/**
 * Production schedule-sync assist (signed-out check + headed attach wait).
 *   node scripts/verify_schedule_sync_prod.mjs
 *   node scripts/verify_schedule_sync_prod.mjs --headed
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
  await page.waitForSelector('[data-profile-section="account"]', {
    timeout: 20_000,
  });
  await page.waitForTimeout(800);
  const account = page.locator('[data-profile-section="account"]');
  const authStatus = await account.getAttribute('data-auth-status');
  const scheduleSync = await account.getAttribute('data-schedule-sync');
  const filmSync = await account.getAttribute('data-film-sync');
  const bodyText = (await account.innerText()).replace(/\s+/g, ' ');
  notes.push(`auth-status=${authStatus}`);
  notes.push(`schedule-sync=${scheduleSync}`);
  notes.push(`film-sync=${filmSync}`);
  notes.push(
    `has-enable-schedule=${/Enable schedule sync/i.test(bodyText)}`,
  );
  notes.push(
    `claims-schedule-synced=${/My Schedule is synced/i.test(bodyText)}`,
  );
  notes.push(
    `claims-drafts-synced=${/drafts are synced|calendar are synced/i.test(bodyText)}`,
  );
  notes.push(
    `has-signing-in-alone=${/Signing in alone does not move your data/i.test(bodyText)}`,
  );
  await page.screenshot({
    path: join(OUT, 'schedule-sync-prod-01-signed-out-account.png'),
    fullPage: false,
  });
  notes.push('shot=schedule-sync-prod-01-signed-out-account.png');

  if (headed) {
    console.log('\n=== HEADED SCHEDULE SYNC ASSIST ===');
    console.log('Browser A:');
    console.log('1. Sign in if needed');
    console.log('2. Confirm local accepted plan(s) before Enable schedule sync');
    console.log('3. Profile → Enable schedule sync → Merge and enable schedule sync');
    console.log('4. Confirm My Schedule is synced (not drafts/calendar)');
    console.log('5. Accept a new plan; Sync now');
    console.log('Browser B: incognito → login alone empty → attach → confirm A plans');
    console.log('Waiting up to 12 minutes for data-schedule-sync=synced...');
    try {
      await page.waitForSelector('[data-schedule-sync="synced"]', {
        timeout: 12 * 60 * 1000,
      });
      notes.push('headed-reached-schedule-synced=true');
      await page.screenshot({
        path: join(OUT, 'schedule-sync-prod-02-synced-account.png'),
        fullPage: false,
      });
    } catch {
      notes.push('headed-reached-schedule-synced=false');
      await page.screenshot({
        path: join(OUT, 'schedule-sync-prod-02-headed-timeout.png'),
        fullPage: false,
      });
    }
  }

  writeFileSync(
    join(OUT, 'schedule-sync-prod-notes.txt'),
    notes.join('\n') + '\n',
  );
  for (const line of notes) console.log(line);
} finally {
  await browser.close();
}
