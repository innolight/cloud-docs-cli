import { describe, it, expect, vi } from 'vitest';
import { withRetry, fetchWithRetry } from './net.ts';

const noSleep = () => Promise.resolve();

describe('withRetry', () => {
  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { sleep: noSleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure and returns on second attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 500 Internal Server Error'))
      .mockResolvedValue('ok');
    const slept: number[] = [];
    const result = await withRetry(fn, {
      maxAttempts: 2,
      baseDelayMs: 100,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(slept).toEqual([100]);
  });

  it('throws immediately on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 404 Not Found'));
    const shouldRetry = (err: unknown) => {
      if (!(err instanceof Error)) return true;
      const m = err.message.match(/HTTP (\d+)/);
      if (!m) return true;
      const status = Number(m[1]);
      return !(status >= 400 && status < 500 && status !== 408 && status !== 429);
    };
    await expect(withRetry(fn, { sleep: noSleep, shouldRetry })).rejects.toThrow('HTTP 404');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries 408 and 429 (non-permanent 4xx)', async () => {
    const fn408 = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 408 Request Timeout'))
      .mockResolvedValue('ok');
    const fn429 = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
      .mockResolvedValue('ok');

    const shouldRetry = (err: unknown) => {
      if (!(err instanceof Error)) return true;
      const m = err.message.match(/HTTP (\d+)/);
      if (!m) return true;
      const status = Number(m[1]);
      return !(status >= 400 && status < 500 && status !== 408 && status !== 429);
    };

    await expect(withRetry(fn408, { sleep: noSleep, shouldRetry })).resolves.toBe('ok');
    await expect(withRetry(fn429, { sleep: noSleep, shouldRetry })).resolves.toBe('ok');
  });

  it('throws last error after exhausting maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 503 Service Unavailable'));
    await expect(withRetry(fn, { maxAttempts: 3, sleep: noSleep })).rejects.toThrow('HTTP 503');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not sleep after last failed attempt', async () => {
    const slept: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await withRetry(fn, {
      maxAttempts: 2,
      baseDelayMs: 999,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    }).catch(() => {});
    // 2 attempts → 1 sleep (between attempt 0 and attempt 1), not after the last
    expect(slept).toHaveLength(1);
  });

  it('retries non-Error throws by default', async () => {
    const fn = vi.fn().mockRejectedValueOnce('string error').mockResolvedValue('ok');
    const result = await withRetry(fn, { sleep: noSleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('fetchWithRetry', () => {
  it('calls fetch and returns body on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html>content</html>'),
      })
    );
    const html = await fetchWithRetry('https://example.com', 1, 0);
    expect(html).toBe('<html>content</html>');
    vi.unstubAllGlobals();
  });

  it('throws on non-retryable 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })
    );
    await expect(fetchWithRetry('https://example.com', 2, 0)).rejects.toThrow('HTTP 403');
    vi.unstubAllGlobals();
  });
});
