import { api } from './client';

export const notificationApi = {
  getNotifications: () => api.get('/notifications'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  getThreshold: () => api.get('/settings/threshold'),
  setThreshold: (threshold) => api.put('/settings/threshold', { threshold })
};
