'use client';

import { Tabs } from '@/components/ui/Tabs';
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { TimesheetEntry, useProfiles, useTrackingSettings, useAllTrackerHeartbeats, useTimesheets, TrackerHeartbeat } from '@/lib/hrData';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MonitorIcon as Monitor, ShieldWarningIcon as ShieldAlert } from '@/components/ui/icons';
import { MouseActivityModal } from '@/components/ui/tracking/MouseActivityModal';
import { ScreenshotsModal } from '@/components/ui/tracking/ScreenshotsModal';
import { TrackerSetupModal } from '@/components/ui/tracking/TrackerSetupModal';
import { TrackerEmployeeList } from '@/components/ui/tracking/TrackerEmployeeList';
import { ScreenshotLightbox } from '@/components/ui/tracking/ScreenshotLightbox';
import { ForceDisconnectModal, ForceEndShiftModal } from '@/components/ui/tracking/ForceActionModals';
import { useScreenshotViewer } from '@/components/ui/tracking/useScreenshotViewer';
import { useMouseActivity } from '@/components/ui/tracking/useMouseActivity';
import { useTrackerAdmin } from '@/components/ui/tracking/useTrackerAdmin';

interface TrackingViewProps {
  // Screen Tracking is HR/Admin only: team leads and employees never get it.
  role: 'admin' | 'hr';
}

