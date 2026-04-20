export const DEFAULT_UA = "cloud-docs-cli/0.1 (+https://github.com/)";

const HEADERS = { "User-Agent": DEFAULT_UA };

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

export async function fetchWithRetry(url: string, maxAttempts = 2, baseDelayMs = 2000): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fetchHtml(url);
    } catch (err) {
      lastErr = err;
      if (err instanceof Error) {
        const m = err.message.match(/HTTP (\d+)/);
        if (m) {
          const status = Number(m[1]);
          // 4xx (except 408 Request Timeout, 429 Too Many Requests) are not transient
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) throw err;
        }
      }
      if (attempt < maxAttempts - 1) await sleep(baseDelayMs);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
