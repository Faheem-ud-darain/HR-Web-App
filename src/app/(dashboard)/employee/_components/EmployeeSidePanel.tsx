'use client';

import type { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { hrActions, displayName, Profile } from '@/lib/hrData';
import { StarIcon as Star, GiftIcon as Gift } from '@phosphor-icons/react/dist/ssr';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import type { Announcement } from '@/lib/hrData';
import { AnnouncementItem } from '@/components/ui/AnnouncementItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { announcementWhen } from '@/lib/core/announcements';

interface EmployeeSidePanelProps {
  isInitialLoading: boolean;
  myAnnouncements: Announcement[];
  userProfile: Profile | null;
  announcementReadMap: Record<string, string[]>;
  allEmployees: Profile[];
  isTrackingLiveFor: (emp: Profile) => boolean;
  handleOpenReviewModal: (emp: Profile) => void;
  teamLead: Profile | undefined;
  teamMembers: Profile[];
  router: ReturnType<typeof useRouter>;
}

export function EmployeeSidePanel({ isInitialLoading, myAnnouncements, userProfile, announcementReadMap, allEmployees, isTrackingLiveFor, handleOpenReviewModal, teamLead, teamMembers, router }: EmployeeSidePanelProps) {
  return (
    <div className="lg:col-span-4 space-y-6">
    
      {/* Announcements Feed Widget */}
      <Card className="border border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">Company announcements</h3>
        </div>
        <CardContent className="p-0 divide-y divide-slate-100 max-h-[28rem] overflow-y-auto min-h-[88px]">
          {isInitialLoading ? (
            <div className="space-y-3 animate-pulse p-4" aria-hidden="true">
              <div className="h-14 rounded-lg bg-slate-100" />
              <div className="h-14 rounded-lg bg-slate-100" />
            </div>
          ) : (
            <>
              {myAnnouncements.map(ann => (
                <AnnouncementItem
                  key={ann.id}
                  title={ann.title}
                  content={ann.content}
                  important={ann.important}
                  unread={!!userProfile?.email && !hrActions.isAnnouncementRead(ann, userProfile.email, announcementReadMap)}
                  meta={`${ann.createdBy} · ${announcementWhen(ann.timestamp)}`}
                />
              ))}
              {myAnnouncements.length === 0 && <EmptyState py={6} size="xs">No announcements for your region.</EmptyState>}
            </>
          )}
        </CardContent>
      </Card>
    
      {/* Team Monitor (For Team Leads Only) — list rows now share a
          single divider line instead of each being its own nested
          bordered/tinted box inside the outer Card (nested cards read
          as "boxes within boxes" clutter, not real content grouping). */}
      {userProfile?.isTeamLead && (
        <Card className="bg-white">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-purple-500" /> Team Tracker Monitor
            </h3>
            <Badge variant="default">Lead</Badge>
          </div>
          <CardContent className="p-0">
            <p className="text-caption text-slate-500 leading-relaxed font-semibold px-4 pt-3.5 pb-1">Monitor the active workstation tracking logs of the members you lead:</p>
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
              {allEmployees
                .filter(emp => emp.id !== userProfile.id && emp.teams && emp.teams.some(t => userProfile.leadTeams?.includes(t)))
                .map(member => (
                  <div key={member.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar src={member.profilePicture} name={displayName(member, userProfile?.role)} size={24} />
                      <div className="truncate max-w-[110px]">
                        <div className="font-bold text-slate-800 truncate">{displayName(member, userProfile?.role)}</div>
                        <div className="text-caption text-slate-400 font-semibold truncate">{member.jobTitle || 'Staff'}</div>
                      </div>
                    </div>
                    {isTrackingLiveFor(member) ? (
                      <button
                        onClick={() => handleOpenReviewModal(member)}
                        className="text-caption font-bold text-slate-600 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center gap-1 shrink-0"
                      >
                        Review
                      </button>
                    ) : (
                      <span className="text-caption text-slate-400 italic shrink-0">No Tracking</span>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    
      {/* My Team & Team Lead Widget */}
      <Card className="border border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">My Team ({userProfile?.teams.join(', ')})</h3>
        </div>
        <CardContent className="p-0 min-h-[140px]">
          {isInitialLoading ? (
            <div className="p-4 space-y-3 animate-pulse" aria-hidden="true">
              <div className="h-8 rounded-lg bg-slate-100" />
              <div className="h-6 rounded-lg bg-slate-100" />
              <div className="h-6 rounded-lg bg-slate-100" />
            </div>
          ) : (
          <>
          {/* Team Lead — a single highlighted row, not a boxed card;
              the tint alone is enough to set it apart from the plain
              co-worker rows below. */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <p className="text-caption font-bold text-slate-400 uppercase tracking-widest mb-1.5">Team Lead</p>
            {teamLead ? (
              <div className="flex items-center gap-2.5 bg-purple-50/60 rounded-lg p-2 text-xs -mx-2">
                <Avatar src={teamLead.profilePicture} name={displayName(teamLead, userProfile?.role)} size={24} />
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1"><Star className="h-3.5 w-3.5 text-purple-500 shrink-0" /> {displayName(teamLead, userProfile?.role)}</div>
                  <div className="text-caption text-slate-400 font-semibold">{teamLead.email}</div>
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-400 font-semibold italic">No lead assigned to this team.</span>
            )}
          </div>
    
          {/* Members — plain divided list, not a stack of mini-cards. */}
          <div>
            <p className="text-caption font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-1">Co-Workers</p>
            <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
              {teamMembers.map(member => (
                <div key={member.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                  <Avatar src={member.profilePicture} name={displayName(member, userProfile?.role)} size={20} />
                  <div className="truncate">
                    <div className="font-semibold text-slate-800 truncate">{displayName(member, userProfile?.role)}</div>
                    <div className="text-caption text-slate-400 truncate">{member.email}</div>
                  </div>
                </div>
              ))}
              {teamMembers.length === 0 && (
                <span className="text-xs text-slate-400 italic font-semibold px-4 pb-3 block">You are the only member in this team.</span>
              )}
            </div>
          </div>
          </>
          )}
        </CardContent>
      </Card>
    
      {/* Job Referral Widget */}
      <Card className="border border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Candidate Referrals</h3>
        </div>
        <CardContent className="p-5 space-y-3.5 text-xs text-slate-600 leading-relaxed font-semibold">
          <p>Refer candidates to our open positions! If your referral gets hired and completes <strong>6 months</strong> of service, you will receive a bonus reward:</p>
          <div className="flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl font-bold text-center text-sm">
            <Gift className="h-4 w-4 shrink-0" /> Referral Bonus: PKR 10,000
          </div>
          <Button
            variant="outline"
            size="md"
            fullWidth
            onClick={() => router.push('/employee/careers')}
            className="text-center"
          >
            View open positions to refer →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
