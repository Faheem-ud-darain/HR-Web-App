import React from 'react';
import { Avatar } from '@/components/ui/Avatar';

// A person's small photo with a line of text beside it, for the one-line strips of a CardStack ("Umme Rooman · Normal leave · Nov 10").
export function PersonPeek({ name, picture, children }: { name: string; picture?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
      <Avatar src={picture} name={name} size={18} className="shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}
