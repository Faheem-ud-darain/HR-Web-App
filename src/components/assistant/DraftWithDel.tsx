'use client';

import React, { useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { getAuthToken } from '@/lib/session';
import { API_BASE } from '@/lib/apiBase';
import type { Ticket } from '@/lib/hrData';
import { ORB_BUSY_DOT_SIZE, ORB_BUSY_SPEED, ORB_COLOR, ORB_DOT_SIZE, ORB_IDLE_SPEED } from './assistantStore';

// "Draft with Del" inside the ticket reply box (HR only). It asks the assistant for a draft and puts it in
// the reply box for the person to edit. It never sends anything: HR reads, edits and presses send.
// The server hides names, e-mails and phone numbers before the ticket text goes to the model.
export function DraftWithDel({ ticket, onDraft }: { ticket: Ticket; onDraft: (text: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const draft = async () => {
    if (loading) return;
    setLoading(true); setError(''); setNote('');
    try {
      const res = await fetch(`${API_BASE}/api/assistant`, {
        method: 'POST',
        signal: AbortSignal.timeout(70_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          ticketDraft: {
            title: ticket.title,
            description: ticket.description,
            employeeName: ticket.employeeName,
            replies: ticket.replies.filter(r => r.message && !r.event).map(r => ({ from: r.senderRole, message: r.message })),
          },
        }),
      });
      const data = await res.json().catch(() => ({})) as { draft?: string; note?: string; error?: string };
      if (!res.ok || !data.draft) throw new Error(data.error || 'Could not write a draft.');
      const first = (ticket.employeeName || '').trim().split(/\s+/)[0] || 'there';
      onDraft(data.draft.replace(/\[EMPLOYEE\]/g, first));
      setNote((data.note || '').replace(/\[EMPLOYEE\]/g, first));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write a draft.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={draft}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 py-1 pl-1.5 pr-3 text-[11px] font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-60"
      >
        <span className="flex h-5 w-5 items-center justify-center" aria-hidden="true">
          <ThinkingOrb state={loading ? 'solving' : 'listening'} speed={loading ? ORB_BUSY_SPEED : ORB_IDLE_SPEED} size={20} theme="light" color={ORB_COLOR} dotSize={loading ? ORB_BUSY_DOT_SIZE : ORB_DOT_SIZE} aria-hidden="true" />
        </span>
        {loading ? 'Del is drafting…' : 'Draft a reply with Del'}
      </button>
      {note && <p className="mt-1 text-[11px] text-amber-700">Check before sending: {note}</p>}
      {error && <p className="mt-1 text-[11px] text-rose-600" role="alert">{error}</p>}
      {!note && !error && <p className="mt-1 text-[10px] text-slate-400">Del reads this ticket (names, e-mails and phone numbers hidden) and writes a draft. You edit and send it.</p>}
    </div>
  );
}
