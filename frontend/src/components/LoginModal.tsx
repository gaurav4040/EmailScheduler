import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Mail, ShieldCheck, Zap, Server, CheckCircle2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface LoginModalProps {
  onGoogleSuccess: (credential: string) => Promise<void>;
  onDemoSuccess: () => Promise<void>;
  googleConfigured: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onGoogleSuccess,
  onDemoSuccess,
  googleConfigured,
}) => {
  const [loading, setLoading] = React.useState(false);

  const handleDemoClick = async () => {
    setLoading(true);
    try {
      await onDemoSuccess();
      toast.success('Signed in as Demo Candidate');
    } catch {
      toast.error('Failed to log in via Demo mode');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0f19] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(59,130,246,0.15),rgba(255,255,255,0))]">
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-blue-500/20 shadow-2xl shadow-blue-500/10 text-center relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl" />

        {/* Logo Badge */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 flex items-center justify-center mx-auto shadow-xl shadow-blue-600/30 mb-5 border border-white/10">
          <Mail className="w-7 h-7 text-white" />
        </div>

        <h2 className="text-2xl font-bold text-white tracking-tight">ReachInbox Outbox</h2>
        <p className="text-sm text-slate-400 mt-1 mb-6">
          Production-Grade Email Scheduler Dashboard
        </p>

        {/* Technical Highlights Pill List */}
        <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 text-left space-y-2.5 mb-6 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>BullMQ Delayed Jobs & Redis Queue Engine</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Redis-Backed Atomic Hourly Rate Limiter</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Process Restart Resilience & Idempotency</span>
          </div>
        </div>

        {/* Real Google OAuth Login */}
        <div className="space-y-3 flex flex-col items-center">
          {googleConfigured ? (
            <div className="w-full flex justify-center">
              <GoogleLogin
                onSuccess={(credentialResponse) => {
                  if (credentialResponse.credential) {
                    onGoogleSuccess(credentialResponse.credential);
                  }
                }}
                onError={() => {
                  toast.error('Google Sign-In failed');
                }}
                theme="filled_blue"
                shape="pill"
                size="large"
              />
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              Google OAuth client ID not set in env. You can use Quick Demo Sign-In below.
            </p>
          )}

          {/* Quick Demo Sign-In Button */}
          <button
            onClick={handleDemoClick}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-sm font-semibold bg-slate-900 border border-slate-700 hover:bg-slate-800 hover:border-blue-500/50 text-slate-200 transition-all flex items-center justify-center gap-2 shadow-lg group"
          >
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>{loading ? 'Signing in...' : 'Sign in as Demo Candidate'}</span>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 mt-6">
          ReachInbox.ai Software Development Intern Assignment
        </p>
      </div>
    </div>
  );
};
