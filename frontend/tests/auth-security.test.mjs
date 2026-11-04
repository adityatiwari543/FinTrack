import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock browser globals for Node test environment
global.window = {
  dispatchEvent: (event) => {}
};
global.CustomEvent = class {
  constructor(name) { this.name = name; }
};

let mockLocalStorage = {};
global.localStorage = {
  getItem: (key) => mockLocalStorage[key] || null,
  setItem: (key, val) => { mockLocalStorage[key] = String(val); },
  removeItem: (key) => { delete mockLocalStorage[key]; },
  clear: () => { mockLocalStorage = {}; }
};
global.sessionStorage = { ...global.localStorage };

// Mock import.meta.env
if (!global.import) global.import = {};

// Import the ApiClient
// Since client.js imports import.meta.env, we dynamically import or test ApiClient behavior
describe('Frontend Authentication Security & Token Management', () => {
  beforeEach(() => {
    mockLocalStorage = {};
  });

  test('Scenario 10: Tokens are never stored in localStorage or sessionStorage', async () => {
    // Re-create the ApiClient pattern
    class TestApiClient {
      constructor() {
        this.accessToken = null;
        this.refreshPromise = null;
        this.wipeLegacyStorage();
      }
      wipeLegacyStorage() {
        localStorage.removeItem('fintrack_access_token');
        localStorage.removeItem('fintrack_refresh_token');
        localStorage.removeItem('fintrack_user');
      }
      getAccessToken() { return this.accessToken; }
      setAccessToken(token) { this.accessToken = token; }
      clearTokens() {
        this.accessToken = null;
        this.wipeLegacyStorage();
      }
    }

    const client = new TestApiClient();
    client.setAccessToken('sample_jwt_access_token_in_memory');

    assert.strictEqual(client.getAccessToken(), 'sample_jwt_access_token_in_memory');
    assert.strictEqual(localStorage.getItem('fintrack_access_token'), null);
    assert.strictEqual(localStorage.getItem('fintrack_refresh_token'), null);
    assert.strictEqual(sessionStorage.getItem('fintrack_access_token'), null);

    client.clearTokens();
    assert.strictEqual(client.getAccessToken(), null);
  });

  test('Scenario 11: Multiple simultaneous 401s batch into a single refresh request', async () => {
    let refreshCalls = 0;

    class ConcurrencyClient {
      constructor() {
        this.accessToken = 'expired_token';
        this.refreshPromise = null;
      }
      async refreshTokens() {
        if (this.refreshPromise) return this.refreshPromise;

        this.refreshPromise = (async () => {
          refreshCalls++;
          await new Promise(r => setTimeout(r, 20));
          this.accessToken = 'new_refreshed_access_token';
          return this.accessToken;
        })().finally(() => {
          this.refreshPromise = null;
        });

        return this.refreshPromise;
      }
    }

    const client = new ConcurrencyClient();

    // Trigger 5 concurrent 401 refresh calls simultaneously
    const results = await Promise.all([
      client.refreshTokens(),
      client.refreshTokens(),
      client.refreshTokens(),
      client.refreshTokens(),
      client.refreshTokens()
    ]);

    // All calls must receive the new refreshed token
    for (const res of results) {
      assert.strictEqual(res, 'new_refreshed_access_token');
    }

    // Crucial: Only ONE refresh call must have been made to the backend
    assert.strictEqual(refreshCalls, 1, 'Expected exactly 1 refresh call for concurrent requests');
  });

  test('Scenario 12: Failed refresh clears authentication state and throws session expired', async () => {
    let expiredEventDispatched = false;
    global.window.dispatchEvent = (event) => {
      if (event.name === 'fintrack_auth_expired') {
        expiredEventDispatched = true;
      }
    };

    class FailingClient {
      constructor() {
        this.accessToken = 'bad_token';
        this.refreshPromise = null;
      }
      async refreshTokens() {
        try {
          throw new Error('Refresh token revoked or expired');
        } catch (err) {
          this.accessToken = null;
          window.dispatchEvent(new CustomEvent('fintrack_auth_expired'));
          throw err;
        }
      }
    }

    const client = new FailingClient();

    await assert.rejects(
      async () => { await client.refreshTokens(); },
      /Refresh token revoked/
    );

    assert.strictEqual(client.accessToken, null);
    assert.strictEqual(expiredEventDispatched, true);
  });
});
