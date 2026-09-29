/**
 * Proves destination acknowledgement paints before heavy content is released.
 * requestAnimationFrame is held across the navigation click, so the shell
 * must be visible while the reveal callback is still queued. Ordering is the
 * contract; timings are logged only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5199;
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

async function holdAnimationFrames(page) {
  await page.evaluate(() => {
    const real = window.requestAnimationFrame.bind(window);
    const queue = [];
    window.__releaseHeldFrames = () => {
      window.requestAnimationFrame = real;
      const pending = queue.splice(0);
      for (const callback of pending) real(callback);
    };
    window.requestAnimationFrame = (callback) => {
      queue.push(callback);
      return queue.length;
    };
  });
}

async function releaseAnimationFrames(page) {
  await page.evaluate(() => {
    if (typeof window.__releaseHeldFrames === 'function') {
      window.__releaseHeldFrames();
    }
  });
}

const child = startV2DevServer();

test.before(async () => {
  await waitForServer(child);
});

test.after(async () => {
  await stopProcess(child);
});

test(
  'warm Explore to Home paints the Home shell before heavy content',
  { timeout: 90_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('.v2-feature:not(.v2-feature-skeleton)').waitFor({
        timeout: 45_000,
      });
      await page.getByRole('button', { name: 'Explore', exact: true }).click();
      await page.locator('#v2-explore-title').waitFor();

      await holdAnimationFrames(page);
      const inputAt = Date.now();
      await page.getByRole('button', { name: 'Home', exact: true }).click();

      const shell = page.locator('.v2-home[data-destination-phase="shell"]');
      await shell.waitFor({ timeout: 8_000 });
      const shellAt = Date.now();
      assert.equal(await shell.getAttribute('data-home-content'), 'preparing');
      assert.equal(await page.locator('#v2-explore-title').count(), 0);
      assert.equal(
        await page.getByRole('button', { name: 'Home', exact: true }).getAttribute('aria-current'),
        'page',
      );
      assert.equal(
        await page.locator('.v2-feature:not(.v2-feature-skeleton)').count(),
        0,
      );
      assert.equal(
        await page.locator('.v2-shelf-card:not(.v2-shelf-card-skeleton)').count(),
        0,
      );
      assert.equal(
        await page.getByText('Loading current opportunities…').count(),
        0,
      );
      assert.equal(
        await page.getByRole('heading', { name: 'Top Opportunity' }).isVisible(),
        true,
      );

      await releaseAnimationFrames(page);
      await page.locator('.v2-home[data-destination-phase="content"]').waitFor({
        timeout: 20_000,
      });
      await page.locator('.v2-feature:not(.v2-feature-skeleton)').waitFor({
        timeout: 20_000,
      });
      const contentAt = Date.now();
      assert.ok(
        (await page.locator('.v2-shelf-card:not(.v2-shelf-card-skeleton)').count()) > 0,
      );
      console.log(
        JSON.stringify({
          scenario: 'explore-home',
          inputToShellMs: shellAt - inputAt,
          inputToContentMs: contentAt - inputAt,
        }),
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  'Explore to Movies paints the Movies shell before movie rows',
  { timeout: 90_000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.locator('.v2-feature:not(.v2-feature-skeleton)').waitFor({
        timeout: 45_000,
      });
      await page.getByRole('button', { name: 'Explore', exact: true }).click();
      await page.locator('#v2-explore-title').waitFor();

      await holdAnimationFrames(page);
      const inputAt = Date.now();
      await page.locator('.v2-browse-label', { hasText: /^Movies$/ }).click();

      const title = page.locator('#v2-am-page-title');
      await title.waitFor({ timeout: 8_000 });
      const shellAt = Date.now();
      assert.equal((await title.textContent())?.trim(), 'All Movies');
      assert.equal(
        await page
          .locator('.v2-am-page[data-destination-phase="shell"]')
          .getAttribute('data-all-movies-content'),
        'preparing',
      );
      assert.equal(await page.locator('#v2-explore-title').count(), 0);
      assert.equal(await page.locator('.v2-am-row').count(), 0);

      await releaseAnimationFrames(page);
      await page.locator('.v2-am-page[data-destination-phase="content"]').waitFor({
        timeout: 20_000,
      });
      await page.locator('.v2-am-row').first().waitFor({ timeout: 20_000 });
      const contentAt = Date.now();
      const rows = await page.locator('.v2-am-row').count();
      assert.ok(rows > 0);
      console.log(
        JSON.stringify({
          scenario: 'explore-movies',
          inputToShellMs: shellAt - inputAt,
          inputToContentMs: contentAt - inputAt,
          initialRows: rows,
        }),
      );
    } finally {
      await browser.close();
    }
  },
);
