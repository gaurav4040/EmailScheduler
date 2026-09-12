import React, { useState, useMemo } from 'react';
import { X, Upload, Send, Clock, Layers, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import type { ScheduleRequestPayload } from '../types/email';
import toast from 'react-hot-toast';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (payload: ScheduleRequestPayload) => Promise<void>;
  defaultSender?: string;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  defaultSender = 'outbox@reachinbox.ai',
}) => {
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sender, setSender] = useState(defaultSender);
  const [scheduleTiming, setScheduleTiming] = useState<'1min' | '5min' | 'custom'>('1min');
  const [customDateTime, setCustomDateTime] = useState('');
  const [delaySeconds, setDelaySeconds] = useState<number>(2);
  const [hourlyLimit, setHourlyLimit] = useState<number>(100);
  const [submitting, setSubmitting] = useState(false);

  // Email extraction & parsing logic
  const parsedLeads = useMemo(() => {
    if (!recipientsRaw.trim()) return { valid: [], invalidCount: 0 };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const tokens = recipientsRaw
      .split(/[\n,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const validSet = new Set<string>();
    let invalid = 0;

    for (const token of tokens) {
      // Clean quotes/punctuation
      const cleaned = token.replace(/^["']|["']$/g, '');
      if (emailRegex.test(cleaned)) {
        validSet.add(cleaned.toLowerCase());
      } else {
        invalid++;
      }
    }

    return { valid: Array.from(validSet), invalidCount: invalid };
  }, [recipientsRaw]);

  // Handle CSV file drag & drop or click upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRecipientsRaw((prev) => (prev ? `${prev}\n${content}` : content));
        toast.success(`Loaded ${file.name}`);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (parsedLeads.valid.length === 0) {
      toast.error('Please enter or upload at least one valid recipient email address');
      return;
    }
    if (!subject.trim()) {
      toast.error('Email subject is required');
      return;
    }
    if (!body.trim()) {
      toast.error('Email body text is required');
      return;
    }

    // Calculate sendAt ISO string
    let sendAtDate = new Date();
    if (scheduleTiming === '1min') {
      sendAtDate = new Date(Date.now() + 60 * 1000);
    } else if (scheduleTiming === '5min') {
      sendAtDate = new Date(Date.now() + 5 * 60 * 1000);
    } else {
      if (!customDateTime) {
        toast.error('Please select a custom start date and time');
        return;
      }
      sendAtDate = new Date(customDateTime);
    }

    setSubmitting(true);
    try {
      await onSchedule({
        recipients: parsedLeads.valid,
        subject: subject.trim(),
        body: body.trim(),
        sender: sender.trim() || defaultSender,
        sendAt: sendAtDate.toISOString(),
        delaySeconds: Number(delaySeconds),
        hourlyLimit: Number(hourlyLimit),
      });

      toast.success(`Successfully scheduled ${parsedLeads.valid.length} email(s)!`);
      // Reset form
      setRecipientsRaw('');
      setSubject('');
      setBody('');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to schedule emails');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="glass-modal w-full max-w-2xl rounded-2xl shadow-2xl border border-blue-500/30 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Compose & Schedule Outbox Campaign</h2>
              <p className="text-xs text-slate-400">BullMQ Persistent Queue Engine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Sender & Lead Parser Row */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Lead Recipient Emails (CSV or Manual Text)
              </label>
              <label className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 cursor-pointer font-medium">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload CSV / TXT</span>
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <textarea
              rows={3}
              placeholder="Paste lead email addresses separated by commas or newlines (e.g. lead1@acme.com, lead2@corp.io)..."
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 p-3 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
            />

            {/* Live Parsing Feedback Badge */}
            {recipientsRaw.trim() && (
              <div className="mt-2 flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Detected {parsedLeads.valid.length} valid recipient email(s)
                </span>
                {parsedLeads.invalidCount > 0 && (
                  <span className="text-amber-400 text-[11px] flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {parsedLeads.invalidCount} malformed skipped
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Subject Line */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Subject Line
            </label>
            <input
              type="text"
              placeholder="e.g. Quick question regarding Outbox automation"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Email Body */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Email Body (HTML supported)
            </label>
            <textarea
              rows={4}
              placeholder="Hi {{Name}}, I wanted to reach out regarding our scheduled outbox workflow..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 p-3 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
            />
          </div>

          {/* Schedule Timing Selection */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>Schedule Execution Start Time</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScheduleTiming('1min')}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                  scheduleTiming === '1min'
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                In 1 Minute (Test)
              </button>
              <button
                type="button"
                onClick={() => setScheduleTiming('5min')}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                  scheduleTiming === '5min'
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                In 5 Minutes
              </button>
              <button
                type="button"
                onClick={() => setScheduleTiming('custom')}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                  scheduleTiming === 'custom'
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Custom Date & Time
              </button>
            </div>

            {scheduleTiming === 'custom' && (
              <input
                type="datetime-local"
                value={customDateTime}
                onChange={(e) => setCustomDateTime(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 px-3.5 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              />
            )}
          </div>

          {/* Rate Limiting & Concurrency Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Delay Between Emails (Seconds)
              </label>
              <input
                type="number"
                min="0"
                max="3600"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 px-3.5 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Hourly Sender Cap (Max per hour)
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(parseInt(e.target.value, 10) || 100)}
                className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 px-3.5 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || parsedLeads.valid.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span>Enqueuing Jobs...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Schedule {parsedLeads.valid.length} Email(s)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
