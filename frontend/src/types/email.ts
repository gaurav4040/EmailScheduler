export type EmailStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'RESCHEDULED';

export interface ScheduledEmail {
  id: string;
  userId?: string;
  recipient: string;
  subject: string;
  body: string;
  sender: string;
  sendAt: string;
  sentAt?: string | null;
  delaySeconds: number;
  hourlyLimit: number;
  status: EmailStatus;
  attempts: number;
  errorMessage?: string | null;
  etherealUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatar?: string | null;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EmailListResponse {
  success: boolean;
  emails: ScheduledEmail[];
  pagination: Pagination;
}

export interface StatsResponse {
  success: boolean;
  stats: {
    scheduled: number;
    sent: number;
    failed: number;
    total: number;
    hourlySentCount: number;
    hourlyLimitMax: number;
  };
}

export interface ScheduleRequestPayload {
  recipients: string[];
  subject: string;
  body: string;
  sender?: string;
  sendAt: string;
  delaySeconds?: number;
  hourlyLimit?: number;
}
