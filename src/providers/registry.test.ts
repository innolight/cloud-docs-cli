import { describe, it, expect } from 'vitest';
import { pickProvider } from './registry.ts';

describe('pickProvider', () => {
  it('returns awsProvider for docs.aws.amazon.com', () => {
    const url = new URL('https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html');
    const p = pickProvider(url);
    expect(p.name).toBe('aws');
  });

  it('throws for an unrecognised hostname', () => {
    const url = new URL('https://example.com/docs/foo');
    expect(() => pickProvider(url)).toThrow('No provider registered for example.com');
  });

  it('throws for cloud.google.com', () => {
    const url = new URL('https://cloud.google.com/compute/docs');
    expect(() => pickProvider(url)).toThrow('No provider registered for cloud.google.com');
  });
});
