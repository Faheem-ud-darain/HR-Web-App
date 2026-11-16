import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const credit = createRequire(import.meta.url)("../../pb_hooks/shift_credit.js");
const T = (m: number) => new Date(Date.UTC(2026, 10, 12, 18, m, 0)).toISOString();

describe("resumeCredit (restart after an automatic end)", () => {
  const base = { status: "completed", clockOut: T(0), endedAt: T(35), newClockIn: T(40), now: Date.parse(T(41)) };
  it("counts the gap up to the restart", () => {
    expect(credit.resumeCredit(base)).toEqual({ clockOut: T(40), creditedMs: 40 * 60000 });
  });
  it("ignores shifts that were not closed by the server", () => {
    expect(credit.resumeCredit({ ...base, status: "active" })).toBeNull();
    expect(credit.resumeCredit({ ...base, endedAt: T(1) })).toBeNull(); // clocked out by the person: a break is not credited
  });
  it("ignores a gap longer than 45 minutes", () => {
    expect(credit.resumeCredit({ ...base, newClockIn: T(50) })).toBeNull();
  });
  it("ignores a restart more than 10 minutes after the automatic end", () => {
    expect(credit.resumeCredit({ ...base, now: Date.parse(T(50)) })).toBeNull();
  });
  it("ignores a restart before the end and unreadable dates", () => {
    expect(credit.resumeCredit({ ...base, newClockIn: T(-5) })).toBeNull();
    expect(credit.resumeCredit({ ...base, clockOut: "" })).toBeNull();
  });
  it("reads PocketBase style dates", () => {
    expect(credit.parseMs("2026-11-12 18:45:00.000Z")).toBe(Date.parse("2026-11-12T18:45:00.000Z"));
  });
});

describe("proofCredit (late screenshots)", () => {
  const base = { status: "completed", clockIn: T(-120), clockOut: T(0), endedAt: T(40), capturedAt: T(15) };
  it("extends to a screenshot taken just after the end", () => {
    expect(credit.proofCredit(base)).toEqual({ clockOut: T(15) });
  });
  it("ignores screenshots before the end, too far after it, or for other shift states", () => {
    expect(credit.proofCredit({ ...base, capturedAt: T(-5) })).toBeNull();
    expect(credit.proofCredit({ ...base, capturedAt: T(21) })).toBeNull();
    expect(credit.proofCredit({ ...base, status: "active" })).toBeNull();
    expect(credit.proofCredit({ ...base, endedAt: T(1) })).toBeNull(); // the person clocked out themselves
  });
  it("never makes a shift longer than 12 hours", () => {
    expect(credit.proofCredit({ ...base, clockIn: T(-12 * 60 + 5) })).toBeNull();
  });
});

describe("formatDuration", () => {
  it("writes hours and minutes", () => {
    expect(credit.formatDuration(T(0), T(95))).toBe("1h 35m");
  });
});
