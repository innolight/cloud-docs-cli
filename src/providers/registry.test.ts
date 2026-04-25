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

  it('returns gcpProvider for cloud.google.com', () => {
    const url = new URL('https://cloud.google.com/compute/docs');
    const p = pickProvider(url);
    expect(p.name).toBe('gcp');
  });

  it('returns gcpProvider for docs.cloud.google.com', () => {
    const url = new URL('https://docs.cloud.google.com/storage/docs/listing-buckets');
    const p = pickProvider(url);
    expect(p.name).toBe('gcp');
  });
});
