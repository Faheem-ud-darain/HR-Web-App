'use client';
// USA employees: the phone's location starts and ends the shift at their assigned warehouses (rules: core/geofence.ts).
// Owns the permission explanation, the location watch, and the clock-in/out calls. A failed clock-in/out is rolled back and
// retried, so the screen can never claim a shift the server does not have.
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { hrActions, type Profile, type Warehouse } from '@/lib/hrData';
import { notifyShift } from '@/lib/hr/shiftActions';
import { decideGeoAction, type GeoFix } from '@/lib/core/geofence';
import { watchLocation, type GeoPoint } from '@/lib/backgroundGeolocation';

export type GeoPermission = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'declined';
export interface LiveDistance { meters: number; warehouseName: string; isInside: boolean }

const RETRY_MS = 60 * 1000; // a phone that has not moved sends no new fix, so the last one is re-checked this often
const RESUME_GAP_MS = 30 * 1000; // coming back to the app refreshes the location, at most this often
const consentKey = (email: string) => `geo_consent_v1:${email.toLowerCase()}`;
const storedConsent = (email: string) => { try { return localStorage.getItem(consentKey(email)) === '1'; } catch { return false; } };

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
  const [consent, setConsent] = useState<'checking' | 'ask' | 'granted' | 'declined'>('checking');
  const [state, setState] = useState<{ permission: 'granted' | 'denied' | 'unsupported' | null; error: string }>({ permission: null, error: '' });
  const [liveDistance, setLiveDistance] = useState<LiveDistance | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const latest = useRef({ profile, warehouses, refetchTimesheets });
  useEffect(() => { latest.current = { profile, warehouses, refetchTimesheets }; });
  const lastFix = useRef<GeoFix | null>(null);

  // Ask before the system prompt, once per person on this device (Apple and Google both require saying why first).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (email && isUsa) setConsent(storedConsent(email) ? 'granted' : 'ask');
  }, [email, isUsa]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const accept = () => { if (email) { try { localStorage.setItem(consentKey(email), '1'); } catch { /* asked again next time */ } } setConsent('granted'); setRestartKey(k => k + 1); };

  useEffect(() => {
    if (!email || !isUsa || consent !== 'granted') return;
    let cancelled = false;
    let handle: { stop: () => void } | null = null;

    const evaluate = async (fix: GeoFix) => {
      const { profile: p, warehouses: all, refetchTimesheets: refetch } = latest.current;
      if (cancelled || !p) return;
      const assigned = all.filter(w => p.assignedWarehouses?.includes(w.id));
      const d = decideGeoAction(fix, assigned, shiftActiveRef.current);
      if (d.ignored === 'no_warehouse') { setLiveDistance(null); return; }
      if (d.ignored || !d.nearest || d.distanceMeters === null) return;
      lastFix.current = fix;
      setLiveDistance({ meters: Math.round(d.distanceMeters), warehouseName: d.nearest.name, isInside: d.isInside });
      if (d.action === 'none') return;

      const starting = d.action === 'in';
      shiftActiveRef.current = starting; // set first so two quick fixes cannot both act
      setShiftActive(starting);
      try {
        if (starting) await hrActions.clockIn(p.email, 'gps'); else await hrActions.clockOut(p.email);
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
    const onError = (message: string, code?: string) => {
      if (cancelled) return;
      if (code === 'UNSUPPORTED') { setState({ permission: 'unsupported', error: '' }); return; }
      setState({
        permission: 'denied',
        error: code === 'NOT_AUTHORIZED'
          ? 'Location is switched off for Delcargo Internal. Set Location to "Always" in your phone settings so your shift can start and end automatically.'
          : (message || 'Unable to determine your location.'),
      });
    };

    watchLocation(onFix, onError).then(h => { if (cancelled) h.stop(); else handle = h; });
    // The last position is still right while the phone has not moved; re-check it so a failed save is retried.
    const retry = setInterval(() => { if (lastFix.current) void evaluate({ ...lastFix.current, time: null }); }, RETRY_MS);
    return () => { cancelled = true; clearInterval(retry); handle?.stop(); };
  }, [email, isUsa, consent, restartKey, shiftActiveRef, setShiftActive]);

  // Back in the app after it was in the background: ask for a fresh position straight away.
  useEffect(() => {
    if (!isUsa || consent !== 'granted') return;
    let last = 0;
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - last > RESUME_GAP_MS) { last = Date.now(); setRestartKey(k => k + 1); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isUsa, consent]);

  const permission: GeoPermission = !isUsa ? 'idle' : consent === 'declined' ? 'declined' : state.permission ?? 'requesting';
  return { permission, error: state.error, liveDistance, consentPending: consent === 'ask', accept, decline: () => setConsent('declined') };
}
