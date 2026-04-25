import { describe, it, expect, vi } from 'vitest';
import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { azureProvider } from './azure.ts';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function fixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), 'utf8');
}

// ─── matches ─────────────────────────────────────────────────────────────────

describe('azureProvider.matches', () => {
  it('matches learn.microsoft.com', () => {
    expect(
      azureProvider.matches(new URL('https://learn.microsoft.com/en-us/azure/aks/intro'))
    ).toBe(true);
  });

  it('does not match other domains', () => {
    expect(azureProvider.matches(new URL('https://docs.aws.amazon.com/foo'))).toBe(false);
    expect(azureProvider.matches(new URL('https://microsoft.com/foo'))).toBe(false);
  });
});

// ─── startHref ───────────────────────────────────────────────────────────────

describe('azureProvider.startHref', () => {
  it('extracts the last path segment', () => {
    const url = new URL('https://learn.microsoft.com/en-us/azure/aks/concepts-network');
    expect(azureProvider.startHref(url)).toBe('concepts-network');
  });

  it('returns empty string for trailing-slash URL', () => {
    const url = new URL('https://learn.microsoft.com/en-us/azure/aks/');
    expect(azureProvider.startHref(url)).toBe('');
  });
});

// ─── guideDir ────────────────────────────────────────────────────────────────

describe('azureProvider.guideDir', () => {
  it('returns locale/service/guide', () => {
    const url = new URL('https://learn.microsoft.com/en-us/azure/aks/concepts-network');
    expect(azureProvider.guideDir(url)).toBe('en-us/azure/aks');
  });

  it('works for cross-service paths', () => {
    const url = new URL('https://learn.microsoft.com/en-us/azure/well-architected/overview');
    expect(azureProvider.guideDir(url)).toBe('en-us/azure/well-architected');
  });
});

// ─── discoverTocUrls ─────────────────────────────────────────────────────────

describe('azureProvider.discoverTocUrls', () => {
  const url = new URL('https://learn.microsoft.com/en-us/azure/aks/concepts-network');

  it('resolves toc_rel meta tag relative to page URL', async () => {
    const html = `<html><head><meta name="toc_rel" content="toc.json"></head></html>`;
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await azureProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual(['https://learn.microsoft.com/en-us/azure/aks/toc.json']);
    expect(fetchText).toHaveBeenCalledWith(url.href);
  });

  it('handles reversed attribute order (content before name)', async () => {
    const html = `<html><head><meta content="toc.json" name="toc_rel"></head></html>`;
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await azureProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual(['https://learn.microsoft.com/en-us/azure/aks/toc.json']);
  });

  it('resolves a relative parent path correctly', async () => {
    const html = `<html><head><meta name="toc_rel" content="../toc.json"></head></html>`;
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await azureProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual(['https://learn.microsoft.com/en-us/azure/toc.json']);
  });

  it('falls back to guide-root toc.json when no meta tag present', async () => {
    const fetchText = vi.fn().mockResolvedValue('<html></html>');
    const urls = await azureProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual(['https://learn.microsoft.com/en-us/azure/aks/toc.json']);
  });

  it('detects toc_rel from real aks-page fixture', async () => {
    const html = fixture('aks-page.html');
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await azureProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual(['https://learn.microsoft.com/en-us/azure/aks/toc.json']);
  });
});

// ─── parseToc ────────────────────────────────────────────────────────────────

describe('azureProvider.parseToc', () => {
  it('parses items with toc_title and children', () => {
    const raw = JSON.stringify({
      items: [
        {
          toc_title: 'Overview',
          href: 'intro',
          children: [{ toc_title: 'Networking', href: 'concepts-network', children: [] }],
        },
      ],
    });
    const nodes = azureProvider.parseToc(raw);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({
      title: 'Overview',
      href: 'intro',
      children: [{ title: 'Networking', href: 'concepts-network', children: [] }],
    });
  });

  it('strips query parameters from hrefs', () => {
    const raw = JSON.stringify({
      items: [
        { toc_title: 'Concepts', href: 'concepts-network?pivots=azure-portal', children: [] },
      ],
    });
    const nodes = azureProvider.parseToc(raw);
    expect(nodes[0]!.href).toBe('concepts-network');
  });

  it('uses null href when entry has no href field', () => {
    const raw = JSON.stringify({ items: [{ toc_title: 'Section', children: [] }] });
    const nodes = azureProvider.parseToc(raw);
    expect(nodes[0]!.href).toBeNull();
  });

  it('skips entries without toc_title and writes to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const raw = JSON.stringify({
      items: [{ href: 'orphan' }, { toc_title: 'Valid', href: 'valid', children: [] }],
    });
    const nodes = azureProvider.parseToc(raw);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe('Valid');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[azure] skipping malformed'));
    stderrSpy.mockRestore();
  });

  it('returns empty array for invalid JSON string', () => {
    expect(azureProvider.parseToc('not-json')).toEqual([]);
    expect(azureProvider.parseToc('')).toEqual([]);
  });

  it('returns empty array when items is not an array', () => {
    expect(azureProvider.parseToc(JSON.stringify({ items: null }))).toEqual([]);
    expect(azureProvider.parseToc(JSON.stringify({}))).toEqual([]);
  });

  it('handles entry with children: null as empty children', () => {
    const raw = JSON.stringify({ items: [{ toc_title: 'Leaf', href: 'leaf', children: null }] });
    const nodes = azureProvider.parseToc(raw);
    expect(nodes[0]!.children).toEqual([]);
  });

  it('parses the real aks-toc fixture correctly', () => {
    const nodes = azureProvider.parseToc(fixture('aks-toc.json'));
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.title).toBe('Overview');
    expect(nodes[0]!.children).toHaveLength(2);
    // Query params stripped
    expect(nodes[0]!.children[0]!.href).toBe('concepts-network');
    // Section node without href
    expect(nodes[1]!.href).toBeNull();
    expect(nodes[1]!.title).toBe('Tutorials');
  });
});

