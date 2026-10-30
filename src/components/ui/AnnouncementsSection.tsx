'use client';

import { ForwardToHrAdminModal } from '@/components/ui/ForwardToHrAdminModal';
import React, { useState, useEffect } from 'react';
import { SectionCard } from '@/components/ui/SectionCard';
import { AnnouncementItem } from '@/components/ui/AnnouncementItem';
import { AnnouncementFeed } from '@/components/ui/AnnouncementFeed';
import { IconButton } from '@/components/ui/IconButton';
import { announcementWhen } from '@/lib/core/announcements';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { CheckCircleIcon as CheckCircle2, TrashIcon as Trash2, EyeIcon as Eye, WarningIcon as AlertTriangle, ArrowBendUpRightIcon as Forward } from '@/components/ui/icons';
import { hrActions, Profile, Announcement, useProfiles, useAnnouncements, useWarehouses, displayName } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { FieldLabel } from '@/components/ui/FieldLabel';

type AnnouncementsSectionProps = {
  /** Whose dashboard this is — sets the poster label and who a forward notifies. */
  role: 'hr' | 'admin';
  /** The "Create New Announcement" modal (opened by the page header's button). */
  isCreateOpen: boolean;
  onCreateClose: () => void;
};

// How many announcements the list shows before "Show all" (the list only grows).
const SHOWN_AT_FIRST = 4;

const SENDER_LABEL = { hr: 'HR Manager', admin: 'CEO Admin' } as const;

