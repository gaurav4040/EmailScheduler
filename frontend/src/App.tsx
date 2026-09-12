import React, { useState, useEffect, useCallback } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from 'react-hot-toast';
import { Header } from './components/Header';
import { StatsOverview } from './components/StatsOverview';
import { ScheduledTable } from './components/ScheduledTable';
import { SentTable } from './components/SentTable';
import { ComposeModal } from './components/ComposeModal';
import { LoginModal } from './components/LoginModal';
import type { User, ScheduledEmail, ScheduleRequestPayload } from './types/email';
import api from './lib/api';

export const AppContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [sentEmails, setSentEmails] = useState<ScheduledEmail[]>([]);
  const [stats, setStats] = useState<any>(null);

  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [loadingSent, setLoadingSent] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  // Check auth session & Google configuration on startup
  useEffect(() => {
    async function initAuth() {
      try {
        const config = await api.getGoogleConfig();
        setGoogleConfigured(config.configured);
      } catch {
        // ignore
      }

      const token = localStorage.getItem('reachinbox_token');
      if (token) {
        try {
          const res = await api.getMe();
          setUser(res.user);
        } catch {
          localStorage.removeItem('reachinbox_token');
        }
      }
      setLoadingUser(false);
    }
    initAuth();
  }, []);

  // Fetch Scheduled Emails
  const fetchScheduled = useCallback(async () => {
    setLoadingScheduled(true);
    try {
      const res = await api.getScheduledEmails();
      setScheduledEmails(res.emails);
    } catch {
      // ignore
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  // Fetch Sent Emails
  const fetchSent = useCallback(async () => {
    setLoadingSent(true);
    try {
      const res = await api.getSentEmails();
      setSentEmails(res.emails);
    } catch {
      // ignore
    } finally {
      setLoadingSent(false);
    }
  }, []);

  // Fetch System Stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.getStats();
      setStats(res.stats);
    } catch {
      // ignore
    }
  }, []);

  // Refresh all dashboard data
  const refreshAll = useCallback(() => {
    fetchScheduled();
    fetchSent();
    fetchStats();
  }, [fetchScheduled, fetchSent, fetchStats]);

  // Initial load and periodic polling (every 4 seconds)
  useEffect(() => {
    if (user) {
      refreshAll();
      const interval = setInterval(() => {
        refreshAll();
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [user, refreshAll]);

  // Google OAuth Login Handler
  const handleGoogleSuccess = async (credential: string) => {
    try {
      const res = await api.loginWithGoogleToken(credential);
      localStorage.setItem('reachinbox_token', res.token);
      setUser(res.user);
    } catch (err) {
      console.error(err);
    }
  };

  // Demo Sign-In Handler
  const handleDemoSuccess = async () => {
    const res = await api.loginDemo();
    localStorage.setItem('reachinbox_token', res.token);
    setUser(res.user);
  };

  const handleLogout = () => {
    localStorage.removeItem('reachinbox_token');
    setUser(null);
  };

  // Schedule Emails Action Handler
  const handleScheduleAction = async (payload: ScheduleRequestPayload) => {
    await api.scheduleEmails(payload);
    refreshAll();
  };

  // Cancel Email Action Handler
  const handleCancelAction = async (id: string) => {
    await api.cancelEmail(id);
    refreshAll();
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <LoginModal
        onGoogleSuccess={handleGoogleSuccess}
        onDemoSuccess={handleDemoSuccess}
        googleConfigured={googleConfigured}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col">
      <Toaster position="top-right" toastOptions={{ style: { background: '#131b2e', color: '#fff', border: '1px solid #233256' } }} />

      <Header
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCompose={() => setComposeOpen(true)}
        onLogout={handleLogout}
      />

      <main className="max-w-7xl w-full mx-auto px-6 py-8 flex-1">
        {/* System Metric Cards Overview */}
        <StatsOverview stats={stats} loading={!stats} />

        {/* Tab Content */}
        {activeTab === 'scheduled' ? (
          <ScheduledTable
            emails={scheduledEmails}
            loading={loadingScheduled}
            onRefresh={fetchScheduled}
            onCancelEmail={handleCancelAction}
          />
        ) : (
          <SentTable
            emails={sentEmails}
            loading={loadingSent}
            onRefresh={fetchSent}
          />
        )}
      </main>

      <ComposeModal
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSchedule={handleScheduleAction}
        defaultSender={user.email || 'outbox@reachinbox.ai'}
      />
    </div>
  );
};

export function App() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy-google-client-id';

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AppContent />
    </GoogleOAuthProvider>
  );
}

export default App;
