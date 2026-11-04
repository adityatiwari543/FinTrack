const BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000/api';

class ApiClient {
  constructor() {
    this.baseUrl = BASE_URL;
    // Security: Access token stored in memory ONLY — never written to localStorage or sessionStorage
    this.accessToken = null;
    // Concurrency control: batch multiple simultaneous 401 refresh calls into a single in-flight promise
    this.refreshPromise = null;

    // Proactively clean up any legacy tokens from localStorage if they ever existed
    this.wipeLegacyStorage();
  }

  wipeLegacyStorage() {
    try {
      localStorage.removeItem('fintrack_access_token');
      localStorage.removeItem('fintrack_refresh_token');
      localStorage.removeItem('fintrack_user');
      sessionStorage.removeItem('fintrack_access_token');
      sessionStorage.removeItem('fintrack_refresh_token');
    } catch (_) {}
  }

  getAccessToken() {
    return this.accessToken;
  }

  setAccessToken(token) {
    this.accessToken = token || null;
  }

  clearTokens() {
    this.accessToken = null;
    this.wipeLegacyStorage();
  }

  generateRequestId() {
    return `req_fe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  /**
   * Refresh the access token using the browser httpOnly cookie.
   * Concurrent 401 errors await this same in-flight promise to prevent multiple refresh calls.
   */
  async refreshTokens() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include', // Ensure httpOnly refreshToken cookie is transmitted
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': this.generateRequestId()
          }
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
          throw new Error(data.error?.message || 'Token refresh failed');
        }

        const newAccessToken = data.data?.accessToken;
        if (!newAccessToken) {
          throw new Error('Malformed token response from server');
        }

        // Store new access token strictly in memory
        this.setAccessToken(newAccessToken);
        return newAccessToken;
      } catch (err) {
        this.clearTokens();
        window.dispatchEvent(new CustomEvent('fintrack_auth_expired'));
        throw err;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Unified request handler with automatic token refresh on 401
   */
  async request(endpoint, options = {}, isRetry = false) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getAccessToken();

    const headers = {
      'Content-Type': 'application/json',
      'x-request-id': this.generateRequestId(),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include', // Send httpOnly cookies with all API requests
        headers
      });

      const data = await response.json().catch(() => ({}));

      // Transparent automatic refresh on 401 (retry original request once)
      const isAuthEndpoint = endpoint.includes('/auth/login') ||
                             endpoint.includes('/auth/register') ||
                             endpoint.includes('/auth/refresh') ||
                             endpoint.includes('/auth/logout');

      if (response.status === 401 && !isRetry && !isAuthEndpoint) {
        try {
          const newToken = await this.refreshTokens();
          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${newToken}`
          };
          return this.request(endpoint, options, true);
        } catch (refreshErr) {
          throw new Error(data.error?.message || 'Session expired. Please log in again.');
        }
      }

      if (!response.ok || !data.success) {
        const errorMsg = data.error?.message || `Request failed with status ${response.status}`;
        const error = new Error(errorMsg);
        error.status = response.status;
        error.code = data.error?.code;
        error.details = data.error?.details;
        throw error;
      }

      return data.data;
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('Unable to connect to API Gateway. Ensure all services are running.');
      }
      throw err;
    }
  }

  get(endpoint, queryParams = {}) {
    const queryString = new URLSearchParams(
      Object.entries(queryParams).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    const fullPath = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(fullPath, { method: 'GET' });
  }

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    });
  }

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    });
  }

  patch(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  }

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
