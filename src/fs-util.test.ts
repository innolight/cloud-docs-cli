import { describe, it, expect } from 'vitest';
import { sanitize } from './fs-util.ts';

describe('sanitize', () => {
  it('replaces spaces with dashes', () => {
    expect(sanitize('Hello World', 'fb')).toBe('Hello-World');
  });

  it('collapses multiple spaces to a single dash', () => {
    expect(sanitize('Hello   World', 'fb')).toBe('Hello-World');
  });

  it('removes illegal chars: colon comma question slash backslash angle-bracket pipe star', () => {
    expect(sanitize('a:b,c?d/e\\f<g>h"i|j*k', 'fb')).toBe('abcdefghijk');
  });

  it('strips trailing dots and dashes', () => {
    expect(sanitize('Overview.', 'fb')).toBe('Overview');
    expect(sanitize('Overview-', 'fb')).toBe('Overview');
    expect(sanitize('Overview...', 'fb')).toBe('Overview');
  });

  it('strips trailing spaces after collapsing', () => {
    expect(sanitize('Title ', 'fb')).toBe('Title');
  });

  it('truncates to 180 chars', () => {
    const long = 'a'.repeat(200);
    expect(sanitize(long, 'fb')).toHaveLength(180);
  });

  it('does not produce a result longer than 180 chars', () => {
    const long = 'a'.repeat(200);
    const result = sanitize(long, 'fb');
    expect(result.length).toBeLessThanOrEqual(180);
  });

  it('returns fallback when result would be empty', () => {
    expect(sanitize('', 'fallback')).toBe('fallback');
  });

  it('returns fallback when all chars are illegal', () => {
    expect(sanitize(':/\\?<>', 'safe')).toBe('safe');
  });

  it('returns fallback when only trailing chars remain', () => {
    expect(sanitize('...', 'safe')).toBe('safe');
  });

  it('preserves unicode letters', () => {
    expect(sanitize('Überblick', 'fb')).toBe('Überblick');
  });

  it('removes NUL and control chars', () => {
    expect(sanitize('a\x00b\x1fc', 'fb')).toBe('abc');
  });
});
