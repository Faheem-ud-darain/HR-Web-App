// Central polling cadence for the React Query hooks. Every dashboard page
// mounts the Sidebar/TopNav, so each interval here is paid by every signed-in
// user on every page — keep them as slow as the UX allows. React Query stops
// polling while the tab is hidden/unfocused (refetchIntervalInBackground:
// false) and `refetchOnWindowFocus: true` catches a returning tab up at once
// if its data is past staleTime, so slower intervals don't feel stale.
export const POLL_MS = {
  /** Sidebar ticket badge. Was 8s. */
  tickets: 30_000,
  /** Bell / unread count (new items also arrive via realtime). Was 15s. */
  notifications: 30_000,
  /** Sidebar unread-message dot across all channels. Was 20s. */
  allMessages: 45_000,
  /** Messages in the channel the user is looking at right now. Was 8s. */
  openChat: 10_000,
  announcements: 60_000,
  maintenanceNotices: 60_000,
  teamDocuments: 30_000,
} as const;

export const POLL_OPTIONS = {
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;
