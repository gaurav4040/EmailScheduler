import React from 'react';
import type { User } from '../types/email';
import { Mail, Calendar, Send, Plus, LogOut, Zap } from 'lucide-react';

interface HeaderProps {
  user: User | null;
  activeTab: 'scheduled' | 'sent';
  setActiveTab: (tab: 'scheduled' | 'sent') => void;
  onOpenCompose: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeTab,
  setActiveTab,
  onOpenCompose,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#0d1322]/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">ReachInbox</h1>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Outbox Scheduler
              </span>
            </div>
            <p className="text-xs text-slate-400">BullMQ + Redis High-Throughput Email Engine</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-900/80 p-1.5 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'scheduled'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Scheduled Emails</span>
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'sent'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Sent Log</span>
          </button>
        </div>

        {/* Right Section: Compose Button & User Profile */}
        <div className="flex items-center gap-4">
          <button
            onClick={onOpenCompose}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/25 transition-all transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Compose New Email</span>
          </button>

          {user && (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
              <img
                src={
                  user.avatar ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`
                }
                alt={user.name}
                className="w-9 h-9 rounded-full border border-blue-500/30 bg-slate-800"
              />
              <div className="hidden lg:block text-left">
                <p className="text-xs font-semibold text-slate-200 line-clamp-1">{user.name}</p>
                <p className="text-[11px] text-slate-400 line-clamp-1">{user.email}</p>
              </div>
              <button
                onClick={onLogout}
                title="Logout"
                className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
