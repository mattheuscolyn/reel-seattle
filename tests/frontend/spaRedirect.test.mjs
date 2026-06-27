import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeSpaRedirectPath,
  SPA_REDIRECT_STORAGE_KEY,
} from '../../src/spaRedirect.js';

function mockStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

test('consumeSpaRedirectPath returns and clears stored path', () => {
  const storage = mockStorage({ [SPA_REDIRECT_STORAGE_KEY]: '/double-feature' });
  assert.equal(consumeSpaRedirectPath(storage), '/double-feature');
  assert.equal(storage.getItem(SPA_REDIRECT_STORAGE_KEY), null);
});

test('consumeSpaRedirectPath returns null when nothing stored', () => {
  const storage = mockStorage();
  assert.equal(consumeSpaRedirectPath(storage), null);
});
