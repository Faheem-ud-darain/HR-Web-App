import { describe, it, expect } from 'vitest';
import { getApprovedLeaveDaysInMonth } from './leaves';
import type { LeaveApplication } from '../hr/types';

const leave = (type: LeaveApplication['type'], start: string, end: string, status = 'approved'): LeaveApplication =>
  ({ id: `${type}${start}${end}`, employeeName: 'Alex', type, duration: '', reason: '', status, startDate: start, endDate: end } as LeaveApplication);

describe('leave days that are charged', () => {
  it('does not charge weekends: Fri 2 Oct – Mon 5 Oct 2026 is two working days', () => {
    expect(getApprovedLeaveDaysInMonth([leave('Urgent', '2026-10-02', '2026-10-05')], 'Alex', 'Urgent', '2026-10')).toBe(2);
  });
  it('Mon–Sun Normal leave is five working days', () => {
    expect(getApprovedLeaveDaysInMonth([leave('Normal', '2026-10-05', '2026-10-11')], 'Alex', 'Normal', '2026-10')).toBe(5);
  });
  it('a day covered by two overlapping requests counts once', () => {
    const l = [leave('Urgent', '2026-10-06', '2026-10-07'), leave('Urgent', '2026-10-07', '2026-10-08')];
    expect(getApprovedLeaveDaysInMonth(l, 'Alex', 'Urgent', '2026-10')).toBe(3);
  });
  it('a day already charged as Urgent is not charged again as Normal', () => {
    const l = [leave('Urgent', '2026-10-06', '2026-10-06'), leave('Normal', '2026-10-06', '2026-10-07')];
    expect(getApprovedLeaveDaysInMonth(l, 'Alex', 'Urgent', '2026-10')).toBe(1);
    expect(getApprovedLeaveDaysInMonth(l, 'Alex', 'Normal', '2026-10')).toBe(1);
  });
  it('pending or rejected leave is never charged', () => {
    expect(getApprovedLeaveDaysInMonth([leave('Urgent', '2026-10-06', '2026-10-07', 'pending')], 'Alex', 'Urgent', '2026-10')).toBe(0);
  });
  it('only counts days inside the month', () => {
    expect(getApprovedLeaveDaysInMonth([leave('Urgent', '2026-09-30', '2026-10-02')], 'Alex', 'Urgent', '2026-10')).toBe(2);
  });
});
