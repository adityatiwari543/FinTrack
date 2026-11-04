import { api } from './client';

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  refresh: () => api.post('/auth/refresh'),
  getMe: () => api.get('/auth/me'),
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Ignore network errors on logout, guarantee token clearance
    } finally {
      api.clearTokens();
    }
  }
};
