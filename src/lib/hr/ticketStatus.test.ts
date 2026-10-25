// A ticket close/reopen used to overwrite the stored replies with the copy the screen had loaded, so a
// reply posted while the confirmation was open was lost for good. It must append to what is stored NOW.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let stored: { replies: unknown[]; status: string };
const { getOneMock, pbUpdateMock } = vi.hoisted(() => ({
  getOneMock: vi.fn(),
  pbUpdateMock: vi.fn(),
}));

vi.mock('../pocketbase', () => ({ pb: { collection: () => ({ getOne: getOneMock }) } }));
vi.mock('../hrData', () => ({ hrActions: { addNotification: vi.fn(async () => {}) }, buildNotificationLink: () => '' }));
vi.mock('./shared', () => ({
  pbList: vi.fn(async () => []), pbCreate: vi.fn(), pbUpdate: pbUpdateMock, pbUpsertByField: vi.fn(), pbFindByField: vi.fn(),
  pbDeleteByField: vi.fn(), pbGetKV: vi.fn(), pbSetKV: vi.fn(), pbListByEmailField: vi.fn(async () => []), withTimeout: vi.fn(),
}));
vi.mock('./activity', () => ({ touchActivity: vi.fn(async () => {}), ticketEventScopes: () => [] }));

import { ticketActions } from './tickets';
import type { Ticket } from './types';

beforeEach(() => {
  getOneMock.mockReset(); pbUpdateMock.mockReset();
  getOneMock.mockImplementation(async () => ({ ...stored }));
  pbUpdateMock.mockImplementation(async (_c: string, _id: string, fields: Record<string, unknown>) => { stored = { ...stored, ...fields } as typeof stored; });
  stored = { status: 'open', replies: [{ id: 'r1', message: 'first' }] };
});

const staleTicket = { id: 't1', title: 'Help', employeeEmail: 'e@x.us', employeeName: 'E', department: 'hr', status: 'open', replies: [{ id: 'r1', message: 'first' }] } as unknown as Ticket;

describe('updateTicketStatus', () => {
  it('keeps a reply that arrived after the screen loaded the ticket', async () => {
    stored.replies = [{ id: 'r1', message: 'first' }, { id: 'r2', message: 'posted while the confirm dialog was open' }];
    await ticketActions.updateTicketStatus(staleTicket, 'closed', { name: 'HR', role: 'hr', email: 'hr@x.us' });
    const ids = (stored.replies as { id: string }[]).map(r => r.id);
    expect(ids.slice(0, 2)).toEqual(['r1', 'r2']);
    expect(ids).toHaveLength(3);
    expect((stored.replies[2] as { event?: string }).event).toBe('closed');
    expect(stored.status).toBe('closed');
  });
  it('writes only the status when there is no actor to record', async () => {
    await ticketActions.updateTicketStatus(staleTicket, 'closed');
    expect(pbUpdateMock).toHaveBeenCalledWith('hr_tickets', 't1', { status: 'closed' });
    expect(getOneMock).not.toHaveBeenCalled();
  });
});
