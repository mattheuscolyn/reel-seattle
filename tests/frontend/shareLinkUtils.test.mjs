import test from 'node:test';
import assert from 'node:assert/strict';
import { copyTextToClipboard, shareTextWithFallback } from '../../src/utils/shareLinkUtils.js';

test('shareTextWithFallback copies when Web Share API is unavailable', async () => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => {
          assert.equal(text, 'hello plan');
        },
      },
    },
  });

  const result = await shareTextWithFallback({ title: 'Plan', text: 'hello plan' });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'clipboard');
});

test('shareTextWithFallback treats Web Share cancel as neutral', async () => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      share: async () => {
        const error = new Error('Share cancelled');
        error.name = 'AbortError';
        throw error;
      },
      clipboard: {
        writeText: async () => {},
      },
    },
  });

  const result = await shareTextWithFallback({ text: 'hello plan' });
  assert.equal(result.ok, false);
  assert.equal(result.method, 'cancelled');
});

test('copyTextToClipboard rejects empty text', async () => {
  const result = await copyTextToClipboard('');
  assert.equal(result.ok, false);
});
