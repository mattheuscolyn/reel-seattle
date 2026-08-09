/**
 * Production automatic-sync assist (signed-out check + headed wait).
 *   node scripts/verify_auto_sync_prod.mjs
 *   node scripts/verify_auto_sync_prod.mjs --headed
 *
 * Human still drives Google sign-in and two-browser checks.
 * Do not press Sync now during primary automatic-sync verification.
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
  slowMo: headed ? 40 : 0,
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
  const filmSync = await account.getAttribute('data-film-sync');
  const scheduleSync = await account.getAttribute('data-schedule-sync');
  const body = (await account.innerText()).replace(/\s+/g, ' ');

  notes.push(`auth-status=${authStatus}`);
  notes.push(`film-sync=${filmSync}`);
  notes.push(`schedule-sync=${scheduleSync}`);
  notes.push(`claims-favorites-synced=${/favorite theaters are synced/i.test(body)}`);
  notes.push(`has-sync-now-fallback=${/Sync now/i.test(body)}`);
  notes.push(
    `has-signing-in-alone=${/Signing in alone does not move your data|Signing in and enabling/i.test(body)}`,
  );

  await page.screenshot({
    path: join(OUT, 'auto-sync-prod-01-signed-out-account.png'),
    fullPage: false,
  });
  notes.push('shot=auto-sync-prod-01-signed-out-account.png');

  if (headed) {
    console.log('\n=== HEADED AUTOMATIC SYNC VERIFICATION ===');
    console.log('Both browsers: same account; film + schedule already attached.');
    console.log('Do NOT press Sync now for primary checks.');
    console.log('');
    console.log('Browser A:');
    console.log('1. Save / Seen / NI / remove preference → wait Synced');
    console.log('2. Accept / remove plan → wait schedule Synced');
    console.log('Browser B (background then focus after >20s):');
    console.log('3. Confirm A changes appear without Sync now');
    console.log('4. Reverse-direction film + plan change → A receives on focus');
    console.log('Offline (optional):');
    console.log('5. Offline mutate → status pending → reload → reconnect → auto flush');
    console.log('Tombstone:');
    console.log('6. A removes synced item → B focus → gone; B unrelated change → no resurrection');
    console.log('');
    console.log('Waiting up to 15 minutes for data-auth-status=signed_in...');
    try {
      await page.waitForSelector('[data-auth-status="signed_in"]', {
        timeout: 15 * 60 * 1000,
      });
      notes.push('headed-signed-in=true');
      await page.screenshot({
        path: join(OUT, 'auto-sync-prod-02-signed-in-account.png'),
        fullPage: false,
      });
      console.log('Signed in detected. Continue checklist in this window + Browser B.');
      // Keep browser open for human work; wait for closing signal via film synced attr.
      await page.waitForTimeout(14 * 60 * 1000);
    } catch {
      notes.push('headed-signed-in=false');
    }
  }

  writeFileSync(join(OUT, 'auto-sync-prod-notes.txt'), notes.join('\n') + '\n');
  for (const line of notes) console.log(line);
} finally {
  await browser.close();
}
