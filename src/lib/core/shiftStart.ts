// Plain TypeScript. Whether a remote employee may start a shift by hand right now, and if not, why. The order of the checks
// matters and is the product rule: a phone or tablet never starts a shift; an employee whose screen tracking is on needs the
// desktop tracker running (it answered, or its heartbeat is live), on a current build, with its current setup code.
import { needsTrackerUpdate } from '../trackerSetup';
import type { TrackerHeartbeat } from '../hr/types';
import { hasStaleTrackerToken } from './timesheets';

export type StartBlock = 'mobile' | 'tracker_missing' | 'tracker_outdated' | 'tracker_reconnect';

export function shiftStartBlock(input: {
  /** A phone or tablet (see isMobileDevice). */
  mobile: boolean;
  /** HR/Admin have screen tracking on for this employee. */
  tracked: boolean;
  /** The tracker answered the live check. */
  trackerReplied: boolean;
  /** The latest heartbeat the tracker sent, if any. */
  heartbeat: TrackerHeartbeat | null;
  /** That heartbeat is recent enough to count as running. */
  heartbeatLive: boolean;
}): StartBlock | null {
  if (input.mobile) return 'mobile';
  if (!input.tracked) return null;
  if (!input.trackerReplied && !input.heartbeatLive) return 'tracker_missing';
  if (needsTrackerUpdate(input.heartbeat?.agentVersion, input.heartbeat?.deviceLabel)) return 'tracker_outdated';
  if (hasStaleTrackerToken(input.heartbeat)) return 'tracker_reconnect';
  return null;
}
