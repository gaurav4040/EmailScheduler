import React, { useState } from 'react';
import type { ScheduledEmail } from '../types/email';
import { Search, RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Mail, Calendar } from 'lucide-react';

interface SentTableProps {
  emails: ScheduledEmail[];
  loading: boolean;
  onRefresh: () => void;
}

export const SentTable: React.FC<SentTableProps> = ({ emails, loading, onRefresh }) => {
  const [search, setSearch] = useState('');

  const filteredEmails = emails.filter(
    (e) =>
      e.recipient.toLowerCase().includes(search.toLowerCase()) ||
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      e.sender.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden">
      {/* Table Action Bar */}
      <div className="p-5 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search sent emails..."
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
          <span>Refresh Sent Logs</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 font-semibold">Recipient</th>
              <th className="px-6 py-4 font-semibold">Subject</th>
              <th className="px-6 py-4 font-semibold">Sent Timestamp</th>
              <th className="px-6 py-4 font-semibold">Sender</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Ethereal Preview</th>
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
                  <td className="px-6 py-4 text-right"><div className="h-4 bg-slate-800 rounded w-16 ml-auto" /></td>
                </tr>
              ))
            ) : filteredEmails.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                  <div className="max-w-xs mx-auto flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-3">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-slate-300">No sent email logs</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Emails executed by the BullMQ worker will appear here with instant Ethereal SMTP preview links.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredEmails.map((email) => (
                <tr key={email.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span className="truncate max-w-[180px]">{email.recipient}</span>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-200 truncate max-w-[240px]">{email.subject}</div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-300">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {email.sentAt
                        ? new Date(email.sentAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : new Date(email.updatedAt).toLocaleString()}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                    {email.sender}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    {email.status === 'SENT' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Sent
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                      </span>
                    )}

                    {email.errorMessage && (
                      <p className="text-[10px] text-red-400 mt-1 max-w-[140px] truncate" title={email.errorMessage}>
                        {email.errorMessage}
                      </p>
                    )}
                  </td>

                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    {email.etherealUrl ? (
                      <a
                        href={email.etherealUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 transition-all hover:scale-105"
                      >
                        <span>View Inbox</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
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
