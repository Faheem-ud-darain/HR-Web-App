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
