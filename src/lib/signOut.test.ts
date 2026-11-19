import { describe, expect, it, vi } from 'vitest';
import { signOutSafely } from './signOut';

describe('signOutSafely', () => {
  it('clears the session and leaves even when every server cleanup fails', async () => {
    const clear = vi.fn(); const leave = vi.fn();
    await signOutSafely({ cleanup: [() => Promise.reject(new Error('offline')), () => Promise.reject(new Error('offline'))], clear, leave });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('does not wait forever for a cleanup that hangs', async () => {
    const clear = vi.fn(); const leave = vi.fn();
    const started = Date.now();
    await signOutSafely({ cleanup: [() => new Promise(() => {})], clear, leave, timeoutMs: 30 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(clear).toHaveBeenCalled();
    expect(leave).toHaveBeenCalled();
  });

  it('runs the cleanup before clearing, so the cleanup can still read the session', async () => {
    const order: string[] = [];
    await signOutSafely({ cleanup: [async () => { order.push('cleanup'); }], clear: () => order.push('clear'), leave: () => order.push('leave') });
    expect(order).toEqual(['cleanup', 'clear', 'leave']);
  });
});
