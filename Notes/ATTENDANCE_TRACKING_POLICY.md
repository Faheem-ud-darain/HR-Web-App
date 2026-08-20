# Attendance: Auto GeoFencing vs. Manual Shift — Policy & Collision Check

Written after an explicit request to (1) verify Auto GeoFencing and Manual Shift don't collide, and (2) document who each mode is for. Read this before touching `employee/page.tsx`'s shift logic, `hrData.ts`'s `clockIn`/`clockOut`/stale-shift functions, or `src/lib/geofence.ts` / `backgroundGeolocation.ts`.

## Policy (intended)

- **Auto GeoFencing (GPS-based automatic clock-in/out) — USA employees only, and tied to screen Tracking.** The employee's shift starts and stops automatically as their device crosses the radius of an assigned warehouse. Requires "Always" location permission (see `ios/App/App/Info.plist`) so it keeps working while the app is backgrounded/locked.
- **Manual Start/End Shift buttons — primarily for Remote/Pakistan employees**, who have no warehouse geofence to trigger off of. **Should also be usable by USA employees** — as a fallback for when GPS/background-location isn't working (permission revoked, device killed the app, no signal, dead battery, etc.), not as their everyday method. Auto GeoFencing stays the default/expected path for USA staff; manual is the safety valve, not a replacement.

## Collision check — result: no data-integrity collision found

Checked whether the two modes could fight each other and produce a double-booked or stuck shift:

- **`hrActions.clockIn()` and `clockOut()` (`hrData.ts`) are both idempotent against the real backend state.** `clockIn()` calls `getOpenShift()` first and returns the existing open shift instead of creating a second one; `clockOut()` does the same and no-ops (`return null`) if there's nothing open. This holds regardless of which code path (geofence effect vs. manual button vs. a second logged-in device — up to `MAX_USER_SESSION_DEVICES` = 2 are allowed) triggered the call, so a race between two triggers can't create a duplicate/orphaned timesheet row.
- **Client-side shift state (`shiftActive` / `shiftActiveRef`) is correctly re-hydrated from a real `getOpenShift()` lookup on every dashboard mount** (`employee/page.tsx` ~line 188), not assumed `false` — so a shift left open from a previous session/device is picked up accurately before the geofence effect or manual buttons act on it again.
- The geofence effect (`employee/page.tsx` ~line 433) is hard-gated on `userProfile.region === 'USA'`, and the manual Start/End Shift UI is currently only rendered for the *non*-USA branch — so today, the two triggers are not just logically idempotent, they're not even reachable from the same account at the same time.

**No bug found in the shift-toggling logic itself.**

## Known gap (not fixed yet — flagging per explicit instruction, not silently changing behavior)

The policy above says manual should also work for USA employees as a fallback. **That is not currently true in the code:**

- `employee/page.tsx` ~line 650: `userProfile?.region === 'USA' ? (` renders the fully-automatic geofence view only — the comment there says explicitly *"USA employees: fully automatic, no manual control — the UI intentionally doesn't render a Start/End Shift button for them."* There is currently no code path for a USA-region employee to manually clock in/out.
- This is compounded by `hrData.ts`'s stale-shift safety nets — `closeStaleManualShiftIfAbandoned` and the roster-wide `runAbsenceCheck` — which **explicitly exclude USA staff** (~line 3273: *"USA staff excluded — they clock in/out automatically via GPS geofence, so a gap there means a device/GPS issue, not a no-show"*). So today, if a USA employee's GPS/background-location silently fails mid-shift (permission revoked, OS killed the background task, dead battery), there is neither a manual fallback nor an automatic safety net to close that shift — it can be left open indefinitely until someone at HR/Admin manually intervenes.

**TODO before this policy is fully true:** add a manual Start/End Shift fallback control to the USA-region branch of `employee/page.tsx` (visually distinct from the Pakistan/remote manual UI, e.g. "Use manual check-in if GPS isn't working" rather than a primary control), and decide whether the stale-shift safety nets should stop excluding USA staff once that fallback exists. Do not add this without confirming the UX/copy with the user first — the current auto-only design for USA was a deliberate choice (see `employee/page.tsx` comment above), not an oversight.
