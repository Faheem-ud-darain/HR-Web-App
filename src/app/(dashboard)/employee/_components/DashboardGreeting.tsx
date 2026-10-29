import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BankIcon as Landmark } from '@/components/ui/icons';
import type { Profile } from '@/lib/hrData';

const greeting = (now: number) => {
  if (!now) return 'Welcome';
  const hour = new Date(now).getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

// The top of the employee dashboard: who is signed in, what day part it is, their title and region, and whether payroll
// has their bank details (a prompt to add them when it does not).
export function DashboardGreeting({ profile, now }: { profile: Profile | null; now: number }) {
  const first = (profile?.fullName || 'there').split(' ')[0];
  return (
    <Card className="p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <Avatar src={profile?.profilePicture} name={profile?.fullName || 'Employee'} size={56} className="border-2 border-orange-500" />
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 truncate">{greeting(now)}, {first}</h1>
            <p className="text-xs md:text-sm font-semibold text-slate-500 truncate">
              {profile?.jobTitle || 'Team Member'} · <span className="font-bold text-orange-600">{profile?.region === 'USA' ? 'USA Operations' : 'Pakistan (Remote)'}</span>
            </p>
          </div>
        </div>
        {profile?.bankName
          ? <Badge variant="success" className="self-start md:self-auto"><Landmark className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> {profile.bankName} (Verified)</Badge>
          : <ButtonLink href="/employee/profile" variant="secondary" size="sm" className="self-start md:self-auto"><Landmark className="h-3.5 w-3.5" aria-hidden="true" /> Add bank details</ButtonLink>}
      </div>
    </Card>
  );
}
