// fetch() that gives a slow or flaky connection a second chance. Only a failed attempt is retried (the request never got an answer: a
// dropped connection or a timeout); an HTTP answer of any status is returned as it is, so a wrong password is never retried.

export function isNetworkFailure(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return err instanceof TypeError || name === 'AbortError' || name === 'TimeoutError';
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { retries = 1, delayMs = 1500, timeoutMs = 20000 }: { retries?: number; delayMs?: number; timeoutMs?: number } = {},
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      lastError = err;
      if (!isNetworkFailure(err) || attempt === retries) break;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
