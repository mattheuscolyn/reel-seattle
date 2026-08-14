import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyNotificationReadOverrides,
  countUnreadNotifications,
  groupNotificationsForSheet,
  isNotificationUnread,
  markAllNotificationsReadInOverrides,
  markNotificationReadInOverrides,
  notificationNavigationTarget,
} from '../../v2/notifications/notificationModel.js';
import {
  getNotificationsFixtureItems,
  parseQcNotificationsMode,
  resolveNotificationsDataSource,
} from '../../v2/fixtures/notificationsMockupFixture.js';
import { resolveNotificationBellPresentation } from '../../v2/notifications/notificationBellPresentation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const SHEET = readFileSync(
  join(ROOT, 'v2/notifications/NotificationsSheet.jsx'),
  'utf8',
);
const HEADER = readFileSync(join(ROOT, 'v2/home/AppHeader.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

test('production notification source is empty (fixture cannot leak)', () => {
  const prod = resolveNotificationsDataSource({});
  assert.equal(prod.source, 'production');
  assert.deepEqual(prod.items, []);
  assert.equal(countUnreadNotifications(prod.items), 0);
});

test('QC unread fixture groups under NEW and EARLIER', () => {
  const items = getNotificationsFixtureItems('unread');
  const grouped = groupNotificationsForSheet(items);
  assert.equal(grouped.hasUnread, true);
  assert.equal(grouped.unread.length, 1);
  assert.equal(grouped.read.length, 2);
  assert.match(grouped.unread[0].headline, /Dune/);
  assert.ok(grouped.unread.every(isNotificationUnread));
  assert.ok(grouped.read.every((item) => !isNotificationUnread(item)));
});

test('opening sheet does not mark notifications read', () => {
  // Sheet open is UI state only — read overrides stay empty until actions.
  const items = getNotificationsFixtureItems('unread');
  const afterOpen = applyNotificationReadOverrides(items, {});
  assert.equal(countUnreadNotifications(afterOpen), 1);
});

test('Mark all as read clears unread and preserves history', () => {
  const items = getNotificationsFixtureItems('unread');
  const overrides = markAllNotificationsReadInOverrides(items, {}, '2026-08-13T00:00:00.000Z');
  const next = applyNotificationReadOverrides(items, overrides);
  const grouped = groupNotificationsForSheet(next);
  assert.equal(grouped.hasUnread, false);
  assert.equal(grouped.unread.length, 0);
  assert.equal(grouped.read.length, 3);
  assert.equal(
    resolveNotificationBellPresentation({
      signedIn: true,
      hasUnreadNotifications: grouped.hasUnread,
      qcMode: 'unread',
    }).hasUnread,
    false,
  );
});

test('individual notification read affects only that item', () => {
  const items = getNotificationsFixtureItems('unread');
  const unreadId = items.find((item) => !item.readAt).id;
  const overrides = markNotificationReadInOverrides(
    items,
    unreadId,
    {},
    '2026-08-13T00:00:00.000Z',
  );
  const next = applyNotificationReadOverrides(items, overrides);
  assert.equal(countUnreadNotifications(next), 0);
  assert.equal(next.find((item) => item.id === unreadId).readAt, '2026-08-13T00:00:00.000Z');
  assert.ok(next.some((item) => item.id !== unreadId && item.readAt));
});

test('notification navigation uses film identity for Film Detail', () => {
  const items = getNotificationsFixtureItems('unread');
  const target = notificationNavigationTarget(items[0]);
  assert.deepEqual(target, {
    filmKey: 'tmdb:693134',
    opportunityKey: null,
  });
});

test('all-read and empty fixture modes', () => {
  const allRead = groupNotificationsForSheet(
    getNotificationsFixtureItems('all-read'),
  );
  assert.equal(allRead.hasUnread, false);
  assert.equal(allRead.read.length, 3);
  assert.equal(allRead.isEmpty, false);

  const empty = groupNotificationsForSheet(getNotificationsFixtureItems('empty'));
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.hasUnread, false);
});

test('qcNotifications modes parse and resolve fixture source', () => {
  assert.equal(parseQcNotificationsMode('unread'), 'unread');
  assert.equal(parseQcNotificationsMode('all-read'), 'all-read');
  assert.equal(parseQcNotificationsMode('empty'), 'empty');
  assert.equal(
    resolveNotificationsDataSource({ qcNotifications: 'unread' }).source,
    'fixture',
  );
  assert.equal(
    resolveNotificationsDataSource({ qcHeaderNotifications: 'unread' }).mode,
    'unread',
  );
  assert.equal(
    resolveNotificationsDataSource({ qcHeaderNotifications: 'logged-out' })
      .source,
    'production',
  );
});

test('sheet chrome and accessibility semantics are present', () => {
  assert.match(SHEET, /role="dialog"/);
  assert.match(SHEET, /aria-modal="true"/);
  assert.match(SHEET, /aria-labelledby/);
  assert.match(SHEET, /Close notifications/);
  assert.match(SHEET, /Mark all as read/);
  assert.match(SHEET, /Escape/);
  assert.match(SHEET, /No notifications yet/);
  assert.match(CSS, /\.v2-notif-sheet/);
  assert.match(CSS, /\.v2-notif-card-unread/);
});

test('V2App opens sheet from bell and marks read before Film Detail', () => {
  assert.match(APP, /setNotificationsOpen\(true\)/);
  assert.match(APP, /NotificationsSheet/);
  assert.match(APP, /handleOpenNotification/);
  assert.match(APP, /markNotificationReadInOverrides/);
  assert.match(APP, /handleOpenFilmDetail/);
  assert.match(APP, /inert=\{notificationsOpen/);
  assert.match(APP, /onNotificationsOpen=\{handleOpenNotifications\}/);
});

test('logged-out cannot open notification surface; Back still beats bell', () => {
  assert.equal(
    resolveNotificationBellPresentation({ signedIn: false }).visible,
    false,
  );
  assert.match(HEADER, /showBell = Boolean\(showNotificationsBell\) && !showBack/);
  assert.match(APP, /if \(!notificationBell\.visible\) return;/);
});

test('empty state copy is restrained', () => {
  assert.match(SHEET, /No notifications yet/);
  assert.match(
    SHEET,
    /keeping an eye on/,
  );
});
