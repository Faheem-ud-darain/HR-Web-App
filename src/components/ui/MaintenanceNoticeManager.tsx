'use client';

import { useState } from 'react';
import { Card, CardContent } from './Card';
import { Modal } from './Modal';
import { Wrench, PlusCircle, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { hrActions, useMaintenanceNotices } from '@/lib/hrData';
import { pktLocalToUtcIso, formatInViewerLocalTime } from '@/lib/timezone';

interface MaintenanceNoticeManagerProps {
  createdBy: string;
}

// Self-contained "Post System Maintenance Notice" panel — a button, a list
// of existing notices, and the creation modal, all in one component so
// hr/page.tsx and admin/page.tsx (both of which can post these — see
// addMaintenanceNotice in hrData.ts) can drop it in without duplicating the
// whole form twice. Deliberately separate from the Announcements
// panel/modal on those pages: this is a different system with different
// fields (a real start/end window, entered as Pakistan time) — see
// MaintenanceNotice in hrData.ts for why.
export function MaintenanceNoticeManager({ createdBy }: MaintenanceNoticeManagerProps) {
  const { data: notices = [], refetch } = useMaintenanceNotices();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetForm = () => {
    setTitle(''); setMessage(''); setDate(''); setStartTime(''); setEndTime('');
    setSuccess(''); setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim() || !message.trim() || !date || !startTime || !endTime || submitting) return;

    const startAtIso = pktLocalToUtcIso(date, startTime);
    const endAtIso = pktLocalToUtcIso(date, endTime);
    if (new Date(endAtIso).getTime() <= new Date(startAtIso).getTime()) {
      setError('End time must be after start time.');
      return;
    }

    setSubmitting(true);
    try {
      await hrActions.addMaintenanceNotice(title.trim(), message.trim(), startAtIso, endAtIso, createdBy);
      await refetch();
      setSuccess('Maintenance notice posted — every employee, HR, and Admin will see it.');
      setTimeout(() => { setIsOpen(false); resetForm(); }, 1200);
    } catch (err) {
      console.error('Failed to post maintenance notice:', err);
      setError('Failed to post the notice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await hrActions.deleteMaintenanceNotice(id);
      await refetch();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Card className="p-0">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-2 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-1.5">
              <Wrench className="h-4 w-4 text-sky-600" /> System Maintenance Notices
            </h2>
            <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">
              Warn everyone before you push an update — shown as a blocking popup to Employees, Team Leads, HR, and Admin alike.
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setIsOpen(true); }}
            className="shrink-0 bg-sky-600 hover:bg-sky-700 text-white font-bold px-3 py-2 rounded-xl text-[11px] active:scale-97 transition-colors transition-transform shadow-sm flex items-center gap-1.5"
          >
            <PlusCircle className="h-3.5 w-3.5" /> New Notice
          </button>
        </div>
        <CardContent className="p-0 divide-y divide-slate-100">
          {notices
            .slice()
            .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
            .map(n => {
              const isPast = new Date(n.endAt).getTime() < Date.now();
              return (
                <div key={n.id} className="p-4 md:px-6 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm">{n.title}</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap break-words">{n.message}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(n.id)}
                      disabled={deletingId === n.id}
                      title="Delete notice"
                      className="h-6 w-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {deletingId === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className={`text-[10px] font-bold ${isPast ? 'text-slate-400' : 'text-sky-700'}`}>
                    {isPast ? 'Ended' : 'Window'}: {formatInViewerLocalTime(n.startAt)} — {formatInViewerLocalTime(n.endAt)} (your local time)
                  </p>
                </div>
              );
            })}
          {notices.length === 0 && (
            <p className="text-xs text-slate-400 font-semibold italic text-center py-6">No maintenance notices posted yet.</p>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={isOpen} onClose={() => { setIsOpen(false); resetForm(); }} title="Post System Maintenance Notice">
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {success && (
            <div className="p-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> {success}
            </div>
          )}
          {error && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-100 rounded-xl font-semibold">{error}</div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-sky-100 font-semibold"
              placeholder="e.g. Scheduled App Update"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Message *</label>
            <textarea
              required
              rows={3}
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-slate-50/50 hover:bg-slate-100 border border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-sky-100 font-semibold resize-none"
              placeholder="e.g. The website and apps will be briefly unavailable while we push an update."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Maintenance Date *</label>
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-sky-100 font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Time (Pakistan) *</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-sky-100 font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Time (Pakistan) *</label>
              <input
                type="time"
                required
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-sky-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-sky-100 font-semibold"
              />
            </div>
          </div>

          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
            <p className="text-[11px] text-sky-800 font-semibold leading-relaxed">
              Enter the time in Pakistan Standard Time — every employee, HR, and Admin will see it automatically
              converted to their own device's local time, plus a blocking popup and push notification.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled={submitting}
              onClick={() => { setIsOpen(false); resetForm(); }}
              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 font-bold px-4 py-2.5 md:py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2.5 md:py-2 rounded-xl text-xs active:scale-97 transition-colors transition-transform shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? 'Posting…' : 'Post Notice'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
