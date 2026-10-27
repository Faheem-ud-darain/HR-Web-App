'use client';

import { useRef, useState } from 'react';
import { hrActions, type InactivityLog, type Profile, type Screenshot } from '@/lib/hrData';
import { computeWindow, localDateString, type ViewerRange } from '@/lib/core/trackingWindow';

// The Screenshots dialog for one employee: range / day selection, 50-at-a-time paging, the inactivity summary
// loaded alongside, the ZIP export, and which screenshot is open in the lightbox.
export function useScreenshotViewer({ canManage }: { canManage: boolean }) {
  const [viewerEmp, setViewerEmp] = useState<Profile | null>(null);
  const [viewerRange, setViewerRange] = useState<ViewerRange>('day');
  // Which calendar day to show when the range is 'day': today by default, any past day on request.
  const [viewerDay, setViewerDay] = useState<string>(() => localDateString());
  const [viewerShots, setViewerShots] = useState<Screenshot[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerTotal, setViewerTotal] = useState(0);
  const [viewerTotalPages, setViewerTotalPages] = useState(1);
  const [viewerLoadingMore, setViewerLoadingMore] = useState(false);
  // The exact [since, until] the first page was loaded with: later pages and the ZIP export reuse it, so a rolling
  // 'week' / 'month' window cannot drift between requests.
  const viewerWindowRef = useRef<{ since: string; until: string } | null>(null);
  // The latest load request: a slower, older response is dropped instead of overwriting the newer one.
  const viewerRequestRef = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [viewerInactivity, setViewerInactivity] = useState<InactivityLog[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const loadViewerData = async (email: string, range: ViewerRange, day: string) => {
    const request = ++viewerRequestRef.current;
    setViewerLoading(true);
    try {
      const { since, until } = computeWindow(range, day);
      viewerWindowRef.current = { since: since.toISOString(), until: until.toISOString() };
      const query = { employeeEmail: email, sinceISO: since.toISOString(), untilISO: until.toISOString() };
      const [first, inactivity] = await Promise.all([hrActions.getScreenshotsPage(query, 1), hrActions.getInactivityLogs(query)]);
      if (request !== viewerRequestRef.current) return;
      setViewerShots(first.items);
      setViewerPage(1);
      setViewerTotal(first.totalItems);
      setViewerTotalPages(first.totalPages);
      setViewerInactivity(inactivity);
    } finally {
      if (request === viewerRequestRef.current) setViewerLoading(false);
    }
  };

  const open = async (emp: Profile) => {
    // Screenshots are HR/Admin only (the API enforces this too).
    if (!canManage) return;
    setViewerEmp(emp);
    setViewerRange('day');
    const today = localDateString();
    setViewerDay(today);
    await loadViewerData(emp.email, 'day', today);
  };

  // Appends the next page of the current window, de-duplicating by id in case new captures shifted the page
  // boundary between requests.
  const loadMoreShots = async () => {
    if (!viewerEmp || viewerLoadingMore || viewerPage >= viewerTotalPages) return;
    setViewerLoadingMore(true);
    try {
      const win = viewerWindowRef.current;
      if (!win) return;
      const request = viewerRequestRef.current;
      const next = await hrActions.getScreenshotsPage({ employeeEmail: viewerEmp.email, sinceISO: win.since, untilISO: win.until }, viewerPage + 1);
      if (request !== viewerRequestRef.current) return; // a newer window replaced the grid meanwhile
      setViewerShots(prev => {
        const seen = new Set(prev.map(x => x.id));
        return [...prev, ...next.items.filter(x => !seen.has(x.id))];
      });
      setViewerPage(next.page);
      setViewerTotal(next.totalItems);
      setViewerTotalPages(next.totalPages);
    } finally {
      setViewerLoadingMore(false);
    }
  };

  const handleRangeChange = (range: ViewerRange) => {
    setViewerRange(range);
    if (viewerEmp) loadViewerData(viewerEmp.email, range, viewerDay);
  };

  const handleDayChange = (day: string) => {
    if (!day) return; // a cleared date field: keep the day that is showing
    setViewerDay(day);
    if (viewerEmp) loadViewerData(viewerEmp.email, 'day', day);
  };

  // The grid only holds the pages loaded so far; the export covers the whole selected window, fetched in full.
  const handleExportZip = async () => {
    if (!viewerEmp || viewerTotal === 0) return;
    setExporting(true);
    try {
      const win = viewerWindowRef.current;
      const allShots = await hrActions.getScreenshots({ employeeEmail: viewerEmp.email, sinceISO: win?.since, untilISO: win?.until });
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const manifestRows = ['Timestamp,Filename'];
      // imageUrl is a data: URL (legacy captures) or a PocketBase file URL (current ones); fetch() handles both.
      await Promise.all(allShots.map(async (s, i) => {
        const blob = await (await fetch(s.imageUrl)).blob();
        // Current captures are WebP, legacy pre-migration ones JPEG.
        const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
        const filename = `${new Date(s.timestamp).toISOString().replace(/[:.]/g, '-')}_${i}.${ext}`;
        zip.file(filename, blob);
        manifestRows.push(`${s.timestamp},${filename}`);
      }));
      zip.file('manifest.csv', manifestRows.join('\n'));
      const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${viewerEmp.fullName.replace(/\s+/g, '_')}_screenshots_${viewerRange}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. See console for details.');
    } finally {
      setExporting(false);
    }
  };

  const lightboxNav = (delta: number) => {
    if (lightboxIndex === null) return;
    const next = lightboxIndex + delta;
    // Stepping onto the last loaded shot pulls the next page in the background.
    if (next >= viewerShots.length - 1 && viewerPage < viewerTotalPages) void loadMoreShots();
    if (next < 0 || next >= viewerShots.length) return;
    setLightboxIndex(next);
  };

  return {
    viewerEmp, setViewerEmp, viewerRange, viewerDay, viewerShots, viewerTotal, viewerLoading, viewerInactivity,
    hasMoreShots: viewerPage < viewerTotalPages, loadingMoreShots: viewerLoadingMore, exporting,
    totalInactiveSeconds: viewerInactivity.reduce((sum, l) => sum + l.durationSeconds, 0),
    open, loadMoreShots, handleRangeChange, handleDayChange, handleExportZip,
    lightboxIndex, openLightbox: setLightboxIndex, closeLightbox: () => setLightboxIndex(null), lightboxNav,
  };
}
