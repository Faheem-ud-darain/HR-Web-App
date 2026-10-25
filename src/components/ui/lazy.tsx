'use client';

// Code-split wrappers for the heavy views and the modals that only matter
// once a user opens them. Import these instead of the component files
// directly: the component's JavaScript then ships as its own chunk and is
// fetched after the page shell paints, rather than inflating the route's
// first-load bundle. Views show a skeleton while their chunk loads; modals
// render nothing (they start closed).
//
// Same names and props as the real components, so swapping an import from
// '@/components/ui/TrackingView' to '@/components/ui/lazy' is the only change.
import dynamic from 'next/dynamic';
import { ListSkeleton, Skeleton, LoadingRegion, StatCardSkeletonGrid } from './Skeleton';

const ViewSkeleton = () => (
  <LoadingRegion label="Loading" className="space-y-4">
    <Skeleton className="h-6 w-48" />
    <ListSkeleton rows={5} />
  </LoadingRegion>
);

const PanelSkeleton = () => <Skeleton className="h-64 w-full rounded-xl" />;

// ── Heavy views ───────────────────────────────────────────────────────────
export const TrackingView = dynamic(() => import('./TrackingView').then(m => m.TrackingView), { loading: ViewSkeleton });
export const TeamChatView = dynamic(() => import('./TeamChatView').then(m => m.TeamChatView), { loading: ViewSkeleton });
export const TicketsView = dynamic(() => import('./TicketsView').then(m => m.TicketsView), { loading: ViewSkeleton });
export const AbsenceDetailsView = dynamic(() => import('./AbsenceDetailsView').then(m => m.AbsenceDetailsView), {
  loading: () => (
    <LoadingRegion label="Loading attendance" className="space-y-4">
      <StatCardSkeletonGrid count={3} />
      <ListSkeleton rows={4} />
    </LoadingRegion>
  ),
});
export const DirectMessagesView = dynamic(() => import('./DirectMessagesView').then(m => m.DirectMessagesView), { loading: ViewSkeleton });
export const TaskBoard = dynamic(() => import('./TaskBoard').then(m => m.TaskBoard), { loading: ViewSkeleton });

// ── Dashboard panels / tabs ───────────────────────────────────────────────
export const OrgCalendar = dynamic(() => import('./OrgCalendar').then(m => m.OrgCalendar), { loading: PanelSkeleton });
export const MaintenanceNoticeManager = dynamic(() => import('./MaintenanceNoticeManager').then(m => m.MaintenanceNoticeManager), { loading: PanelSkeleton });
export const EmployeeActivityInsights = dynamic(() => import('./EmployeeActivityInsights').then(m => m.EmployeeActivityInsights), { loading: PanelSkeleton });

// ── Modals (closed on first paint — nothing to render while loading) ─────
export const AvatarCropperModal = dynamic(() => import('./AvatarCropperModal').then(m => m.AvatarCropperModal), { ssr: false });
export const TaskModal = dynamic(() => import('./TaskModal').then(m => m.TaskModal), { ssr: false });
export const ScheduleMeetModal = dynamic(() => import('./ScheduleMeetModal').then(m => m.ScheduleMeetModal), { ssr: false });
export const UserProfileModal = dynamic(() => import('./UserProfileModal').then(m => m.UserProfileModal), { ssr: false });
export const DocumentsModal = dynamic(() => import('./DocumentsModal').then(m => m.DocumentsModal), { ssr: false });
export const DocumentPreviewModal = dynamic(() => import('./DocumentPreviewModal').then(m => m.DocumentPreviewModal), { ssr: false });
