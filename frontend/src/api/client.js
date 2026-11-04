const BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000/api';

class ApiClient {
  constructor() {
    this.baseUrl = BASE_URL;
    this.refreshPromise = null;
  }

  getAccessToken() {
    return localStorage.getItem('fintrack_access_token');
  }

  getRefreshToken() {
    return localStorage.getItem('fintrack_refresh_token');
  }

  setTokens(accessToken, refreshToken) {
    if (accessToken) localStorage.setItem('fintrack_access_token', accessToken);
    if (refreshToken) localStorage.setItem('fintrack_refresh_token', refreshToken);
  }

  clearTokens() {
    localStorage.removeItem('fintrack_access_token');
    localStorage.removeItem('fintrack_refresh_token');
    localStorage.removeItem('fintrack_user');
  }

  generateRequestId() {
    return `req_fe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  async refreshTokens() {
    if (this.refreshPromise) return this.refreshPromise;

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clearTokens();
      throw new Error('No refresh token available');
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': this.generateRequestId()
          },
          body: JSON.stringify({ refreshToken })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error?.message || 'Token refresh failed');
        }

        this.setTokens(data.data.accessToken, data.data.refreshToken);
        return data.data.accessToken;
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
        headers
      });

      const data = await response.json().catch(() => ({}));

      // Handle 401 token expiration and transparently retry
      if (response.status === 401 && !isRetry && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register') && !endpoint.includes('/auth/refresh')) {
        try {
          const newToken = await this.refreshTokens();
          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${newToken}`
          };
          return this.request(endpoint, options, true);
        } catch (refreshErr) {
          throw new Error(data.error?.message || 'Session expired, please log in again.');
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
      body: JSON.stringify(body)
    });
  }

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
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
