// The browser side of starting and ending a shift: the live check that the desktop tracker is really running, and the one
// way a shift change is announced (it used to be copied four times: manual start, manual end, GPS arrive, GPS leave).
import { hrActions, displayName } from '../hrData';
import type { Profile, TrackerHeartbeat } from './types';

const POLL_MS = 500;
const TIMEOUT_MS = 8000;

/**
 * Asks the tracker to answer (a "ping" it replies to within about a second) and waits up to 8 real seconds for the reply.
 * Whether or not it answered, also reads its latest heartbeat: a firewall or a busy server can hide the reply from a tracker
 * that is plainly running. The wait is measured on the clock, not by counting polls, so a slow connection cannot stretch it
 * (it once left "Connecting to tracker…" showing for 11+ minutes).
 */
export async function checkTracker(email: string): Promise<{ trackerReplied: boolean; heartbeat: TrackerHeartbeat | null; heartbeatLive: boolean }> {
  const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let trackerReplied = false;
  try {
    await hrActions.clearTrackerPong(email); // an old reply from an earlier try
    await hrActions.writeTrackerPing(email, requestId);
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_MS));
      try {
        const pong = await hrActions.getTrackerPong(email);
        if (pong?.requestId === requestId) { trackerReplied = true; break; }
      } catch { /* a failed poll is not an answer: keep trying */ }
    }
  } catch {
    // Could not even write the ping (server trouble): carry on to the heartbeat instead of blocking outright.
  } finally {
    hrActions.clearTrackerPing(email).catch(() => {});
    hrActions.clearTrackerPong(email).catch(() => {});
  }
  const heartbeat = (await hrActions.getTrackerHeartbeat(email).catch(() => null)) ?? null;
  return { trackerReplied, heartbeat, heartbeatLive: hrActions.isHeartbeatLive(heartbeat) };
}

/**
 * Tells the employee and then HR and Admin that a shift started or ended. `staffMessage` gets the employee's display name.
 * Sent as the "shift" category with the sender's email, so HR and Admin get a push (with the employee's photo), not just a bell entry.
 */
export async function notifyShift(profile: Profile, selfMessage: string, staffMessage: (actorName: string) => string): Promise<void> {
  const actor = displayName(profile, 'hr');
  await hrActions.addNotification(profile.email, 'employee', selfMessage);
  await hrActions.addNotification('all', 'hr', staffMessage(actor), 'shift', actor, profile.email);
  await hrActions.addNotification('all', 'admin', staffMessage(actor), 'shift', actor, profile.email);
}
