#!/usr/bin/env node
/**
 * Quick viewport/route audit for Phase E browser verification.
 * Usage: node scripts/qa_viewport_audit.mjs http://localhost:5173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';

const VIEWPORTS = [
  { name: '375px', width: 375, height: 812 },
  { name: '768px', width: 768, height: 1024 },
  { name: '1200px', width: 1200, height: 900 },
];

const ROUTES = [
  { path: '/', label: 'Showtimes' },
  { path: '/recently-added', label: 'Recently added' },
  { path: '/planner', label: 'Planner' },
  { path: '/planner?preferred=Disclosure+Day&advanced=1', label: 'Planner preferred' },
  { path: '/double-feature', label: 'DF redirect', expectUrl: '/planner' },
  { path: '/marathon', label: 'Marathon', expectUrl: '/planner' },
];

const issues = [];

function note(viewport, route, message) {
  issues.push({ viewport, route, message });
}

async function auditRoute(page, viewport, route) {
  const url = `${BASE}${route.path}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);

  if (route.expectUrl && !page.url().includes(route.expectUrl)) {
    note(viewport.name, route.label, `Expected URL containing ${route.expectUrl}, got ${page.url()}`);
  }

  const shell = page.locator('.app-shell-header');
  if ((await shell.count()) === 0) {
    note(viewport.name, route.label, 'Missing .app-shell-header');
  } else {
    const box = await shell.boundingBox();
    if (box && box.width > viewport.width + 2) {
      note(viewport.name, route.label, `Shell header overflows viewport (${box.width}px)`);
    }
  }

  const navButtons = page.locator('.nav-button');
  const navCount = await navButtons.count();
  if (navCount !== 2) {
    note(viewport.name, route.label, `Expected 2 nav buttons, found ${navCount}`);
  }

  for (let i = 0; i < navCount; i += 1) {
    const btn = navButtons.nth(i);
    const btnBox = await btn.boundingBox();
    if (btnBox && btnBox.height < 40) {
      note(viewport.name, route.label, `Nav button ${i} tap target may be small (${btnBox.height}px)`);
    }
  }

  if (route.path === '/' || route.path.startsWith('/planner')) {
    const dropdown = page.locator('.dropdown-btn').first();
    if ((await dropdown.count()) > 0) {
      const dbox = await dropdown.boundingBox();
      if (dbox && dbox.width > viewport.width - 32) {
        note(viewport.name, route.label, 'Dropdown button may be too wide on narrow viewport');
      }
    }
  }

  if (route.path.startsWith('/planner')) {
    const advanced = page.locator('#planner-preferred');
    if (route.path.includes('preferred') && (await advanced.count()) === 0) {
      note(viewport.name, route.label, 'Preferred films input not found');
    }
    const timeline = page.locator('.planner-timeline-track').first();
    if ((await timeline.count()) > 0) {
      const tbox = await timeline.boundingBox();
      if (tbox && tbox.width > viewport.width) {
        note(viewport.name, route.label, 'Timeline track wider than viewport');
      }
    }
  }

  if (route.path === '/marathon') {
    if (!page.url().includes('/planner') || !page.url().includes('count=max')) {
      note(viewport.name, route.label, `Expected Planner max redirect, got ${page.url()}`);
    }
    const notice = page.locator('.planner-arrival-notice, .planner-controls');
    if ((await notice.count()) === 0) {
      note(viewport.name, route.label, 'Planner UI missing after Marathon redirect');
    }
  }

  const horizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });
  if (horizontalOverflow) {
    note(viewport.name, route.label, 'Horizontal page overflow detected');
  }
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    console.error('Playwright chromium not available. Run: npx playwright install chromium');
    process.exit(2);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of ROUTES) {
      if (viewport.width === 375 && route.path === '/marathon') {
        // still test marathon on mobile
      }
      if (viewport.width === 1200 && route.path === '/double-feature') {
        // test redirect once
      }
      try {
        await auditRoute(page, viewport, route);
        console.log(`OK  ${viewport.name} ${route.label}`);
      } catch (error) {
        note(viewport.name, route.label, `Error: ${error.message}`);
        console.log(`FAIL ${viewport.name} ${route.label}: ${error.message}`);
      }
    }
  }

  await browser.close();

  console.log('\n--- Issues ---');
  if (issues.length === 0) {
    console.log('No automated layout issues detected.');
  } else {
    for (const item of issues) {
      console.log(`[${item.viewport}] ${item.route}: ${item.message}`);
    }
  }

  process.exit(issues.length > 0 ? 1 : 0);
}

main();
