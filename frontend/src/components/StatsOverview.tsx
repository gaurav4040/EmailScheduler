import React from 'react';
import { Clock, CheckCircle2, AlertCircle, Gauge, Cpu } from 'lucide-react';

interface StatsOverviewProps {
  stats: {
    scheduled: number;
    sent: number;
    failed: number;
    total: number;
    hourlySentCount: number;
    hourlyLimitMax: number;
  } | null;
  loading: boolean;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-slate-900/60 rounded-2xl border border-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  const usagePercent = Math.min(
    100,
    Math.round((stats.hourlySentCount / Math.max(1, stats.hourlyLimitMax)) * 100)
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Scheduled Metric */}
      <div className="glass-panel p-5 rounded-2xl relative overflow-hidden group hover:border-blue-500/40 transition-all">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Scheduled Queue</p>
            <h3 className="text-2xl font-bold text-white mt-1">{stats.scheduled}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
          <Cpu className="w-3 h-3 text-blue-400" /> BullMQ Delayed Jobs Active
        </p>
      </div>

      {/* Sent Metric */}
      <div className="glass-panel p-5 rounded-2xl relative overflow-hidden group hover:border-emerald-500/40 transition-all">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Delivered Emails</p>
            <h3 className="text-2xl font-bold text-white mt-1">{stats.sent}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
        <p className="text-[11px] text-emerald-400/80 mt-2">Verified via Ethereal SMTP</p>
      </div>

      {/* Failed Metric */}
      <div className="glass-panel p-5 rounded-2xl relative overflow-hidden group hover:border-red-500/40 transition-all">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Failed Sends</p>
            <h3 className="text-2xl font-bold text-white mt-1">{stats.failed}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Automatic retry & backoff enabled</p>
      </div>

      {/* Hourly Rate Limit Metric */}
      <div className="glass-panel p-5 rounded-2xl relative overflow-hidden group hover:border-indigo-500/40 transition-all">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hourly Rate Limit</p>
            <h3 className="text-2xl font-bold text-white mt-1">
              {stats.hourlySentCount} <span className="text-sm font-normal text-slate-400">/ {stats.hourlyLimitMax}</span>
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Gauge className="w-6 h-6" />
          </div>
        </div>

        {/* Progress Gauge Bar */}
        <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              usagePercent >= 90
                ? 'bg-amber-500'
                : usagePercent >= 100
                ? 'bg-red-500'
                : 'bg-indigo-500'
            }`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1 flex justify-between">
          <span>Redis-backed Atomic Counter</span>
          <span>{usagePercent}% Used</span>
        </p>
      </div>
    </div>
  );
};
