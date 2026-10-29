import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PersonRow } from '@/components/ui/PersonRow';
import { SectionCard } from '@/components/ui/SectionCard';
import { displayName, type Profile } from '@/lib/hrData';

// For team leads: the people they lead, with a Review button (their shift history and activity) for those whose
// screen tracking is on.
export function TeamMonitorCard({ lead, everyone, isTrackingLiveFor, onReview }: { lead: Profile; everyone: Profile[]; isTrackingLiveFor: (p: Profile) => boolean; onReview: (p: Profile) => void }) {
  const led = everyone.filter(p => p.id !== lead.id && p.teams?.some(t => lead.leadTeams?.includes(t)));
  return (
    <SectionCard title="Team Tracker Monitor" subtitle="Activity logs of the members you lead." action={<Badge variant="default">Lead</Badge>}>
      {led.length === 0 ? <EmptyState py={6} size="xs">No members in the teams you lead.</EmptyState> : (
        <div className="max-h-72 overflow-y-auto py-1">
          {led.map(p => (
            <PersonRow key={p.id} name={displayName(p, lead.role)} src={p.profilePicture} subtitle={p.jobTitle || 'Staff'}
              trailing={isTrackingLiveFor(p) ? <Button variant="secondary" size="sm" onClick={() => onReview(p)}>Review</Button> : <span className="text-caption italic text-slate-500">No tracking</span>} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
