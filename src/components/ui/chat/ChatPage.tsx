import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';

// The frame every chat screen sits in (team chats, direct messages, the HR & Admin line, an employee's team chat): the page
// title on a tablet or desktop (a phone's top bar already names the page), then the chat filling the rest of the screen. It
// must be a bounded flex column: that is what keeps the message box pinned to the bottom instead of scrolling away.
export function ChatPage({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <div className="hidden shrink-0 md:block"><PageHeader title={title} subtitle={subtitle} action={action} /></div>
      {children}
    </div>
  );
}
