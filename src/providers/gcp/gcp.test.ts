import { describe, it, expect, vi } from 'vitest';
import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gcpProvider } from './gcp.ts';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function fixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), 'utf8');
}

// ─── matches ─────────────────────────────────────────────────────────────────

describe('gcpProvider.matches', () => {
  it('matches docs.cloud.google.com', () => {
    expect(
      gcpProvider.matches(new URL('https://docs.cloud.google.com/storage/docs/listing-buckets'))
    ).toBe(true);
  });

  it('matches cloud.google.com (redirects to docs subdomain in practice)', () => {
    expect(
      gcpProvider.matches(new URL('https://cloud.google.com/storage/docs/listing-buckets'))
    ).toBe(true);
  });

  it('does not match other domains', () => {
    expect(gcpProvider.matches(new URL('https://docs.aws.amazon.com/foo'))).toBe(false);
    expect(gcpProvider.matches(new URL('https://learn.microsoft.com/foo'))).toBe(false);
    expect(gcpProvider.matches(new URL('https://google.com/foo'))).toBe(false);
  });
});

// ─── startHref ───────────────────────────────────────────────────────────────

describe('gcpProvider.startHref', () => {
  it('returns the full pathname (root-relative, matches nav hrefs)', () => {
    const url = new URL('https://docs.cloud.google.com/storage/docs/listing-buckets');
    expect(gcpProvider.startHref(url)).toBe('/storage/docs/listing-buckets');
  });

  it('returns pathname with trailing slash', () => {
    const url = new URL('https://docs.cloud.google.com/storage/docs/');
    expect(gcpProvider.startHref(url)).toBe('/storage/docs/');
  });
});

// ─── guideDir ────────────────────────────────────────────────────────────────

describe('gcpProvider.guideDir', () => {
  it('returns first two path segments', () => {
    const url = new URL('https://docs.cloud.google.com/storage/docs/listing-buckets');
    expect(gcpProvider.guideDir(url)).toBe('storage/docs');
  });

  it('works for other products', () => {
    const url = new URL(
      'https://docs.cloud.google.com/compute/docs/instances/create-start-instance'
    );
    expect(gcpProvider.guideDir(url)).toBe('compute/docs');
  });
});

// ─── discoverTocUrls ─────────────────────────────────────────────────────────

describe('gcpProvider.discoverTocUrls', () => {
  it('returns the page URL itself (TOC is embedded in the page HTML)', async () => {
    const url = new URL('https://docs.cloud.google.com/storage/docs/listing-buckets');
    const fetchText = vi.fn();
    const urls = await gcpProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual([url.href]);
    expect(fetchText).not.toHaveBeenCalled();
  });
});

// ─── parseToc ────────────────────────────────────────────────────────────────

