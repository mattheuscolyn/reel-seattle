import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  notificationBellAriaLabel,
  parseQcHeaderNotificationsMode,
  resolveNotificationBellPresentation,
} from '../../v2/notifications/notificationBellPresentation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HEADER = readFileSync(join(ROOT, 'v2/home/AppHeader.jsx'), 'utf8');
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

test('logged out → notification bell not visible', () => {
  assert.deepEqual(
    resolveNotificationBellPresentation({ signedIn: false }),
    { visible: false, hasUnread: false },
  );
  assert.deepEqual(
    resolveNotificationBellPresentation({
      signedIn: false,
      hasUnreadNotifications: true,
    }),
    { visible: false, hasUnread: false },
  );
});

test('logged in + no unread → bell visible without indicator', () => {
  assert.deepEqual(
    resolveNotificationBellPresentation({
      signedIn: true,
      hasUnreadNotifications: false,
    }),
    { visible: true, hasUnread: false },
  );
});

test('logged in + unread → bell visible with indicator', () => {
  assert.deepEqual(
    resolveNotificationBellPresentation({
      signedIn: true,
      hasUnreadNotifications: true,
    }),
    { visible: true, hasUnread: true },
  );
});

test('production default has no unread without inventing backend state', () => {
  assert.deepEqual(resolveNotificationBellPresentation({ signedIn: true }), {
    visible: true,
    hasUnread: false,
  });
});

test('QC modes force visibility; unread follows live hasUnreadNotifications', () => {
  assert.equal(parseQcHeaderNotificationsMode('logged-out'), 'logged-out');
  assert.equal(parseQcHeaderNotificationsMode('read'), 'read');
  assert.equal(parseQcHeaderNotificationsMode('unread'), 'unread');
  assert.equal(parseQcHeaderNotificationsMode('nope'), null);
  assert.deepEqual(
    resolveNotificationBellPresentation({
      signedIn: false,
      hasUnreadNotifications: true,
      qcMode: 'unread',
    }),
    { visible: true, hasUnread: true },
  );
  assert.deepEqual(
    resolveNotificationBellPresentation({
      signedIn: false,
      hasUnreadNotifications: false,
      qcMode: 'unread',
    }),
    { visible: true, hasUnread: false },
  );
  assert.deepEqual(
    resolveNotificationBellPresentation({
      signedIn: true,
      hasUnreadNotifications: true,
      qcMode: 'logged-out',
    }),
    { visible: false, hasUnread: false },
  );
  assert.deepEqual(
    resolveNotificationBellPresentation({
      signedIn: true,
      hasUnreadNotifications: true,
      qcMode: 'read',
    }),
    { visible: true, hasUnread: true },
  );
});

test('accessible labels distinguish unread', () => {
  assert.equal(notificationBellAriaLabel(), 'Notifications');
  assert.equal(notificationBellAriaLabel({ hasUnread: false }), 'Notifications');
  assert.equal(
    notificationBellAriaLabel({ hasUnread: true }),
    'Notifications, unread',
  );
});

test('AppHeader shows bell only when not showing Back', () => {
  assert.match(HEADER, /showNotificationsBell/);
  assert.match(HEADER, /showBell = Boolean\(showNotificationsBell\) && !showBack/);
  assert.match(HEADER, /v2-header-notifications/);
  assert.match(HEADER, /v2-header-notifications-dot/);
  assert.match(HEADER, /IconBell/);
  assert.match(HEADER, /notificationBellAriaLabel/);
  // Back still wins over notifications
  assert.match(HEADER, /showBack \? \(/);
});

test('V2App wires auth + live unread + notifications open seam', () => {
  assert.match(APP, /useAuth/);
  assert.match(APP, /resolveNotificationBellPresentation/);
  assert.match(APP, /readQcHeaderNotificationsModeFromLocation/);
  assert.match(APP, /NotificationsSheet/);
  assert.match(APP, /handleOpenNotifications/);
  assert.match(APP, /onNotificationsOpen=\{handleOpenNotifications\}/);
  assert.match(APP, /hasUnreadNotifications,/);
});

test('header CSS keeps bell geometry balanced with Profile slot', () => {
  assert.match(CSS, /\.v2-header-notifications\s*\{/);
  assert.match(CSS, /\.v2-header-notifications-dot\s*\{/);
  assert.match(CSS, /justify-self:\s*start/);
  assert.match(CSS, /width:\s*2\.5rem/);
  assert.match(CSS, /background:\s*var\(--v2-accent\)/);
});