// ─── preprocessHtml ──────────────────────────────────────────────────────────

function preprocess(bodyHtml: string): string {
  const html = `<html><body><main id="main">${bodyHtml}</main></body></html>`;
  const $ = cheerio.load(html);
  const $main = $('main#main');
  azureProvider.preprocessHtml!($, $main);
  return ($main.html() ?? '').replace(/>\s+</g, '><').trim();
}

describe('azureProvider.preprocessHtml — alert transformation', () => {
  it('transforms NOTE div into blockquote with type prefix', () => {
    const out = preprocess(`<div class="NOTE"><p>Note</p><p>This is important.</p></div>`);
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<strong>NOTE:</strong>');
    expect(out).toContain('This is important.');
    expect(out).not.toContain('<div class="NOTE"');
  });

  it('removes the decorative label paragraph', () => {
    const out = preprocess(`<div class="TIP"><p>Tip</p><p>Use this approach.</p></div>`);
    expect(out).not.toMatch(/<p>Tip<\/p>/);
    expect(out).toContain('<strong>TIP:</strong>');
  });

  it('handles all alert types', () => {
    for (const type of ['NOTE', 'TIP', 'IMPORTANT', 'CAUTION', 'WARNING']) {
      const out = preprocess(
        `<div class="${type}"><p>${type.charAt(0) + type.slice(1).toLowerCase()}</p><p>content</p></div>`
      );
      expect(out).toContain(`<strong>${type}:</strong>`);
    }
  });

  it('handles alert with no remaining children gracefully', () => {
    // Only the decorative label, nothing else
    expect(() => preprocess(`<div class="NOTE"><p>Note</p></div>`)).not.toThrow();
  });
});

describe('azureProvider.preprocessHtml — tab flattening', () => {
  it('flattens role-based tabs into h4 + panels', () => {
    const out = preprocess(`
      <div class="tabs-container">
        <ul role="tablist">
          <li role="tab">Azure CLI</li>
          <li role="tab">Portal</li>
        </ul>
        <div role="tabpanel"><p>CLI content</p></div>
        <div role="tabpanel"><p>Portal content</p></div>
      </div>`);
    expect(out).toContain('<h4>Azure CLI</h4>');
    expect(out).toContain('<h4>Portal</h4>');
    expect(out).toContain('CLI content');
    expect(out).toContain('Portal content');
    expect(out).not.toContain('role="tablist"');
  });

  it('flattens role-based tabs in the real aks-page fixture', () => {
    const html = fixture('aks-page.html');
    const $ = cheerio.load(html);
    const $main = $('main#main');
    azureProvider.preprocessHtml!($, $main);
    const out = $main.html() ?? '';

    expect(out).not.toContain('role="tablist"');
    expect(out).toContain('<h4>Azure CLI</h4>');
    expect(out).toContain('<h4>Portal</h4>');
    expect(out).toContain('az aks create --name myCluster');
    expect(out).toContain('Use the Azure Portal to create your cluster.');
  });

  it('transforms NOTE and TIP alerts in the real aks-page fixture', () => {
    const html = fixture('aks-page.html');
    const $ = cheerio.load(html);
    const $main = $('main#main');
    azureProvider.preprocessHtml!($, $main);
    const out = $main.html() ?? '';

    expect(out).not.toContain('class="NOTE"');
    expect(out).not.toContain('class="TIP"');
    expect(out).toContain('<strong>NOTE:</strong>');
    expect(out).toContain('This feature requires Kubernetes 1.20 or later.');
    expect(out).toContain('<strong>TIP:</strong>');
    expect(out).toContain('Use Azure CNI for production workloads.');
    // decorative label paragraphs removed
    expect(out).not.toMatch(/<p>\s*Note\s*<\/p>/);
    expect(out).not.toMatch(/<p>\s*Tip\s*<\/p>/);
  });
});