describe('gcpProvider.parseToc', () => {
  it('returns empty array when no book nav list is found', () => {
    expect(gcpProvider.parseToc('<html></html>')).toEqual([]);
  });

  it('parses a leaf node with href', () => {
    const html = `<ul class="devsite-nav-list" menu="_book">
      <li class="devsite-nav-item"><a href="/storage/docs/introduction" class="devsite-nav-title"><span class="devsite-nav-text">Product overview</span></a></li>
    </ul>`;
    const nodes = gcpProvider.parseToc(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({
      title: 'Product overview',
      href: '/storage/docs/introduction',
      children: [],
    });
  });

  it('parses a section heading with no following siblings as empty children', () => {
    const html = `<ul class="devsite-nav-list" menu="_book">
      <li class="devsite-nav-item devsite-nav-heading"><div class="devsite-nav-title devsite-nav-title-no-path"><span class="devsite-nav-text">Discover</span></div></li>
    </ul>`;
    const nodes = gcpProvider.parseToc(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({ title: 'Discover', href: null, children: [] });
  });

  it('groups items following a section heading as its children', () => {
    const html = `<ul class="devsite-nav-list" menu="_book">
      <li class="devsite-nav-item devsite-nav-heading"><div class="devsite-nav-title devsite-nav-title-no-path"><span class="devsite-nav-text">Monitor</span></div></li>
      <li class="devsite-nav-item"><a href="/storage/docs/monitor-data" class="devsite-nav-title"><span class="devsite-nav-text">Monitor data and usage</span></a></li>
      <li class="devsite-nav-item"><a href="/storage/docs/pubsub" class="devsite-nav-title"><span class="devsite-nav-text">Pub/Sub notifications</span></a></li>
    </ul>`;
    const nodes = gcpProvider.parseToc(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe('Monitor');
    expect(nodes[0]!.href).toBeNull();
    expect(nodes[0]!.children).toHaveLength(2);
    expect(nodes[0]!.children[0]!.title).toBe('Monitor data and usage');
    expect(nodes[0]!.children[0]!.href).toBe('/storage/docs/monitor-data');
    expect(nodes[0]!.children[1]!.title).toBe('Pub/Sub notifications');
  });

  it('groups items under each section heading separately when multiple headings exist', () => {
    const html = `<ul class="devsite-nav-list" menu="_book">
      <li class="devsite-nav-item devsite-nav-heading"><div class="devsite-nav-title devsite-nav-title-no-path"><span class="devsite-nav-text">Discover</span></div></li>
      <li class="devsite-nav-item"><a href="/storage/docs/introduction" class="devsite-nav-title"><span class="devsite-nav-text">Product overview</span></a></li>
      <li class="devsite-nav-item devsite-nav-heading"><div class="devsite-nav-title devsite-nav-title-no-path"><span class="devsite-nav-text">Monitor</span></div></li>
      <li class="devsite-nav-item"><a href="/storage/docs/monitor-data" class="devsite-nav-title"><span class="devsite-nav-text">Monitor data and usage</span></a></li>
    </ul>`;
    const nodes = gcpProvider.parseToc(html);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.title).toBe('Discover');
    expect(nodes[0]!.children).toHaveLength(1);
    expect(nodes[0]!.children[0]!.title).toBe('Product overview');
    expect(nodes[1]!.title).toBe('Monitor');
    expect(nodes[1]!.children).toHaveLength(1);
    expect(nodes[1]!.children[0]!.title).toBe('Monitor data and usage');
  });

  it('parses an expandable group with no own href', () => {
    const html = `<ul class="devsite-nav-list" menu="_book">
      <li class="devsite-nav-item devsite-nav-expandable"><div class="devsite-expandable-nav">
        <a class="devsite-nav-toggle" aria-hidden="true"></a>
        <div class="devsite-nav-title devsite-nav-title-no-path" tabindex="0" role="button"><span class="devsite-nav-text">Quickstarts</span></div>
        <ul class="devsite-nav-section">
          <li class="devsite-nav-item"><a href="/storage/docs/use-console" class="devsite-nav-title"><span class="devsite-nav-text">Use the Console</span></a></li>
        </ul>
      </div></li>
    </ul>`;
    const nodes = gcpProvider.parseToc(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe('Quickstarts');
    expect(nodes[0]!.href).toBeNull();
    expect(nodes[0]!.children).toHaveLength(1);
    expect(nodes[0]!.children[0]!.title).toBe('Use the Console');
    expect(nodes[0]!.children[0]!.href).toBe('/storage/docs/use-console');
  });

  it('parses an expandable group WITH its own href (linked parent page)', () => {
    const html = `<ul class="devsite-nav-list" menu="_book">
      <li class="devsite-nav-item devsite-nav-expandable"><div class="devsite-expandable-nav">
        <a class="devsite-nav-toggle" aria-hidden="true"></a>
        <a class="devsite-nav-title" href="/storage/docs/access-control/overview"><span class="devsite-nav-text">Access control</span></a>
        <ul class="devsite-nav-section">
          <li class="devsite-nav-item"><a href="/storage/docs/access-control/iam" class="devsite-nav-title"><span class="devsite-nav-text">IAM</span></a></li>
        </ul>
      </div></li>
    </ul>`;
    const nodes = gcpProvider.parseToc(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe('Access control');
    expect(nodes[0]!.href).toBe('/storage/docs/access-control/overview');
    expect(nodes[0]!.children).toHaveLength(1);
  });

  it('parses two-level nesting correctly', () => {
    const html = `<ul class="devsite-nav-list" menu="_book">
      <li class="devsite-nav-item devsite-nav-expandable"><div class="devsite-expandable-nav">
        <a class="devsite-nav-toggle" aria-hidden="true"></a>
        <div class="devsite-nav-title devsite-nav-title-no-path"><span class="devsite-nav-text">Manage data</span></div>
        <ul class="devsite-nav-section">
          <li class="devsite-nav-item devsite-nav-expandable"><div class="devsite-expandable-nav">
            <a class="devsite-nav-toggle" aria-hidden="true"></a>
            <div class="devsite-nav-title devsite-nav-title-no-path"><span class="devsite-nav-text">Objects</span></div>
            <ul class="devsite-nav-section">
              <li class="devsite-nav-item"><a href="/storage/docs/uploading-objects" class="devsite-nav-title"><span class="devsite-nav-text">Uploading objects</span></a></li>
            </ul>
          </div></li>
        </ul>
      </div></li>
    </ul>`;
    const nodes = gcpProvider.parseToc(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe('Manage data');
    expect(nodes[0]!.children).toHaveLength(1);
    expect(nodes[0]!.children[0]!.title).toBe('Objects');
    expect(nodes[0]!.children[0]!.children).toHaveLength(1);
    expect(nodes[0]!.children[0]!.children[0]!.href).toBe('/storage/docs/uploading-objects');
  });

  it('skips li items with no extractable title', () => {
    const html = `<ul class="devsite-nav-list" menu="_book">
      <li class="devsite-nav-item"></li>
      <li class="devsite-nav-item"><a href="/storage/docs/introduction" class="devsite-nav-title"><span class="devsite-nav-text">Product overview</span></a></li>
    </ul>`;
    const nodes = gcpProvider.parseToc(html);
    expect(nodes).toHaveLength(1);
  });

  it('ignores the global tab nav lists (no menu="_book" attr)', () => {
    const html = `
      <ul class="devsite-nav-list">
        <li class="devsite-nav-item"><a href="/docs" class="devsite-nav-title"><span class="devsite-nav-text">Technology areas</span></a></li>
      </ul>
      <ul class="devsite-nav-list" menu="_book">
        <li class="devsite-nav-item"><a href="/storage/docs/introduction" class="devsite-nav-title"><span class="devsite-nav-text">Product overview</span></a></li>
      </ul>`;
    const nodes = gcpProvider.parseToc(html);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe('Product overview');
  });

  it('parses the real storage-page fixture correctly', () => {
    const nodes = gcpProvider.parseToc(fixture('storage-page.html'));
    // Two top-level headings: Discover, Get started
    expect(nodes).toHaveLength(2);
    // Heading: Discover with Product overview as its child
    expect(nodes[0]!.title).toBe('Discover');
    expect(nodes[0]!.href).toBeNull();
    expect(nodes[0]!.children).toHaveLength(1);
    expect(nodes[0]!.children[0]!.title).toBe('Product overview');
    expect(nodes[0]!.children[0]!.href).toBe('/storage/docs/introduction');
    // Heading: Get started with all remaining items as children
    expect(nodes[1]!.title).toBe('Get started');
    expect(nodes[1]!.href).toBeNull();
    // Expandable group: Quickstarts (first child of Get started)
    expect(nodes[1]!.children[0]!.title).toBe('Quickstarts');
    expect(nodes[1]!.children[0]!.href).toBeNull();
    expect(nodes[1]!.children[0]!.children.length).toBeGreaterThan(0);
    // Leaf: Listing buckets
    expect(nodes[1]!.children[1]!.title).toBe('Listing buckets');
    expect(nodes[1]!.children[1]!.href).toBe('/storage/docs/listing-buckets');
    // Expandable with href: Access control
    expect(nodes[1]!.children[2]!.title).toBe('Access control');
    expect(nodes[1]!.children[2]!.href).toBe('/storage/docs/access-control/overview');
    expect(nodes[1]!.children[2]!.children[0]!.title).toBe('IAM');
  });
});

// ─── preprocessHtml ──────────────────────────────────────────────────────────

function preprocess(bodyHtml: string): string {
  const html = `<html><body><article class="devsite-article">${bodyHtml}</article></body></html>`;
  const $ = cheerio.load(html);
  const $main = $('article.devsite-article');
  gcpProvider.preprocessHtml!($, $main);
  return ($main.html() ?? '').replace(/>\s+</g, '><').trim();
}

describe('gcpProvider.preprocessHtml — h1 removal', () => {
  it('removes the first h1', () => {
    const out = preprocess('<h1>Listing buckets</h1><p>Body</p>');
    expect(out).not.toContain('<h1');
    expect(out).toContain('Body');
  });

  it('does not remove a second h1', () => {
    const out = preprocess('<h1>First</h1><h1>Second</h1>');
    expect(out).not.toContain('>First<');
    expect(out).toContain('>Second<');
  });
});

describe('gcpProvider.preprocessHtml — devsite-code normalization', () => {
  it('replaces devsite-code/pre with plain pre/code, inferring language from syntax attr', () => {
    const out = preprocess('<devsite-code><pre syntax="python">x = 1</pre></devsite-code>');
    expect(out).not.toContain('<devsite-code');
    expect(out).toContain('class="language-python"');
    expect(out).toContain('x = 1');
  });

  it('falls back to language attribute when syntax is absent', () => {
    const out = preprocess('<devsite-code><pre language="json">{"a":1}</pre></devsite-code>');
    expect(out).toContain('class="language-json"');
  });

  it('uses devsite-code-level syntax attr when pre has no attr', () => {
    const out = preprocess('<devsite-code syntax="shell"><pre>gsutil ls</pre></devsite-code>');
    expect(out).toContain('class="language-shell"');
  });

  it('emits code without lang class when no syntax info present', () => {
    const out = preprocess('<devsite-code><pre>plain code</pre></devsite-code>');
    expect(out).not.toContain('class="language-');
    expect(out).toContain('<code>plain code</code>');
  });

  it('collapses devsite-syntax-* spans to plain text', () => {
    const out = preprocess(
      '<devsite-code><pre language="json"><span class="devsite-syntax-p">{</span><span class="devsite-syntax-nl">"key"</span><span class="devsite-syntax-p">}</span></pre></devsite-code>'
    );
    expect(out).not.toContain('<span');
    expect(out).toContain('{"key"}');
  });

  it('HTML-escapes special characters in code text', () => {
    const out = preprocess(
      '<devsite-code><pre syntax="shell">a &lt; b &amp;&amp; c &gt; d</pre></devsite-code>'
    );
    expect(out).toContain('&lt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&gt;');
  });

  it('replaces pre-in-td with per-line inline code joined by <br>', () => {
    const out = preprocess(
      '<table><tbody><tr><td><pre><code>line1\nline2</code></pre></td></tr></tbody></table>'
    );
    expect(out).not.toContain('<pre');
    expect(out).toContain('<code>line1</code>');
    expect(out).toContain('<br>');
    expect(out).toContain('<code>line2</code>');
  });

  it('removes devsite-code with no inner pre element', () => {
    const out = preprocess('<devsite-code>inline snippet</devsite-code><p>After</p>');
    expect(out).not.toContain('<devsite-code');
    expect(out).not.toContain('inline snippet');
    expect(out).toContain('After');
  });

  it('collapses devsite-syntax-* spans in a bare pre (not inside devsite-code or table cell)', () => {
    const out = preprocess(
      '<pre><span class="devsite-syntax-kd">const</span> <span class="devsite-syntax-nx">x</span></pre>'
    );
    expect(out).not.toContain('<span');
    expect(out).toContain('<code>const x</code>');
  });
});

describe('gcpProvider.preprocessHtml — aside transformation', () => {
  it('transforms aside.note into blockquote with NOTE: prefix', () => {
    const out = preprocess(
      `<aside class="note"><strong>Note:</strong><span>You need permission.</span></aside>`
    );
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<strong>NOTE:</strong>');
    expect(out).toContain('You need permission.');
    expect(out).not.toContain('<aside');
  });

  it('transforms aside.caution', () => {
    const out = preprocess(
      `<aside class="caution"><strong>Caution:</strong><span>Watch out.</span></aside>`
    );
    expect(out).toContain('<strong>CAUTION:</strong>');
  });

  it('transforms aside.warning', () => {
    const out = preprocess(
      `<aside class="warning"><strong>Warning:</strong><span>Dangerous.</span></aside>`
    );
    expect(out).toContain('<strong>WARNING:</strong>');
  });

  it('transforms aside.key-point', () => {
    const out = preprocess(
      `<aside class="key-point"><strong>Key Point:</strong><span>Important.</span></aside>`
    );
    expect(out).toContain('<strong>KEY POINT:</strong>');
  });

  it('handles aside with no children gracefully', () => {
    expect(() => preprocess(`<aside class="note"></aside>`)).not.toThrow();
  });
});

describe('gcpProvider.preprocessHtml — ds-selector-tabs unwrap', () => {
  it('unwraps ds-selector-tabs, preserving inner section content', () => {
    const out = preprocess(
      `<div class="ds-selector-tabs"><section><h3>Console</h3><p>Use the UI.</p></section></div>`
    );
    expect(out).not.toContain('ds-selector-tabs');
    expect(out).toContain('<h3>Console</h3>');
    expect(out).toContain('Use the UI.');
  });
});

describe('gcpProvider.preprocessHtml — var unwrap', () => {
  it('replaces var[translate="no"] with its text content', () => {
    const out = preprocess(`<p>Replace <var translate="no">BUCKET_NAME</var> with your name.</p>`);
    expect(out).not.toContain('<var');
    expect(out).toContain('BUCKET_NAME');
  });

  it('does not unwrap var without translate="no" attribute', () => {
    const out = preprocess(`<p><var>x</var></p>`);
    expect(out).toContain('<var>');
  });
});

describe('gcpProvider.preprocessHtml — real fixture integration', () => {
  it('processes storage-page fixture without throwing', () => {
    const html = fixture('storage-page.html');
    const $ = cheerio.load(html);
    const $main = $('article.devsite-article');
    expect(() => gcpProvider.preprocessHtml!($, $main)).not.toThrow();
  });

  it('leaves no devsite-code, aside, or var[translate] elements after preprocessing', () => {
    const html = fixture('storage-page.html');
    const $ = cheerio.load(html);
    const $main = $('article.devsite-article');
    gcpProvider.preprocessHtml!($, $main);
    const out = $main.html() ?? '';
    expect(out).not.toContain('<devsite-code');
    expect(out).not.toContain('<aside');
    expect(out).not.toContain('class="ds-selector-tabs"');
    expect(out).not.toContain('<var translate');
  });

  it('no <h1> remains after preprocessing', () => {
    const html = fixture('storage-page.html');
    const $ = cheerio.load(html);
    const $main = $('article.devsite-article');
    gcpProvider.preprocessHtml!($, $main);
    expect($main.html() ?? '').not.toContain('<h1');
  });

  it('has fenced code blocks with language hints after preprocessing', () => {
    const html = fixture('storage-page.html');
    const $ = cheerio.load(html);
    const $main = $('article.devsite-article');
    gcpProvider.preprocessHtml!($, $main);
    const out = $main.html() ?? '';
    expect(out).toContain('class="language-shell"');
    expect(out).toContain('class="language-python"');
  });

  it('has blockquotes for notes/cautions/warnings after preprocessing', () => {
    const html = fixture('storage-page.html');
    const $ = cheerio.load(html);
    const $main = $('article.devsite-article');
    gcpProvider.preprocessHtml!($, $main);
    const out = $main.html() ?? '';
    expect(out).toContain('<strong>NOTE:</strong>');
    expect(out).toContain('<strong>CAUTION:</strong>');
    expect(out).toContain('<strong>WARNING:</strong>');
    expect(out).toContain('<strong>KEY POINT:</strong>');
    expect(out).not.toContain('<aside');
  });
});
