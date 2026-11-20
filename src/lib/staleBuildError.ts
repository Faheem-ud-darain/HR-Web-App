// A tab left open across a new release asks for script files that no longer exist (the server answers
// with an HTML "not found" page). Re-rendering can never fix that; only loading the page again can.
const STALE_BUILD_PATTERNS = [
  /loading chunk [\w-]+ failed/i,
  /loading css chunk/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unexpected token '?<'?/i,
  /failed to load script/i,
];

export function isStaleBuildError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  return typeof message === 'string' && STALE_BUILD_PATTERNS.some(p => p.test(message));
}
