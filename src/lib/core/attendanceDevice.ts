// Which device is allowed to mark a USA employee's attendance (their phone). One device owns it at a time; a second phone is told it is not
// the one, until the owner has been silent for CLAIM_FRESH_MS or the person chooses "Use this device". Pure, so the rule is tested.
export const CLAIM_FRESH_MS = 3 * 60 * 1000; // the owner refreshes its claim about every minute

export interface DeviceClaim { deviceId: string; label: string; at: string }
export interface ClaimDecision { owner: boolean; claim: DeviceClaim; ownerLabel: string }

export function decideClaim(existing: DeviceClaim | null | undefined, me: { deviceId: string; label: string }, now: number, force = false): ClaimDecision {
  const other = existing && existing.deviceId !== me.deviceId && now - new Date(existing.at).getTime() < CLAIM_FRESH_MS ? existing : null;
  if (other && !force) return { owner: false, claim: existing as DeviceClaim, ownerLabel: other.label };
  return { owner: true, claim: { deviceId: me.deviceId, label: me.label, at: new Date(now).toISOString() }, ownerLabel: me.label };
}
