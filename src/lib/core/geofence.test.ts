import { describe, expect, it } from 'vitest';
import { GEO_EXIT_BUFFER_METERS, GEO_MIN_RADIUS_METERS, GEO_MAX_ACCURACY_METERS, GEO_MAX_FIX_AGE_MS, decideGeoAction, getDistanceMeters } from './geofence';

const yard = { id: 'w1', name: 'Dallas Yard', latitude: 32.7767, longitude: -96.797, radius: 150 };
const dock = { id: 'w2', name: 'Fort Worth Dock', latitude: 32.7555, longitude: -97.3308, radius: 100 };
const NOW = Date.UTC(2026, 10, 5, 15);
// A point `meters` due north of the yard (1 degree of latitude is about 111,195 m).
const north = (meters: number, over = {}) => ({ latitude: yard.latitude + meters / 111195, longitude: yard.longitude, accuracy: 10, time: NOW, ...over });
const decide = (fix: ReturnType<typeof north>, shiftActive: boolean, fences = [yard]) => decideGeoAction(fix, fences, shiftActive, NOW);

describe('getDistanceMeters', () => {
  it('measures real distances', () => {
    expect(getDistanceMeters(yard.latitude, yard.longitude, yard.latitude, yard.longitude)).toBe(0);
    expect(Math.round(getDistanceMeters(yard.latitude, yard.longitude, yard.latitude + 0.001, yard.longitude))).toBeCloseTo(111, -1);
  });
});

describe('starting a shift', () => {
  it('starts when the phone is inside the radius and no shift is open', () => {
    expect(decide(north(100), false)).toMatchObject({ action: 'in', isInside: true, nearest: yard });
  });
  it('does not start outside the radius, or when a shift is already open', () => {
    expect(decide(north(200), false).action).toBe('none');
    expect(decide(north(100), true).action).toBe('none');
  });
});

describe('ending a shift', () => {
  it('stays open inside the radius and in the buffer just outside it, so edge wobble does not flap', () => {
    expect(decide(north(100), true).action).toBe('none');
    expect(decide(north(150 + GEO_EXIT_BUFFER_METERS - 5), true).action).toBe('none');
    expect(decide(north(160), true)).toMatchObject({ action: 'none', isInside: false });
  });
  it('ends once clearly beyond the buffer', () => {
    expect(decide(north(150 + GEO_EXIT_BUFFER_METERS + 5), true)).toMatchObject({ action: 'out', isInside: false });
  });
  it('with several warehouses, ends only when outside all of them; being inside any keeps it open', () => {
    expect(decide(north(500), true, [yard, dock]).action).toBe('out');
    expect(decide(north(500), true, [yard, { ...yard, id: 'w3', latitude: yard.latitude + 500 / 111195, radius: 120 }]).action).toBe('none');
  });
});

describe('a device that never saw the person at the warehouse', () => {
  it('can show distance and start a shift, but cannot end one', () => {
    expect(decideGeoAction(north(5000), [yard], true, NOW, false)).toMatchObject({ action: 'none', isInside: false });
    expect(decideGeoAction(north(100), [yard], false, NOW, false).action).toBe('in');
  });
});

describe('fixes that cannot be trusted', () => {
  it('ignores a vague fix: it can neither start nor end a shift', () => {
    expect(decide(north(5000, { accuracy: GEO_MAX_ACCURACY_METERS + 1 }), true)).toMatchObject({ action: 'none', ignored: 'inaccurate' });
    expect(decide(north(10, { accuracy: 900 }), false)).toMatchObject({ action: 'none', ignored: 'inaccurate' });
  });
  it('ignores a cached position', () => {
    expect(decide(north(5000, { time: NOW - GEO_MAX_FIX_AGE_MS - 1 }), true)).toMatchObject({ action: 'none', ignored: 'stale' });
  });
  it('accepts a fix with no accuracy or time (the browser sometimes omits them)', () => {
    expect(decide(north(10, { accuracy: undefined, time: undefined }), false).action).toBe('in');
  });
  it('ignores warehouses without usable coordinates or radius, and does nothing when none are left', () => {
    expect(decide(north(10), false, [{ ...yard, latitude: NaN }])).toMatchObject({ action: 'none', ignored: 'no_warehouse' });
    expect(decide(north(10), false, [{ ...yard, radius: 0 }]).ignored).toBe('no_warehouse');
    expect(decide(north(10), false, [])).toMatchObject({ action: 'none', ignored: 'no_warehouse' });
  });
});

describe('fence size', () => {
  it('a fence must be big enough for phone GPS', () => {
    expect(GEO_MIN_RADIUS_METERS).toBeGreaterThanOrEqual(GEO_EXIT_BUFFER_METERS * 2);
  });
});
