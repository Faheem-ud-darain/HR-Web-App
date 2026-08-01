'use client';

// Small "X is typing…" row shared by Team Chat (TeamChatView.tsx) and the
// Ticket screen (TicketsView.tsx). Both screens already poll
// hrActions.getTypingUsers(scope, id, viewerEmail) on an interval and pass
// the resulting names in — this component is pure presentation, it doesn't
// poll or touch typing state itself.
export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;

  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]} and ${names.length - 1} others are typing`;

  return (
    <div className="typing-row-in flex items-center gap-2 px-1 py-1 text-xs font-medium text-slate-400">
      <span className="flex items-center gap-1 text-slate-400">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
      <span>{label}</span>
    </div>
  );
}
