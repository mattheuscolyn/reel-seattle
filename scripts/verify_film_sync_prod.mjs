/**
 * Production film-sync release checks (signed-out automated + headed assist).
 * Usage:
 *   node scripts/verify_film_sync_prod.mjs
 *   node scripts/verify_film_sync_prod.mjs --headed
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
  const bodyText = (await account.innerText()).replace(/\s+/g, ' ');

  notes.push(`auth-status=${authStatus}`);
  notes.push(
    `has-signing-in-alone=${/Signing in alone does not move your film activity/i.test(bodyText)}`,
  );
  notes.push(
    `claims-synced-already=${/are synced/i.test(bodyText) && !/not synced/i.test(bodyText)}`,
  );
  notes.push(`mentions-schedule-synced=${/My Schedule.*synced(?! yet)/i.test(bodyText)}`);
  notes.push(`has-continue-google=${/Continue with Google/i.test(bodyText)}`);

  await page.screenshot({
    path: join(OUT, 'film-sync-prod-01-signed-out-account.png'),
    fullPage: false,
  });
  notes.push('shot=film-sync-prod-01-signed-out-account.png');

  // Home still loads after Profile navigation back
  await page.locator('.v2-nav-button', { hasText: 'Home' }).click();
  await page.waitForTimeout(500);
  const homeOk = !(await page.locator('text=empty-data').count());
  notes.push(`home-ok=${homeOk}`);
  await page.screenshot({
    path: join(OUT, 'film-sync-prod-02-home.png'),
    fullPage: false,
  });

  if (headed) {
    console.log('\n=== HEADED TWO-BROWSER ASSIST ===');
    console.log('Browser A (this window):');
    console.log('1. Sign in with Google if needed');
    console.log('2. Confirm local Saved/Seen/NI still present BEFORE Enable sync');
    console.log('3. Profile → Enable sync → Merge and enable sync');
    console.log('4. Confirm UI: Saved, Seen, and Not Interested are synced');
    console.log('5. Add/remove preferences; Sync now');
    console.log('Browser B: Incognito → same Google account → attach → confirm propagation');
    console.log('Waiting up to 12 minutes for you to reach synced state...');
    await page.locator('.v2-nav-button', { hasText: 'Profile' }).click();
    try {
      await page.waitForSelector(
        '[data-film-sync="synced"], [data-cloud-sync="synced"]',
        { timeout: 12 * 60 * 1000 },
      );
      notes.push('headed-reached-synced=true');
      await page.screenshot({
        path: join(OUT, 'film-sync-prod-03-synced-account.png'),
        fullPage: false,
      });
    } catch {
      notes.push('headed-reached-synced=false');
      await page.screenshot({
        path: join(OUT, 'film-sync-prod-03-headed-timeout.png'),
        fullPage: false,
      });
    }
  }

  writeFileSync(join(OUT, 'film-sync-prod-notes.txt'), notes.join('\n') + '\n');
  for (const line of notes) console.log(line);
} finally {
  await browser.close();
}
