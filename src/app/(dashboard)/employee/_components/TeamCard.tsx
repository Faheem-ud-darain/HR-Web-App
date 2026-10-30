'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PersonRow } from '@/components/ui/PersonRow';
import { SectionCard } from '@/components/ui/SectionCard';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { StarIcon as Star } from '@/components/ui/icons';
import { UserProfileModal } from '@/components/ui/UserProfileModal';
import { displayName, type Profile } from '@/lib/hrData';

// "My Team": the people in the employee's team (a switch when they are in more than one), the lead first and highlighted.
// Tapping a person opens their profile card (it checks what this viewer may see).
export function TeamCard({ me, everyone, loading }: { me: Profile | null; everyone: Profile[]; loading: boolean }) {
  const myTeams = me?.teams ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const team = picked && myTeams.includes(picked) ? picked : myTeams[0];

  const inTeam = everyone.filter(p => p.id !== me?.id && p.teams?.includes(team));
  const lead = everyone.find(p => p.isTeamLead && p.leadTeams?.includes(team));
  const members = inTeam.filter(p => p.id !== lead?.id);
  const name = (p: Profile) => displayName(p, me?.role);

  return (
    <SectionCard title="My Team" subtitle={myTeams.length === 1 ? team : undefined} count={loading ? undefined : members.length + (lead && lead.id !== me?.id ? 1 : 0)}>
      {myTeams.length > 1 && <div className="px-4 md:px-6 pt-3"><Tabs variant="chips" value={team} onChange={setPicked} items={myTeams.map(t => ({ value: t, label: t }))} aria-label="Your teams" /></div>}
      {loading ? <div className="p-4"><ListSkeleton rows={3} /></div> : (
        <div className="py-1">
          {lead && lead.id !== me?.id
            ? <PersonRow highlight name={name(lead)} src={lead.profilePicture} subtitle={`Team lead · ${lead.email}`} badge={<Star weight="fill" className="h-3.5 w-3.5 shrink-0 text-purple-500" aria-label="Team lead" />} onClick={() => setOpenEmail(lead.email)} />
            : !lead && <p className="px-4 md:px-6 py-2.5 text-xs font-semibold italic text-slate-500">No lead assigned to this team.</p>}
          {members.map(p => <PersonRow key={p.id} name={name(p)} src={p.profilePicture} subtitle={p.jobTitle || p.email} onClick={() => setOpenEmail(p.email)} />)}
          {members.length === 0 && <EmptyState py={6} size="xs">You are the only member in this team.</EmptyState>}
        </div>
      )}
      {me && openEmail && <UserProfileModal isOpen onClose={() => setOpenEmail(null)} employeeEmail={openEmail} currentUserRole={me.isTeamLead ? 'team_lead' : 'employee'} currentUserEmail={me.email} />}
    </SectionCard>
  );
}
