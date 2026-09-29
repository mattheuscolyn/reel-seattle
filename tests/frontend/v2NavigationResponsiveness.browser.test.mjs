/**
 * Proves an unresolved Home payload does not block primary navigation.
 * The showtimes response is held until after Explore is visible — the
 * assertion is that Explore appears while that request is still pending,
 * not that it appears within a fixed millisecond budget.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5198;
const BASE = `http://127.0.0.1:${PORT}/`;

function startV2DevServer() {
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [
      viteBin,
      '--config',
      'vite.v2.config.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(PORT),
      '--strictPort',
    ],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return child;
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode != null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
      }).once('exit', () => resolve());
      setTimeout(() => resolve(), 5_000).unref();
      return;
    }
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode == null) child.kill('SIGKILL');
    }, 3_000).unref();
  });
}

async function waitForServer(child) {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    if (child.exitCode != null) {
      throw new Error(`v2 dev server exited early (${child.exitCode})`);
    }
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // not ready
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for ${BASE}`);
}

test(
  'Explore becomes visible while Home showtimes are still loading',
  { timeout: 90_000 },
  async () => {
    const child = startV2DevServer();
    let browser;
    let releaseShowtimes = () => {};
    let showtimesSettled = false;
    try {
      await waitForServer(child);
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const showtimesHeld = new Promise((resolve) => {
        releaseShowtimes = () => {
          showtimesSettled = true;
          resolve();
        };
      });
      await page.route('**/showtimes_current.json', async (route) => {
        await showtimesHeld;
        await route.continue();
      });

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Top Opportunity' }).waitFor({
        timeout: 45_000,
      });
      assert.equal(showtimesSettled, false);

      const exploreButton = page.getByRole('button', { name: 'Explore', exact: true });
      await exploreButton.click();
      await page.locator('#v2-explore-title').waitFor({ timeout: 8_000 });

      assert.equal(showtimesSettled, false);
      assert.equal(await exploreButton.getAttribute('aria-current'), 'page');
      assert.equal(
        await page.getByRole('heading', { name: 'Top Opportunity' }).isVisible(),
        false,
      );
      assert.equal(
        await page.locator('[data-home-loading="true"]').count(),
        0,
      );

      const profileButton = page.getByRole('button', { name: 'Profile', exact: true });
      await profileButton.click();
      await page.locator('.v2-profile').waitFor({ timeout: 8_000 });
      assert.equal(showtimesSettled, false);
      assert.equal(await profileButton.getAttribute('aria-current'), 'page');
    } finally {
      releaseShowtimes();
      if (browser) await browser.close();
      await stopProcess(child);
    }
  },
);
