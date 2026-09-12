import axios from 'axios';
import type {
  EmailListResponse,
  StatsResponse,
  ScheduleRequestPayload,
  User,
} from '../types/email';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject JWT Auth Header
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('reachinbox_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  // Auth
  async loginWithGoogleToken(credential: string): Promise<{ token: string; user: User }> {
    const res = await apiClient.post('/auth/google', { credential });
    return res.data;
  },

  async loginDemo(): Promise<{ token: string; user: User }> {
    const res = await apiClient.post('/auth/demo');
    return res.data;
  },

  async getMe(): Promise<{ user: User }> {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  async getGoogleConfig(): Promise<{ clientId: string; configured: boolean }> {
    const res = await apiClient.get('/auth/google/config');
    return res.data;
  },

  // Email API
  async scheduleEmails(payload: ScheduleRequestPayload) {
    const res = await apiClient.post('/emails/schedule', payload);
    return res.data;
  },

  async getScheduledEmails(params?: { search?: string; page?: number; limit?: number }): Promise<EmailListResponse> {
    const res = await apiClient.get('/emails/scheduled', { params });
    return res.data;
  },

  async getSentEmails(params?: { search?: string; page?: number; limit?: number }): Promise<EmailListResponse> {
    const res = await apiClient.get('/emails/sent', { params });
    return res.data;
  },

  async getStats(): Promise<StatsResponse> {
    const res = await apiClient.get('/emails/stats');
    return res.data;
  },

  async cancelEmail(id: string) {
    const res = await apiClient.delete(`/emails/${id}`);
    return res.data;
  },
};

export default api;
