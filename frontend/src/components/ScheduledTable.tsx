import React, { useState } from 'react';
import type { ScheduledEmail } from '../types/email';
import { Search, RefreshCw, Clock, Trash2, Calendar, Mail, AlertTriangle, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface ScheduledTableProps {
  emails: ScheduledEmail[];
  loading: boolean;
  onRefresh: () => void;
  onCancelEmail: (id: string) => Promise<void>;
}

export const ScheduledTable: React.FC<ScheduledTableProps> = ({
  emails,
  loading,
  onRefresh,
  onCancelEmail,
}) => {
  const [search, setSearch] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const filteredEmails = emails.filter(
    (e) =>
      e.recipient.toLowerCase().includes(search.toLowerCase()) ||
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      e.sender.toLowerCase().includes(search.toLowerCase())
  );

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled email?')) return;
    setCancellingId(id);
    try {
      await onCancelEmail(id);
      toast.success('Scheduled email cancelled');
    } catch {
      toast.error('Failed to cancel email');
    } finally {
      setCancellingId(null);
    }
  };

  const getTimeRemaining = (dateString: string) => {
    const target = new Date(dateString).getTime();
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) return 'Sending now...';
    const seconds = Math.floor(diff / 1000) % 60;
    const minutes = Math.floor(diff / (1000 * 60)) % 60;
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours > 0) return `in ${hours}h ${minutes}m`;
    if (minutes > 0) return `in ${minutes}m ${seconds}s`;
    return `in ${seconds}s`;
  };

  return (
    <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden">
      {/* Table Action Bar */}
      <div className="p-5 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by recipient or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-800 text-slate-200 pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-all self-end sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 font-semibold">Recipient</th>
              <th className="px-6 py-4 font-semibold">Subject & Preview</th>
              <th className="px-6 py-4 font-semibold">Scheduled Send Time</th>
              <th className="px-6 py-4 font-semibold">Sender</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-32" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-48" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-28" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-24" /></td>
                  <td className="px-6 py-4"><div className="h-6 bg-slate-800 rounded-full w-20" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 bg-slate-800 rounded w-12 ml-auto" /></td>
                </tr>
              ))
            ) : filteredEmails.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                  <div className="max-w-xs mx-auto flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-3">
                      <Clock className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-slate-300">No scheduled emails found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {search ? 'Try clearing your search query' : 'Click "Compose New Email" to add jobs to BullMQ'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredEmails.map((email) => (
                <tr key={email.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span className="truncate max-w-[180px]">{email.recipient}</span>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-200 truncate max-w-[240px]">{email.subject}</div>
                    <div className="text-xs text-slate-400 truncate max-w-[240px]" dangerouslySetInnerHTML={{ __html: email.body.replace(/<[^>]*>?/gm, '') }} />
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-200 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(email.sendAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </div>
                    <span className="text-[11px] text-blue-400 font-medium block mt-0.5">
                      {getTimeRemaining(email.sendAt)}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                    {email.sender}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    {email.status === 'SENDING' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Sending...
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <Clock className="w-3 h-3" />
                        Scheduled
                      </span>
                    )}

                    {email.errorMessage && (
                      <div className="text-[10px] text-amber-400 mt-1 max-w-[140px] truncate" title={email.errorMessage}>
                        ⚠️ {email.errorMessage}
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleCancel(email.id)}
                      disabled={cancellingId === email.id}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Cancel Email"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
