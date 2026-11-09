'use client';
// USA employees: the phone's location starts and ends the shift at their assigned warehouses (rules: core/geofence.ts). Only a phone or tablet marks
// attendance, and only one of them at a time (core/attendanceDevice.ts): desktops just show the status, a second phone is told which device has it.
// Owns the permission explanation, the location watch, and the clock-in/out calls. A failed clock-in/out is rolled back and
// retried, so the screen can never claim a shift the server does not have.
import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { hrActions, type Profile, type Warehouse } from '@/lib/hrData';
import { notifyShift } from '@/lib/hr/shiftActions';
import { decideGeoAction, type GeoFix } from '@/lib/core/geofence';
import { watchLocation, type GeoPoint } from '@/lib/backgroundGeolocation';
import { isAndroidDevice, isMobileDevice } from '@/lib/trackerSetup';

export type GeoPermission = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'declined' | 'desktop' | 'android' | 'other_device';
export interface LiveDistance { meters: number; warehouseName: string; isInside: boolean }

const RETRY_MS = 60 * 1000; // a phone that has not moved sends no new fix, so the last one is re-checked this often; the same tick refreshes this phone's claim and its shift heartbeat
const RESUME_GAP_MS = 30 * 1000; // coming back to the app refreshes the location, at most this often
const consentKey = (email: string) => `geo_consent_v1:${email.toLowerCase()}`;
// '1' = said yes, '0' = said "Not now". A "Not now" is remembered, so the question is not asked again on every launch; the shift card offers "Turn on".
const storedConsent = (email: string): 'granted' | 'declined' | 'ask' => {
  try { const v = localStorage.getItem(consentKey(email)); return v === '1' ? 'granted' : v === '0' ? 'declined' : 'ask'; } catch { return 'ask'; }
};
const saveConsent = (email: string, yes: boolean) => { try { localStorage.setItem(consentKey(email), yes ? '1' : '0'); } catch { /* asked again next time */ } };

