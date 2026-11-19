// Lets only one run of an async action happen at a time: a call that arrives while one is in progress is skipped (resolves to undefined),
// not queued. For actions that must never overlap, such as a geofence check-in decided from two location updates that arrive together.
export function singleFlight() {
  let busy = false;
  return async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (busy) return undefined;
    busy = true;
    try {
      return await action();
    } finally {
      busy = false;
    }
  };
}
