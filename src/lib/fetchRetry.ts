// fetch() that gives a slow or flaky connection a second chance. Only a failed attempt is retried (the request never got an answer: a
// dropped connection or a timeout); an HTTP answer of any status is returned as it is, so a wrong password is never retried.

export function isNetworkFailure(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return err instanceof TypeError || name === 'AbortError' || name === 'TimeoutError';
}

// A signal that aborts after `ms`. AbortSignal.timeout() does not exist on iPhones before iOS 16 or on older Android WebViews, and calling
// it there throws before any request is sent, so use it only where it exists and fall back to a timer-driven AbortController.
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// An AbortController and a timer, not AbortSignal.timeout(): that does not exist on iPhones before iOS 16 or on older Android WebViews,
// and calling it there throws before any request is sent, which would make every attempt fail.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { retries = 1, delayMs = 1500, timeoutMs = 20000 }: { retries?: number; delayMs?: number; timeoutMs?: number } = {},
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (err) {
      lastError = err;
      if (!isNetworkFailure(err) || attempt === retries) break;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
