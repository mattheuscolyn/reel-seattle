import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compensateScrollForLayoutHeightChange,
  getScrollBehavior,
  PLANNER_MOBILE_STICKY_SCROLL_OFFSET,
} from '../../src/utils/plannerScroll.js';

test('getScrollBehavior returns auto when smooth is false', () => {
  assert.equal(getScrollBehavior({ smooth: false }), 'auto');
});

test('PLANNER_MOBILE_STICKY_SCROLL_OFFSET is a positive offset', () => {
  assert.ok(PLANNER_MOBILE_STICKY_SCROLL_OFFSET >= 48);
});

test('compensateScrollForLayoutHeightChange no-ops without window', () => {
  assert.doesNotThrow(() => {
    compensateScrollForLayoutHeightChange({
      top: 100,
      heightBefore: 200,
      heightAfter: 0,
    });
  });
});

test('compensateScrollForLayoutHeightChange no-ops when height unchanged', () => {
  const originalScrollTo = globalThis.scrollTo;
  let called = false;
  globalThis.scrollTo = () => {
    called = true;
  };

  try {
    compensateScrollForLayoutHeightChange({
      top: 100,
      heightBefore: 200,
      heightAfter: 200,
    });
    assert.equal(called, false);
  } finally {
    globalThis.scrollTo = originalScrollTo;
  }
});

test('compensateScrollForLayoutHeightChange adjusts scroll when block is above viewport', () => {
  const originalWindow = globalThis.window;
  let scrollArg = null;

  globalThis.window = {
    scrollY: 500,
    scrollTo: (arg) => {
      scrollArg = arg;
    },
    matchMedia: () => ({ matches: false }),
  };

  try {
    compensateScrollForLayoutHeightChange({
      top: 100,
      heightBefore: 300,
      heightAfter: 0,
      smooth: false,
    });
    assert.deepEqual(scrollArg, { top: 200, left: 0, behavior: 'auto' });
  } finally {
    globalThis.window = originalWindow;
  }
});
