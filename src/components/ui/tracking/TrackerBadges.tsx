'use client';

import React from 'react';
import { WarningIcon as AlertTriangle, ImageBrokenIcon as ImageOff, LockIcon as Lock, ArrowsClockwiseIcon as RefreshCw, WifiHighIcon as Wifi, WifiSlashIcon as WifiOff } from '@phosphor-icons/react/dist/ssr';
import { getCaptureGap, getCaptureHealth, hrActions, type TimesheetEntry, type TrackerHeartbeat, type TrackingSettings } from '@/lib/hrData';
import { needsTrackerUpdate, TRACKER_MIN_VERSION } from '@/lib/trackerSetup';
import { Badge } from '@/components/ui/Badge';

// Shown beside the green "Connected" badge while the heartbeat is live, to catch a tracker that sits "Connected"
// for hours while producing no usable screenshots (see getCaptureHealth in hrData.ts). Nothing for ok / idle /
// unknown: idle = no active shift, unknown = an agent older than v14 that does not report capture health.
export function CaptureHealthBadge({ hb }: { hb: TrackerHeartbeat | null }) {
  const health = getCaptureHealth(hb);
  if (health.status === 'locked') {
    return <Badge variant="warning" size="sm" className="gap-1" title={health.detail}><Lock className="h-3.5 w-3.5" /> Screen Locked</Badge>;
  }
  if (health.status === 'failing') {
    return <Badge variant="danger" size="sm" className="gap-1" title={health.detail}><ImageOff className="h-3.5 w-3.5" /> No Screenshots</Badge>;
  }
  if (health.status === 'stale_token') {
    // The setup code was regenerated but this running agent still uses the OLD token, so it cannot find its own
    // settings row. That is not the same as "not on shift", and without its own badge it looked identical to a
    // connected-but-idle tracker.
    return <Badge variant="warning" size="sm" className="gap-1" title={health.detail}><RefreshCw className="h-3.5 w-3.5" /> Reconnect Required</Badge>;
  }
  return null;
}

interface TrackerStatusBadgeProps {
  hb: TrackerHeartbeat | null;
  settings: TrackingSettings;
  // The employee's open shift, if any (used to warn when someone is on shift but nothing is captured).
  openShift: TimesheetEntry | null;
  // The desktop table centres the stack; the mobile card right-aligns it against the name.
  align: 'center' | 'end';
}

// "Is this employee's desktop tracker connected right now", with its warnings stacked underneath.
export function TrackerStatusBadge({ hb, settings, openShift, align }: TrackerStatusBadgeProps) {
  const isLive = hrActions.isHeartbeatLive(hb, settings.intervalMinutes);
  const gap = getCaptureGap({
    onShift: !!openShift, trackingOn: settings.enabled, heartbeatLive: isLive,
    lastCaptureAt: hb?.lastCaptureAt, shiftStartedAt: openShift?.clockIn, intervalMinutes: settings.intervalMinutes,
    captureReported: hb?.captureEnabled !== undefined,
  });
  const gapBadge = gap.status === 'tracking_off' ? (
    <Badge variant="danger" size="sm" className="gap-1" title="This employee is on shift but tracking is turned off, so no screenshots are being taken.">
      <AlertTriangle className="h-3.5 w-3.5" /> On shift, tracking OFF
    </Badge>
  ) : gap.status === 'no_captures' ? (
    <Badge variant="warning" size="sm" className="gap-1" title="The tracker is connected but has not captured a screenshot for longer than two intervals.">
      <AlertTriangle className="h-3.5 w-3.5" /> No screenshots for {gap.minutes} min
    </Badge>
  ) : null;

  const layout = `flex flex-col ${align === 'end' ? 'items-end shrink-0' : 'items-center'} gap-1`;

  if (!isLive) {
    return (
      <div className={layout}>
        <Badge size="sm" className={`gap-1 ${align === 'end' ? 'shrink-0' : ''}`}>
          <WifiOff className="h-3.5 w-3.5" /> {hb ? 'Offline' : (settings.enabled ? 'Disconnected' : 'Not installed')}
        </Badge>
        {gapBadge}
      </div>
    );
  }
  return (
    <div className={layout}>
      <Badge variant="success" size="sm" className="gap-1" title={hb?.deviceLabel || ''}>
        <Wifi className="h-3.5 w-3.5" /> Connected{hb?.agentVersion ? ` · v${hb.agentVersion}` : ''}
      </Badge>
      {needsTrackerUpdate(hb?.agentVersion, hb?.deviceLabel) && (
        <Badge variant="warning" size="sm" className="gap-1" title={`Must update to v${TRACKER_MIN_VERSION}`}>
          <AlertTriangle className="h-3.5 w-3.5" /> Update Required
        </Badge>
      )}
      <CaptureHealthBadge hb={hb} />
      {gapBadge}
    </div>
  );
}
