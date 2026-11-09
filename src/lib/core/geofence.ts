// Pure rules for the USA warehouse geofence (automatic shift start/end from the phone's location). No React, no I/O, so every rule is tested.
import type { Warehouse } from '../hr/types';

/** Great-circle distance between two lat/lon points, in meters (haversine). */
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** A location fix is ignored when its error radius is bigger than this: a 400 m guess says nothing about a 150 m fence. */
export const GEO_MAX_ACCURACY_METERS = 100;
/** Smallest fence radius HR can set: phone GPS is rarely better than about 50 m, so a smaller fence would miss people who are inside. */
export const GEO_MIN_RADIUS_METERS = 100;
/** The server ends a USA shift whose phone has not reported for this long (app closed or no signal), at the phone's last report. The hook keeps its own copy of this number. */
export const GEO_SHIFT_SILENCE_MS = 10 * 60 * 1000;
/** A fix older than this is a cached position, not where the phone is now. */
export const GEO_MAX_FIX_AGE_MS = 2 * 60 * 1000;
/** Shift ends only once the phone is this far beyond the fence edge, so GPS wobble at the edge cannot clock someone in and out repeatedly. */
export const GEO_EXIT_BUFFER_METERS = 50;

export interface GeoFix { latitude: number; longitude: number; accuracy?: number | null; time?: number | null }

export interface GeoDecision {
  /** 'in' = start a shift, 'out' = end it, 'none' = leave it as it is. */
  action: 'in' | 'out' | 'none';
  /** Why the fix was not used (action is 'none' and nothing should be shown from it). */
  ignored?: 'inaccurate' | 'stale' | 'no_warehouse';
  nearest: Warehouse | null;
  distanceMeters: number | null;
  /** Inside any warehouse's radius (what the card shows). */
  isInside: boolean;
}

const usable = (w: Warehouse) => Number.isFinite(w.latitude) && Number.isFinite(w.longitude) && w.radius > 0;

export function decideGeoAction(fix: GeoFix, warehouses: Warehouse[], shiftActive: boolean, now: number = Date.now()): GeoDecision {
  const none = (ignored: GeoDecision['ignored']): GeoDecision => ({ action: 'none', ignored, nearest: null, distanceMeters: null, isInside: false });
  const fences = warehouses.filter(usable);
  if (fences.length === 0) return none('no_warehouse');
  if (fix.time && now - fix.time > GEO_MAX_FIX_AGE_MS) return none('stale');
  if (fix.accuracy != null && fix.accuracy > GEO_MAX_ACCURACY_METERS) return none('inaccurate');

  let nearest: Warehouse | null = null;
  let nearestDistance = Infinity;
  let isInside = false;
  let clearlyOutsideAll = true;
  for (const w of fences) {
    const d = getDistanceMeters(fix.latitude, fix.longitude, w.latitude, w.longitude);
    if (d < nearestDistance) { nearest = w; nearestDistance = d; }
    if (d <= w.radius) isInside = true;
    if (d <= w.radius + GEO_EXIT_BUFFER_METERS) clearlyOutsideAll = false;
  }
  const action = !shiftActive && isInside ? 'in' : shiftActive && clearlyOutsideAll ? 'out' : 'none';
  return { action, nearest, distanceMeters: nearestDistance, isInside };
}
