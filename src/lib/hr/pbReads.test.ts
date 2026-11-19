import { describe, it, expect, vi, beforeEach } from 'vitest';

const getFullList = vi.fn();
vi.mock('../pocketbase', () => ({ pb: { collection: () => ({ getFullList }) } }));
const { pbList, pbListStrict } = await import('./shared');

beforeEach(() => { getFullList.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('pbList vs pbListStrict', () => {
  it('both return the rows when the read works', async () => {
    getFullList.mockResolvedValue([{ id: 'a' }]);
    expect(await pbList('hr_x')).toEqual([{ id: 'a' }]);
    expect(await pbListStrict('hr_x')).toEqual([{ id: 'a' }]);
  });
  it('pbList turns a failed read into "no rows" (fine for a screen)', async () => {
    getFullList.mockRejectedValue(new Error('network'));
    expect(await pbList('hr_x')).toEqual([]);
  });
  it('pbListStrict lets a failed read surface, so "no rows" can be trusted as a fact', async () => {
    getFullList.mockRejectedValue(new Error('network'));
    await expect(pbListStrict('hr_x')).rejects.toThrow('network');
  });
});

describe('the absence sweep reads', () => {
  it('fetchTimesheetsStrict and fetchLeavesStrict let a failed read surface instead of returning an empty list', async () => {
    const { fetchTimesheetsStrict } = await import('./timesheets');
    const { fetchLeavesStrict } = await import('./leaves');
    getFullList.mockRejectedValue(new Error('network'));
    await expect(fetchTimesheetsStrict({ days: 10 })).rejects.toThrow('network');
    await expect(fetchLeavesStrict()).rejects.toThrow('network');
  });
});

describe('pbFindByFieldStrict', () => {
  it('returns null only for "no such row" and throws on every other failure', async () => {
    const { pbFindByFieldStrict } = await import('./shared');
    const getFirstListItem = vi.fn();
    const pbm = await import('../pocketbase');
    (pbm.pb as unknown as { collection: () => unknown }).collection = () => ({ getFirstListItem });
    getFirstListItem.mockRejectedValueOnce({ status: 404 });
    expect(await pbFindByFieldStrict('hr_x', 'email', 'a@b.us')).toBeNull();
    getFirstListItem.mockRejectedValueOnce(new Error('network'));
    await expect(pbFindByFieldStrict('hr_x', 'email', 'a@b.us')).rejects.toThrow('network');
    getFirstListItem.mockResolvedValueOnce({ id: 'r1' });
    expect(await pbFindByFieldStrict('hr_x', 'email', 'a@b.us')).toEqual({ id: 'r1' });
  });
});