export function useGeofenceShift(args: {
  profile: Profile | null | undefined;
  warehouses: Warehouse[];
  shiftActiveRef: MutableRefObject<boolean>;
  setShiftActive: Dispatch<SetStateAction<boolean>>;
  refetchTimesheets: () => Promise<unknown> | unknown;
}) {
  const { profile, warehouses, shiftActiveRef, setShiftActive, refetchTimesheets } = args;
  const email = profile?.email;
  const isUsa = profile?.region === 'USA';
  const android = isUsa && isAndroidDevice();
  const phone = isUsa && isMobileDevice() && !android;
  const [consent, setConsent] = useState<'checking' | 'ask' | 'granted' | 'declined'>('checking');
  const [state, setState] = useState<{ permission: 'granted' | 'denied' | 'unsupported' | null; error: string }>({ permission: null, error: '' });
  const [liveDistance, setLiveDistance] = useState<LiveDistance | null>(null);
  const [gpsNote, setGpsNote] = useState('');
  const [restartKey, setRestartKey] = useState(0);
  const latest = useRef({ profile, warehouses, refetchTimesheets });
  useEffect(() => { latest.current = { profile, warehouses, refetchTimesheets }; });
  const lastFix = useRef<GeoFix | null>(null);
  const owner = useRef(false);
  const [blockedBy, setBlockedBy] = useState<string | null>(null);
  // Asks the server whether this phone is the one that marks attendance. If the server cannot be reached, the last answer stands.
  const claim = useCallback(async (force = false): Promise<boolean> => {
    try {
      const r = await hrActions.claimAttendanceDevice(force);
      owner.current = r.owner;
      setBlockedBy(r.owner ? null : r.ownerLabel || 'another device');
    } catch { /* keep the last answer */ }
    return owner.current;
  }, []);

  // Ask before the system prompt, once per person on this device (Apple and Google both require saying why first).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (email && phone) setConsent(storedConsent(email));
  }, [email, phone]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const accept = () => { if (email) saveConsent(email, true); setConsent('granted'); setRestartKey(k => k + 1); };
  const decline = () => { if (email) saveConsent(email, false); setConsent('declined'); };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!email || !phone || consent !== 'granted') return;
    let cancelled = false;
    void claim();
    let handle: { stop: () => void } | null = null;

    const evaluate = async (fix: GeoFix) => {
      const { profile: p, warehouses: all, refetchTimesheets: refetch } = latest.current;
      if (cancelled || !p) return;
      const assigned = all.filter(w => p.assignedWarehouses?.includes(w.id));
      const d = decideGeoAction(fix, assigned, shiftActiveRef.current);
      if (d.ignored === 'no_warehouse') { setLiveDistance(null); return; }
      // A fix that is too weak or too old is skipped on purpose; say so on the card, so a shift that is not ending is never a silent mystery.
      setGpsNote(d.ignored === 'inaccurate' ? `Weak GPS signal (about ${Math.round(fix.accuracy ?? 0)} m off) — step outside or near a window` : d.ignored === 'stale' ? 'Waiting for a fresh location…' : '');
      if (d.ignored || !d.nearest || d.distanceMeters === null) return;
      lastFix.current = fix;
      setLiveDistance({ meters: Math.round(d.distanceMeters), warehouseName: d.nearest.name, isInside: d.isInside });
      if (d.action === 'none' || !(await claim())) return; // another phone owns attendance: show the distance, change nothing

      const starting = d.action === 'in';
      shiftActiveRef.current = starting; // set first so two quick fixes cannot both act
      setShiftActive(starting);
      try {
        if (starting) {
          await hrActions.clockIn(p.email, 'gps');
          void hrActions.touchShiftTabHeartbeat(p.email); // reporting starts now, so a phone closed within the first minute is still caught by the server's 10-minute check
        } else await hrActions.clockOut(p.email);
      } catch (err) {
        console.error('[geofence] could not save the shift change, will retry:', err);
        shiftActiveRef.current = !starting;
        setShiftActive(!starting);
        return;
      }
      await refetch();
      const name = d.nearest.name;
      await (starting
        ? notifyShift(p, `Auto Shift ON: Checked-in at ${name} via GPS geofencing.`, who => `${who} checked-in at ${name} via geofencing.`)
        : notifyShift(p, `Auto Shift OFF: Left the geofence at ${name}.`, who => `${who} checked-out (left warehouse geofence at ${name}).`)
      ).catch(() => { /* the shift is already saved; a missed notice must not undo it */ });
    };

    const onFix = (point: GeoPoint) => {
      if (cancelled) return;
      setState({ permission: 'granted', error: '' });
      void evaluate(point);
    };
    const onError = (_message: string, code?: string) => {
      if (cancelled) return;
      if (code === 'UNSUPPORTED') { setState({ permission: 'unsupported', error: '' }); return; }
      setState({
        permission: 'denied',
        error: code === 'NOT_AUTHORIZED'
          ? 'Location is switched off for Delcargo Internal. Set Location to "Always" in your phone settings so your shift can start and end automatically.'
          : 'We could not find your location. Check that Location is turned on and that you have signal. Your shift will start when we do.',
      });
    };

    // Right after (re)starting, or taking attendance over from another phone, re-check the last known position instead of waiting for the next fix.
    void claim().then(() => { if (lastFix.current) void evaluate({ ...lastFix.current, time: null }); });
    watchLocation(onFix, onError).then(h => { if (cancelled) h.stop(); else handle = h; });
    // The last position is still right while the phone has not moved; re-check it so a failed save is retried.
    const retry = setInterval(async () => {
      if (!(await claim())) { void latest.current.refetchTimesheets(); return; } // not the owner: keep showing the owner's shift
      if (shiftActiveRef.current) void hrActions.touchShiftTabHeartbeat(latest.current.profile?.email || ''); // tells the server this phone is still reporting
      if (lastFix.current) void evaluate({ ...lastFix.current, time: null });
    }, RETRY_MS);
    return () => { cancelled = true; clearInterval(retry); handle?.stop(); };
  }, [email, phone, consent, restartKey, shiftActiveRef, setShiftActive, claim]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Back in the app after it was in the background: ask for a fresh position straight away.
  useEffect(() => {
    if (!phone || consent !== 'granted') return;
    let last = 0;
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - last > RESUME_GAP_MS) { last = Date.now(); setRestartKey(k => k + 1); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [phone, consent]);

  const permission: GeoPermission = !isUsa ? 'idle' : android ? 'android' : !phone ? 'desktop' : consent === 'declined' ? 'declined' : blockedBy ? 'other_device' : state.permission ?? 'requesting';
  const error = permission === 'other_device' ? `Attendance is being marked on ${blockedBy}, so this device will not start or end your shift.` : state.error;
  const useThisDevice = async () => { await claim(true); setRestartKey(k => k + 1); };
  return { permission, error, liveDistance, gpsNote, consentPending: consent === 'ask', accept, decline, useThisDevice };
}