// Recent-announcements panel plus everything it opens: create, "viewed by",
// forward-to-HR&Admin and delete. Shared by the HR and Admin dashboards,
// which used to carry two copies that differed only in the poster label.
export function AnnouncementsSection({ role, isCreateOpen, onCreateClose }: AnnouncementsSectionProps) {
  const senderLabel = SENDER_LABEL[role];
  const { data: announcements = [], isLoading: announcementsLoading, refetch: refetchAnnouncements } = useAnnouncements();
  const { data: warehouses = [] } = useWarehouses();
  const { data: employees = [] } = useProfiles();

  // Announcement form states
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annTargetType, setAnnTargetType] = useState<'all' | 'usa' | 'pakistan' | 'warehouses'>('all');
  const [annSelectedWarehouses, setAnnSelectedWarehouses] = useState<string[]>([]);
  // Important announcements get a blocking popup in front of every targeted
  // employee (see AnnouncementPopup.tsx) instead of just sitting quietly in
  // the passive "Recent Announcements" feed — reserve this for things that
  // actually need a forced acknowledgment, not routine updates.
  const [annImportant, setAnnImportant] = useState(false);
  const [annSuccess, setAnnSuccess] = useState('');
  const [annPostError, setAnnPostError] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  const [deletingAnnId, setDeletingAnnId] = useState<string | null>(null);
  const [pendingDeleteAnnId, setPendingDeleteAnnId] = useState<string | null>(null);

  // "Viewed by" facepile + modal — see hrActions.getAnnouncementReadMap in
  // hrData.ts (same per-announcement read-tracking store the Employee
  // dashboard's unread-highlight feature uses).
  const [announcementReadMap, setAnnouncementReadMap] = useState<Record<string, string[]>>({});
  const [viewersAnnId, setViewersAnnId] = useState<string | null>(null);
  const viewersForAnnouncement = (annId: string): Profile[] => {
    const emails = (announcementReadMap[annId] || []).map(e => e.toLowerCase());
    return employees.filter((e: Profile) => emails.includes(e.email.toLowerCase()));
  };
  const openViewersModal = (annId: string) => {
    setViewersAnnId(annId);
    hrActions.getAnnouncementReadMap('all').then(setAnnouncementReadMap);
  };

  // "Forward" (HR & Admin Line): the announcement being forwarded, if any (see ForwardToHrAdminModal).
  const [forwardingAnn, setForwardingAnn] = useState<Announcement | null>(null);

  useEffect(() => {
    hrActions.getAnnouncementReadMap('all').then(setAnnouncementReadMap);
  }, [announcements.length]);

  const handleAnnouncementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim() || isPostingAnnouncement) return;
    if (annTargetType === 'warehouses' && annSelectedWarehouses.length === 0) {
      setAnnPostError('Select at least one warehouse for this announcement.');
      return;
    }

    setIsPostingAnnouncement(true);
    setAnnPostError('');
    try {
      const targetVal = annTargetType === 'warehouses' ? annSelectedWarehouses : annTargetType;
      await hrActions.addAnnouncement(annTitle, annContent, targetVal, senderLabel, annImportant);
      refetchAnnouncements();
      setAnnSuccess('Announcement posted successfully!');

      setTimeout(() => {
        onCreateClose();
        setAnnTitle('');
        setAnnContent('');
        setAnnTargetType('all');
        setAnnSelectedWarehouses([]);
        setAnnImportant(false);
        setAnnSuccess('');
      }, 1200);
    } catch (err) {
      // Without this the error went unhandled: the window stayed open and the person had no idea the post failed.
      console.error('Post announcement failed:', err);
      setAnnSuccess('');
      setAnnPostError('Could not post that announcement. Please try again.');
    } finally {
      setIsPostingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = (id: string) => {
    if (deletingAnnId) return;
    setPendingDeleteAnnId(id);
  };

  const confirmDeleteAnnouncement = async () => {
    if (!pendingDeleteAnnId) return;
    const id = pendingDeleteAnnId;
    setDeletingAnnId(id);
    try {
      await hrActions.deleteAnnouncement(id);
      refetchAnnouncements();
    } finally {
      setDeletingAnnId(null);
      setPendingDeleteAnnId(null);
    }
  };

  return (
    <>
      {/* Announcements Panel */}
      <SectionCard title="Recent Announcements" subtitle="Corporate updates and targeted broadcast messages.">
        {announcementsLoading && <div className="p-4"><ListSkeleton rows={3} /></div>}
        {!announcementsLoading && (
          <AnnouncementFeed
            announcements={announcements}
            shownAtFirst={SHOWN_AT_FIRST}
            render={ann => {
              const viewers = viewersForAnnouncement(ann.id);
              const audience = Array.isArray(ann.target)
                ? ann.target.map((tId: string) => warehouses.find(w => w.id === tId)?.name || tId).join(', ')
                : ann.target === 'all' ? 'everyone' : ann.target.toUpperCase();
              return (
                <AnnouncementItem
                  key={ann.id}
                  title={ann.title}
                  content={ann.content}
                  important={ann.important}
                  meta={`By ${ann.createdBy} · ${announcementWhen(ann.timestamp)}`}
                  audience={audience}
                  actions={
                    <>
                      <IconButton size="sm" label="Forward to HR & Admin" onClick={() => setForwardingAnn(ann)}><Forward className="h-4 w-4" /></IconButton>
                      <IconButton size="sm" label="Delete announcement" onClick={() => handleDeleteAnnouncement(ann.id)} loading={deletingAnnId === ann.id} className="hover:text-rose-600 hover:bg-rose-50">
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </>
                  }
                >
                  {/* "Viewed by" facepile — see hrActions.getAnnouncementReadMap in hrData.ts. Clicking opens the full viewer list. */}
                  <button onClick={() => openViewersModal(ann.id)} className="flex items-center gap-2 mt-2.5 group" title="See who has viewed this announcement">
                    <div className="flex -space-x-2">
                      {viewers.length === 0 ? (
                        <span className="h-[22px] w-[22px] rounded-full border border-dashed border-slate-300 flex items-center justify-center">
                          <Eye className="h-3.5 w-3.5 text-slate-500" />
                        </span>
                      ) : (
                        viewers.slice(0, 5).map(v => (
                          <Avatar key={v.id} src={v.profilePicture} name={displayName(v, 'hr')} size={22} className="ring-2 ring-white" />
                        ))
                      )}
                    </div>
                    <span className="text-caption font-bold text-slate-500 group-hover:text-orange-600 transition-colors">
                      {viewers.length === 0 ? 'No views yet' : `${viewers.length} viewed${viewers.length > 5 ? ` (+${viewers.length - 5} more)` : ''}`}
                    </span>
                  </button>
                </AnnouncementItem>
              );
            }}
          />
        )}
        {!announcementsLoading && announcements.length === 0 && <EmptyState py={6} size="xs">No announcements posted yet.</EmptyState>}
      </SectionCard>


      {/* Announcement Viewers Modal — lists everyone who has seen the
          selected announcement (see hrActions.getAnnouncementReadMap). */}
      <Modal
        isOpen={!!viewersAnnId}
        onClose={() => setViewersAnnId(null)}
        title={viewersAnnId ? `Viewed by (${viewersForAnnouncement(viewersAnnId).length})` : 'Viewed by'}
      >
        {viewersAnnId && (() => {
          const viewers = viewersForAnnouncement(viewersAnnId);
          return viewers.length === 0 ? (
            <EmptyState py={6} size="xs">No one has viewed this announcement yet.</EmptyState>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {viewers.map(v => (
                <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                  <Avatar src={v.profilePicture} name={displayName(v, 'hr')} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{displayName(v, 'hr')}</p>
                    <p className="text-xs text-slate-400 truncate">{v.email}</p>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </Modal>

      {/* Announcement Modal */}
      <Modal isOpen={isCreateOpen} onClose={onCreateClose} title="Create New Announcement">
        <form onSubmit={handleAnnouncementSubmit} className="space-y-4 pt-1">
          {annPostError && <p role="alert" className="text-xs font-semibold text-rose-600">{annPostError}</p>}
          {annSuccess && (
            <div className="p-3 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> {annSuccess}
            </div>
          )}

          <FormField label="Announcement Title *">
            <Input 
              type="text" 
              required 
              value={annTitle} 
              onChange={e => setAnnTitle(e.target.value)} 
              fieldSize="soft"
              placeholder="e.g. System Maintenance Notice" 
            />
          </FormField>

          <FormField label="Content *">
            <Textarea
              required
              rows={4}
              value={annContent}
              onChange={e => setAnnContent(e.target.value)}
              fieldSize="lg" className="resize-none"
              placeholder="Type announcement details here..." 
            />
          </FormField>

          <FormField label="Target Audience *">
            <Select
              value={annTargetType}
              onChange={e => setAnnTargetType(e.target.value as Parameters<typeof setAnnTargetType>[0])}
              fieldSize="lg" className="cursor-pointer"
            >
              <option value="all">All Employees</option>
              <option value="usa">USA Employees Only</option>
              <option value="pakistan">Pakistani Employees (Remote) Only</option>
              <option value="warehouses">Specific Warehouses</option>
            </Select>
          </FormField>

          {annTargetType === 'warehouses' && (
            <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-36 overflow-y-auto">
              <FieldLabel size="tiny">Select Warehouses</FieldLabel>
              <div className="space-y-1.5">
                {warehouses.map(wh => (
                  <label key={wh.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={annSelectedWarehouses.includes(wh.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setAnnSelectedWarehouses(prev => [...prev, wh.id]);
                        } else {
                          setAnnSelectedWarehouses(prev => prev.filter(id => id !== wh.id));
                        }
                      }}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    {wh.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={annImportant}
              onChange={e => setAnnImportant(e.target.checked)}
              className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-xs">
              <span className="font-bold text-amber-900 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Mark as Important</span>
              <span className="block text-amber-700 font-medium mt-0.5">
                Every targeted employee gets a popup they must explicitly mark as read — it reappears on every login or page refresh until they do.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" size="md" disabled={isPostingAnnouncement} onClick={() => onCreateClose()}>Cancel</Button>
            <Button type="submit" disabled={isPostingAnnouncement}  loading={isPostingAnnouncement}>
              {isPostingAnnouncement ? 'Posting…' : 'Post Announcement'}
            </Button>
          </div>
        </form>
      </Modal>

      {forwardingAnn && (
        <ForwardToHrAdminModal
          sender={{ email: getSessionEmail() || '', name: senderLabel, role }}
          kind="announcement"
          sourceLabel={forwardingAnn.title}
          sourceId={forwardingAnn.id}
          heading="Announcement"
          title={forwardingAnn.title}
          body={forwardingAnn.content}
          noun="announcement"
          onClose={() => setForwardingAnn(null)}
        />
      )}

      <ConfirmDialog
        isOpen={pendingDeleteAnnId !== null}
        onClose={() => setPendingDeleteAnnId(null)}
        onConfirm={confirmDeleteAnnouncement}
        title="Delete announcement?"
        message="This cannot be undone, and it will disappear from every employee's dashboard immediately."
        confirmLabel={deletingAnnId ? 'Deleting…' : 'Delete'}
        variant="danger"
        loading={!!deletingAnnId}
      />
    </>
  );
}
