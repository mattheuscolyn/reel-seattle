/** Install a temporary global fetch mock; call the returned function to restore. */
export function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

export function jsonFetchResponse(body, { ok = true, status = ok ? 200 : 404 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

export function brokenJsonFetchResponse({ ok = true, status = ok ? 200 : 500 } = {}) {
  return {
    ok,
    status,
    async json() {
      throw new SyntaxError('Unexpected token in JSON');
    },
  };
}
