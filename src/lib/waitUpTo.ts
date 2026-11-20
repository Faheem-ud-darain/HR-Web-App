// Waits for a set of best-effort jobs to finish, but never longer than `ms`. The jobs are not cancelled: they carry on in the background and
// their failures are ignored. For follow-up work after something important has already been saved (cleaning up a heartbeat, telling the tracker
// to stop): the person must not be kept waiting on a slow connection for housekeeping that does not change the outcome.
export async function waitUpTo(jobs: Array<Promise<unknown>>, ms: number): Promise<void> {
  const all = Promise.allSettled(jobs);
  await Promise.race([all, new Promise<void>(resolve => setTimeout(resolve, ms))]);
}
