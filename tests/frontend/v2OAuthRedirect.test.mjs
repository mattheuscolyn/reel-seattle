import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVED_OAUTH_ORIGINS,
  AUTH_RETURN_INVITE_TOKEN_KEY,
  AUTH_RETURN_PROFILE_STORAGE_KEY,
  cleanAuthCallbackUrl,
  consumeAuthReturnToInvite,
  consumeAuthReturnToProfile,
  isApprovedOAuthOrigin,
  markAuthReturnToInvite,
  markAuthReturnToProfile,
  resolveOAuthRedirectTo,
  sanitizeExplicitOAuthRedirectTo,
} from '../../v2/auth/oauthRedirect.js';

test('approved OAuth origins include production www, apex, and local v2', () => {
  assert.ok(APPROVED_OAUTH_ORIGINS.includes('https://www.reelseattle.com'));
  assert.ok(APPROVED_OAUTH_ORIGINS.includes('https://reelseattle.com'));
  assert.ok(APPROVED_OAUTH_ORIGINS.includes('http://127.0.0.1:5175'));
  assert.ok(APPROVED_OAUTH_ORIGINS.includes('http://localhost:5175'));
});

test('isApprovedOAuthOrigin is exact and rejects subdomains', () => {
  assert.equal(isApprovedOAuthOrigin('https://www.reelseattle.com'), true);
  assert.equal(isApprovedOAuthOrigin('https://staging.reelseattle.com'), false);
  assert.equal(isApprovedOAuthOrigin('https://reelseattle.com.evil.example'), false);
  assert.equal(isApprovedOAuthOrigin(''), false);
});

test('resolveOAuthRedirectTo uses approved current origin', () => {
  assert.equal(
    resolveOAuthRedirectTo({ origin: 'https://www.reelseattle.com' }),
    'https://www.reelseattle.com/',
  );
  assert.equal(
    resolveOAuthRedirectTo({ origin: 'http://127.0.0.1:5175' }),
    'http://127.0.0.1:5175/',
  );
});

test('resolveOAuthRedirectTo falls back to www for unknown origins', () => {
  assert.equal(
    resolveOAuthRedirectTo({ origin: 'https://evil.example' }),
    'https://www.reelseattle.com/',
  );
});

test('sanitizeExplicitOAuthRedirectTo rejects unapproved destinations', () => {
  assert.equal(
    sanitizeExplicitOAuthRedirectTo('https://evil.example/phish'),
    null,
  );
  assert.equal(
    sanitizeExplicitOAuthRedirectTo('https://www.reelseattle.com/deep/path'),
    'https://www.reelseattle.com/',
  );
});

test('cleanAuthCallbackUrl strips code/state and token hashes', () => {
  const replaced = [];
  const cleaned = cleanAuthCallbackUrl({
    href: 'https://www.reelseattle.com/?code=abc&state=xyz#access_token=tok',
    replaceState: (_d, _t, url) => replaced.push(url),
  });
  assert.equal(cleaned, 'https://www.reelseattle.com/');
  assert.deepEqual(replaced, ['https://www.reelseattle.com/']);
});

test('auth return-to-profile flag is one-shot', () => {
  const storage = {
    map: new Map(),
    getItem(k) {
      return this.map.has(k) ? this.map.get(k) : null;
    },
    setItem(k, v) {
      this.map.set(k, String(v));
    },
    removeItem(k) {
      this.map.delete(k);
    },
  };
  markAuthReturnToProfile(storage);
  assert.equal(storage.getItem(AUTH_RETURN_PROFILE_STORAGE_KEY), '1');
  assert.equal(consumeAuthReturnToProfile(storage), true);
  assert.equal(consumeAuthReturnToProfile(storage), false);
});

test('invite OAuth return token is one-shot and wins over Profile', () => {
  const storage = {
    map: new Map(),
    getItem(k) {
      return this.map.has(k) ? this.map.get(k) : null;
    },
    setItem(k, v) {
      this.map.set(k, String(v));
    },
    removeItem(k) {
      this.map.delete(k);
    },
  };
  markAuthReturnToProfile(storage);
  markAuthReturnToInvite('abc123token', storage);
  assert.equal(storage.getItem(AUTH_RETURN_PROFILE_STORAGE_KEY), null);
  assert.equal(storage.getItem(AUTH_RETURN_INVITE_TOKEN_KEY), 'abc123token');
  assert.equal(consumeAuthReturnToInvite(storage), 'abc123token');
  assert.equal(consumeAuthReturnToInvite(storage), null);
});
