// Signing out must always work, on any connection. The server-side cleanup (ending a browser shift, freeing the device slot, unlinking push
// notifications) is attempted but never allowed to block: it runs together, with a time limit, and the local session is cleared afterwards
// whatever happened. Before this, a failed or hanging request left the person signed in (on a shared PC, the next person inherited it).
export async function signOutSafely({ cleanup, clear, leave, timeoutMs = 5000 }: {
  cleanup: Array<() => Promise<unknown>>;
  clear: () => void;
  leave: () => void;
  timeoutMs?: number;
}): Promise<void> {
  try {
    await Promise.race([
      Promise.allSettled(cleanup.map(run => run())),
      new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  } finally {
    clear();
    leave();
  }
}