// The Screen Tracking page: every employee's tracker status and settings, with the dialogs for screenshots,
// mouse activity and tracker setup. The state logic lives in ./tracking (useTrackerAdmin, useScreenshotViewer,
// useMouseActivity); this file loads the data and lays the page out.
export function TrackingView({ role }: TrackingViewProps) {
  // Team leads would get read-only access to their own team's tracking data (never the settings or the Setup
  // Agent flow, which stay HR/Admin-only).
  const canManage = role === 'admin' || role === 'hr';
  const [regionFilter, setRegionFilter] = useState<'All' | 'USA' | 'Pakistan'>('All');

  const { data: allProfiles, isLoading: profilesLoading } = useProfiles();
  // Tracking settings: one row per employee in hr_tracking_settings.
  const { data: settingsList = [], refetch: refetchSettings } = useTrackingSettings({ all: true });
  // Heartbeats are one KV row per device (tracker_heartbeat_<slug>); React Query's refetchInterval keeps them fresh.
  const { data: heartbeats = [], refetch: refetchHeartbeats } = useAllTrackerHeartbeats();
  // Needed for "Shift Time" / "Active Time" in the Mouse Activity dialog and to find an open shift to force-close.
  const { data: allTimesheets, refetch: refetchTimesheets } = useTimesheets();

  const employees = (allProfiles || []).filter(e => e.role === 'employee' || e.role === 'team_lead');
  const filteredEmployees = employees.filter(emp => regionFilter === 'All' || (emp.region || 'Pakistan') === regionFilter);

  const heartbeatFor = (email: string): TrackerHeartbeat | null =>
    heartbeats.find(h => h.employeeEmail?.toLowerCase() === email.toLowerCase()) || null;
  // "Open shift" = clock-out empty (the definition used everywhere), found in the timesheets already loaded.
  const openShiftFor = (email: string): TimesheetEntry | null =>
    (allTimesheets || []).find(t => !t.clockOut && t.clockIn && t.employeeEmail?.toLowerCase() === email.toLowerCase()) || null;

  const admin = useTrackerAdmin({ role, settingsList, refetchSettings, refetchHeartbeats, refetchTimesheets });
  const viewer = useScreenshotViewer({ canManage });
  const mouse = useMouseActivity({ timesheets: allTimesheets || [] });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="h-5 w-5 md:h-6 md:w-6 text-orange-600" /> {canManage ? 'Employee Screen Tracking' : 'My Team — Screen Tracking'}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            {canManage
              ? 'Enable desktop screenshot monitoring per employee, set capture intervals, and manage the monthly retention policy.'
              : "View mouse-activity for your team — screenshots and tracking settings (on/off, interval, retention) are managed by HR/Admin only."}
          </p>
        </div>
        <Tabs variant="segmented" compact aria-label="Region" className="self-start" value={regionFilter} onChange={setRegionFilter} items={(['All', 'USA', 'Pakistan'] as const).map(r => ({ value: r, label: r }))} />
      </div>

      <Card className="border border-amber-200 bg-amber-50/60">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <details className="text-xs text-amber-800 font-semibold leading-relaxed w-full [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer font-bold flex justify-between items-center outline-none">
              <span className="truncate pr-2">About Tracker</span>
              <span className="text-caption bg-amber-200/50 px-2 py-1 rounded text-amber-900 shrink-0 whitespace-nowrap">Read More</span>
            </summary>
            <div className="mt-2 space-y-2 text-amber-800/90 font-medium">
              <p>
                Requires the DelCargo Tracker desktop app (Windows/Mac). It runs quietly in the background and only captures while tracking is Active and the employee is clocked in.
              </p>
              <p className="hidden sm:block">
                Employees can get their own setup code directly from their Shift Tracker page.
                Each code securely connects only to their own account.
              </p>
              <p className="hidden sm:block">
                Screenshots older than 30 days are automatically deleted each month,
                unless an employee is explicitly excluded below.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      <TrackerEmployeeList
        canManage={canManage}
        profilesLoading={profilesLoading}
        filteredEmployees={filteredEmployees}
        settingsFor={admin.settingsFor}
        heartbeatFor={heartbeatFor}
        role={role}
        handleToggle={admin.handleToggle}
        handleIntervalChange={admin.handleIntervalChange}
        handleExcludeToggle={admin.handleExcludeToggle}
        handleOpenSetup={admin.handleOpenSetup}
        handleOpenViewer={viewer.open}
        handleOpenMouseView={mouse.open}
        openShiftFor={openShiftFor}
        setForceEndShiftEmp={admin.setForceEndShiftEmp}
        setForceDisconnectEmp={admin.setForceDisconnectEmp}
      />

      {admin.forceEndShiftEmp && (
        <ForceEndShiftModal
          employee={admin.forceEndShiftEmp}
          role={role}
          busy={admin.forceEndingShift}
          onConfirm={() => admin.handleForceEndShift(admin.forceEndShiftEmp!)}
          onClose={() => admin.setForceEndShiftEmp(null)}
        />
      )}
      {admin.forceDisconnectEmp && (
        <ForceDisconnectModal
          employee={admin.forceDisconnectEmp}
          role={role}
          busy={admin.revokingSetupCode}
          openShift={openShiftFor(admin.forceDisconnectEmp.email)}
          onConfirm={() => admin.handleForceDisconnectTracker(admin.forceDisconnectEmp!)}
          onClose={() => admin.setForceDisconnectEmp(null)}
        />
      )}

      <TrackerSetupModal
        setupEmp={admin.setupEmp}
        diagnosticsRequestIdRef={admin.diagnosticsRequestIdRef}
        setSetupEmp={admin.setSetupEmp}
        role={role}
        settingsFor={admin.settingsFor}
        copySetupCode={admin.copySetupCode}
        copied={admin.copied}
        handleRegenerateToken={admin.handleRegenerateToken}
        handleForceDisconnect={admin.handleForceDisconnect}
        copyConfig={admin.copyConfig}
        handleRunDiagnostics={admin.handleRunDiagnostics}
        diagnosticsStatus={admin.diagnosticsStatus}
        handleReloadSettingsNow={admin.handleReloadSettingsNow}
        handleTrackerAction={admin.handleTrackerAction}
        diagnosticsResult={admin.diagnosticsResult}
        copyDiagnosticsReport={admin.copyDiagnosticsReport}
        copiedDiagnostics={admin.copiedDiagnostics}
      />

      <ScreenshotsModal
        viewerEmp={viewer.viewerEmp}
        setViewerEmp={viewer.setViewerEmp}
        role={role}
        handleRangeChange={viewer.handleRangeChange}
        viewerRange={viewer.viewerRange}
        viewerDay={viewer.viewerDay}
        handleDayChange={viewer.handleDayChange}
        handleExportZip={viewer.handleExportZip}
        viewerShots={viewer.viewerShots}
        viewerTotal={viewer.viewerTotal}
        hasMoreShots={viewer.hasMoreShots}
        loadMoreShots={viewer.loadMoreShots}
        loadingMoreShots={viewer.loadingMoreShots}
        exporting={viewer.exporting}
        viewerLoading={viewer.viewerLoading}
        viewerInactivity={viewer.viewerInactivity}
        totalInactiveSeconds={viewer.totalInactiveSeconds}
        openLightbox={viewer.openLightbox}
      />

      {/* Mouse Activity: the full inactivity detail, separate from the Screenshots dialog's compact summary. */}
      <MouseActivityModal
        mouseEmp={mouse.mouseEmp}
        setMouseEmp={mouse.setMouseEmp}
        role={role}
        handleMouseRangeChange={mouse.handleMouseRangeChange}
        mouseRange={mouse.mouseRange}
        mouseDay={mouse.mouseDay}
        handleMouseDayChange={mouse.handleMouseDayChange}
        mouseLoading={mouse.mouseLoading}
        mouseShiftSeconds={mouse.mouseShiftSeconds}
        mouseTotalSeconds={mouse.mouseTotalSeconds}
        mouseActiveSeconds={mouse.mouseActiveSeconds}
        mouseLogs={mouse.mouseLogs}
        mouseLongestSeconds={mouse.mouseLongestSeconds}
        mouseAvgSeconds={mouse.mouseAvgSeconds}
        mouseLogsByDay={mouse.mouseLogsByDay}
      />

      {viewer.lightboxIndex !== null && (
        <ScreenshotLightbox shots={viewer.viewerShots} index={viewer.lightboxIndex} total={viewer.viewerTotal} onClose={viewer.closeLightbox} onNav={viewer.lightboxNav} />
      )}

      <ConfirmDialog
        isOpen={admin.pendingRegenerateTokenEmail !== null}
        onClose={() => admin.setPendingRegenerateTokenEmail(null)}
        onConfirm={admin.confirmRegenerateToken}
        title="Regenerate token?"
        message="Regenerating the token will disconnect the currently installed agent until it is reconfigured with the new token. Continue?"
        confirmLabel={admin.regeneratingToken ? 'Regenerating…' : 'Regenerate'}
        variant="warning"
        loading={admin.regeneratingToken}
      />

      <ConfirmDialog
        isOpen={admin.pendingForceDisconnectEmail !== null}
        onClose={() => admin.setPendingForceDisconnectEmail(null)}
        onConfirm={admin.confirmForceDisconnect}
        title="Force-disconnect tracker?"
        message={`Force-disconnect every tracker (desktop app or Chrome extension) currently linked to ${admin.pendingForceDisconnectEmail}'s account, including one that may genuinely still be running? Use this only to unblock a stuck "device already connected" report.`}
        confirmLabel={admin.forceDisconnectingTracker ? 'Disconnecting…' : 'Disconnect'}
        variant="warning"
        loading={admin.forceDisconnectingTracker}
      />
    </div>
  );
}
