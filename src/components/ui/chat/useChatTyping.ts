'use client';

import { useEffect, useRef, useState } from 'react';
import { hrActions } from '@/lib/hrData';
import { setAdaptiveInterval } from '@/lib/idle';

// Typing-indicator pace: warm channel / quiet channel, and how long without a message or typing counts as quiet.
const TYPING_POLL_MS = 5000;
const TYPING_QUIET_POLL_MS = 15000;
const QUIET_AFTER_MS = 2 * 60 * 1000;

// "X is typing...": names of everyone else typing in the open channel. There is no presence signal for chat, so
// instead of polling every 2s forever: 5s ticks while the channel is "warm" (a message arrived or someone typed in
// the last 2 minutes), backing off to 15s once quiet (any new message or typing snaps it back); hidden tabs are
// skipped and idle people poll 3x slower (setAdaptiveInterval). Clearing this device's own typing marker on a
// channel switch happens in the cleanup.
export function useChatTyping({ activeTeamId, currentUserEmail, messageCount }: { activeTeamId: string | null; currentUserEmail: string; messageCount: number }) {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const quietSinceRef = useRef(0); // set to the real time by the effect below
  useEffect(() => { quietSinceRef.current = Date.now(); }, [messageCount, activeTeamId]);

  useEffect(() => {
    if (!activeTeamId || !currentUserEmail) return;
    let cancelled = false;
    const poll = () => {
      hrActions.getTypingUsers('chat', activeTeamId, currentUserEmail).then(rows => {
        if (cancelled) return;
        if (rows.length > 0) quietSinceRef.current = Date.now();
        setTypingNames(rows.map(r => r.displayName));
      }).catch(() => {});
    };
    poll();
    const stop = setAdaptiveInterval(poll, () => (Date.now() - quietSinceRef.current > QUIET_AFTER_MS ? TYPING_QUIET_POLL_MS : TYPING_POLL_MS));
    return () => {
      cancelled = true;
      stop();
      hrActions.clearTypingState('chat', activeTeamId, currentUserEmail).catch(() => {});
    };
  }, [activeTeamId, currentUserEmail]);

  return { typingNames, resetTyping: () => setTypingNames([]) };
}
