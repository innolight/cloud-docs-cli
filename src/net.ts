export const DEFAULT_UA = 'cloud-docs-cli/0.1 (+https://github.com/)';

const HEADERS = { 'User-Agent': DEFAULT_UA };

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.text();
}

export async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.json();
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

export interface RetryOpts {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  shouldRetry?: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOpts): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 2000;
  const sleepFn = opts?.sleep ?? sleep;
  const shouldRetry = opts?.shouldRetry ?? (() => true);

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!shouldRetry(err)) throw err;
      if (attempt < maxAttempts - 1) await sleepFn(baseDelayMs);
    }
  }
  throw lastErr;
}

function isRetryableHttpError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const m = err.message.match(/HTTP (\d+)/);
  if (!m) return true;
  const status = Number(m[1]);
  // 4xx (except 408 Request Timeout, 429 Too Many Requests) are not transient
  return !(status >= 400 && status < 500 && status !== 408 && status !== 429);
}

export async function fetchWithRetry(
  url: string,
  maxAttempts = 2,
  baseDelayMs = 2000
): Promise<string> {
  return withRetry(() => fetchHtml(url), {
    maxAttempts,
    baseDelayMs,
    shouldRetry: isRetryableHttpError,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
