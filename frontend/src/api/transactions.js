import { api } from './client';

export const transactionApi = {
  getTransactions: (filters = {}) => api.get('/transactions', filters),
  getTransactionById: (id) => api.get(`/transactions/${id}`),
  createTransaction: (data) => api.post('/transactions', data),
  updateTransaction: (id, data) => api.put(`/transactions/${id}`, data),
  deleteTransaction: (id) => api.delete(`/transactions/${id}`),
  getSummary: (month) => api.get('/transactions/summary', { month })
};
