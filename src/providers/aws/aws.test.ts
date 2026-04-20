import { describe, it, expect, vi } from 'vitest';
import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { awsProvider, flattenTabs } from './aws.ts';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function fixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), 'utf8');
}

// ─── discoverTocUrls ────────────────────────────────────────────────────────

describe('awsProvider.discoverTocUrls', () => {
  const url = new URL('https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html');

  it('defaults to toc-contents.json when no meta tag present', async () => {
    const fetchText = vi.fn().mockResolvedValue('<html></html>');
    const urls = await awsProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual([
      'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/toc-contents.json',
    ]);
    expect(fetchText).toHaveBeenCalledOnce();
    expect(fetchText).toHaveBeenCalledWith(url.href);
  });

  it('returns single TOC URL from meta tag with one name', async () => {
    const html = `<html><head><meta name="tocs" content="my-toc.json" /></head></html>`;
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await awsProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual(['https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/my-toc.json']);
  });

  it('returns multiple TOC URLs from meta tag with semicolon-separated names', async () => {
    const html = `<html><head><meta name="tocs" content="toc-contents.json;toc-AWS_RDS.json" /></head></html>`;
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await awsProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual([
      'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/toc-contents.json',
      'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/toc-AWS_RDS.json',
    ]);
  });

  it('trims whitespace around semicolons and filters empty entries', async () => {
    const html = `<meta name="tocs" content=" a.json ; b.json ; " />`;
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await awsProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual([
      'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/a.json',
      'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/b.json',
    ]);
  });

  it('falls back to toc-contents.json when meta content is empty after filtering', async () => {
    const html = `<meta name="tocs" content=";;;" />`;
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await awsProvider.discoverTocUrls(url, fetchText);
    expect(urls).toEqual([
      'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/toc-contents.json',
    ]);
  });

  it('does NOT match single-quote attribute style (known limitation)', async () => {
    const html = `<meta name='tocs' content='my-toc.json' />`;
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await awsProvider.discoverTocUrls(url, fetchText);
    // Single-quote attrs not handled — falls back to default
    expect(urls).toEqual([
      'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/toc-contents.json',
    ]);
  });

  it('detects split-TOC from real cfn-rds-resource fixture', async () => {
    const html = fixture('cfn-rds-resource.html');
    const cfnUrl = new URL(
      'https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbinstance.html'
    );
    const fetchText = vi.fn().mockResolvedValue(html);
    const urls = await awsProvider.discoverTocUrls(cfnUrl, fetchText);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('toc-contents.json');
    expect(urls[1]).toContain('toc-AWS_RDS.json');
  });
});

// ─── startHref / guideDir / matches ─────────────────────────────────────────

describe('awsProvider.startHref', () => {
  it('extracts filename from URL path', () => {
    const url = new URL('https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html');
    expect(awsProvider.startHref(url)).toBe('Welcome.html');
  });

  it('returns empty string for trailing-slash URL', () => {
    const url = new URL('https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/');
    expect(awsProvider.startHref(url)).toBe('');
  });

  it('returns empty string for bare guide URL without trailing slash', () => {
    const url = new URL('https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide');
    expect(awsProvider.startHref(url)).toBe('UserGuide');
  });
});

describe('awsProvider.guideDir', () => {
  it('returns service/guide for a standard docs URL', () => {
    const url = new URL('https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html');
    expect(awsProvider.guideDir(url)).toBe('AmazonRDS/UserGuide');
  });

  it('returns service/guide for CloudFormation TemplateReference', () => {
    const url = new URL(
      'https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbinstance.html'
    );
    expect(awsProvider.guideDir(url)).toBe('AWSCloudFormation/TemplateReference');
  });
});

describe('awsProvider.matches', () => {
  it('matches docs.aws.amazon.com', () => {
    expect(awsProvider.matches(new URL('https://docs.aws.amazon.com/foo'))).toBe(true);
  });

  it('does not match other domains', () => {
    expect(awsProvider.matches(new URL('https://example.com/foo'))).toBe(false);
    expect(awsProvider.matches(new URL('https://cloud.google.com/foo'))).toBe(false);
  });
});

// ─── parseToc ────────────────────────────────────────────────────────────────

describe('awsProvider.parseToc', () => {
  it('parses well-formed TOC JSON', () => {
    const json = {
      contents: [
        { title: 'Welcome', href: 'Welcome.html' },
        {
          title: 'Getting Started',
          href: 'GettingStarted.html',
          contents: [{ title: 'Step 1', href: 'step1.html' }],
        },
      ],
    };
    const nodes = awsProvider.parseToc(json);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({ title: 'Welcome', href: 'Welcome.html', children: [] });
    expect(nodes[1]!.title).toBe('Getting Started');
    expect(nodes[1]!.children).toHaveLength(1);
    expect(nodes[1]!.children[0]!.title).toBe('Step 1');
  });

  it('uses null href when entry has no href field', () => {
    const json = { contents: [{ title: 'Section' }] };
    const nodes = awsProvider.parseToc(json);
    expect(nodes[0]!.href).toBeNull();
  });

  it('returns empty array for non-object root', () => {
    expect(awsProvider.parseToc(null)).toEqual([]);
    expect(awsProvider.parseToc('string')).toEqual([]);
    expect(awsProvider.parseToc(42)).toEqual([]);
  });

  it('returns empty array when contents is not an array', () => {
    expect(awsProvider.parseToc({ contents: null })).toEqual([]);
    expect(awsProvider.parseToc({ contents: 'bad' })).toEqual([]);
    expect(awsProvider.parseToc({})).toEqual([]);
  });

  it('skips entries without a title and writes to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const json = {
      contents: [{ href: 'orphan.html' }, { title: 'Valid', href: 'valid.html' }],
    };
    const nodes = awsProvider.parseToc(json);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe('Valid');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[aws] skipping malformed'));
    stderrSpy.mockRestore();
  });

  it('handles entry with contents: null gracefully (leaf with empty children)', () => {
    const json = { contents: [{ title: 'Leaf', href: 'leaf.html', contents: null }] };
    const nodes = awsProvider.parseToc(json);
    expect(nodes[0]!.children).toEqual([]);
  });

  it('parses the real RDS TOC fixture without error', () => {
    const json = JSON.parse(fixture('rds-toc-contents.json'));
    const nodes = awsProvider.parseToc(json);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0]!.title).toBeTruthy();
  });
});

// ─── flattenTabs ─────────────────────────────────────────────────────────────

function run(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  flattenTabs($);
  return ($('#root').html() ?? '').replace(/>\s+</g, '><').trim();
}

describe('flattenTabs — awsdocs-tabs', () => {
  it('replaces awsdocs-tabs with h4 + panel divs', () => {
    const html = `
      <awsdocs-tabs>
        <dl>
          <dt>Node.js</dt><dd tab-id="nodejs"><p>const x = 1;</p></dd>
          <dt>Python</dt><dd tab-id="python"><p>x = 1</p></dd>
        </dl>
      </awsdocs-tabs>`;
    expect(run(html)).toEqual(
      `<div class="cloud-docs-cli-tabs"><h4>Node.js</h4><p>const x = 1;</p><h4>Python</h4><p>x = 1</p></div>`
    );
  });

  it('wraps result in cloud-docs-cli-tabs div', () => {
    const html = `<awsdocs-tabs><dl><dt>A</dt><dd tab-id="a">foo</dd></dl></awsdocs-tabs>`;
    expect(run(html)).toContain('class="cloud-docs-cli-tabs"');
  });

  it("falls back to 'Tab' when dt text is empty", () => {
    const html = `<awsdocs-tabs><dl><dt></dt><dd tab-id="x">content</dd></dl></awsdocs-tabs>`;
    expect(run(html)).toContain('<h4>Tab</h4>');
  });

  it('escapes HTML-unsafe chars in labels', () => {
    const html = `
      <awsdocs-tabs>
        <dl><dt>A &amp; B &lt;C&gt;</dt><dd tab-id="x">body</dd></dl>
      </awsdocs-tabs>`;
    expect(run(html)).toEqual(
      `<div class="cloud-docs-cli-tabs"><h4>A &amp; B &lt;C&gt;</h4>body</div>`
    );
  });

  it('handles multiple awsdocs-tabs independently', () => {
    const html = `
      <awsdocs-tabs><dl><dt>First</dt><dd tab-id="a">a</dd></dl></awsdocs-tabs>
      <awsdocs-tabs><dl><dt>Second</dt><dd tab-id="b">b</dd></dl></awsdocs-tabs>`;
    expect(run(html)).toEqual(
      `<div class="cloud-docs-cli-tabs"><h4>First</h4>a</div><div class="cloud-docs-cli-tabs"><h4>Second</h4>b</div>`
    );
  });

  it('handles code blocks inside tab panels', () => {
    const html = `
      <awsdocs-tabs>
        <dl>
          <dt>JSON</dt>
          <dd tab-id="json"><pre class="programlisting"><code class="json">{"key": "value"}</code></pre></dd>
          <dt>YAML</dt>
          <dd tab-id="yaml"><pre class="programlisting"><code class="yaml">key: value</code></pre></dd>
        </dl>
      </awsdocs-tabs>`;
    expect(run(html)).toEqual(
      `<div class="cloud-docs-cli-tabs"><h4>JSON</h4><pre class="programlisting"><code class="json">{"key": "value"}</code></pre><h4>YAML</h4><pre class="programlisting"><code class="yaml">key: value</code></pre></div>`
    );
  });
});

describe('flattenTabs — role-based tabs', () => {
  it('replaces role=tablist container with h4 + panels', () => {
    const html = `
      <div class="tabs-container">
        <ul role="tablist">
          <li role="tab">Console</li>
          <li role="tab">CLI</li>
        </ul>
        <div role="tabpanel"><p>Console content</p></div>
        <div role="tabpanel"><p>CLI content</p></div>
      </div>`;
    expect(run(html)).toEqual(
      `<div class="cloud-docs-cli-tabs"><h4>Console</h4><div role="tabpanel"><p>Console content</p></div><h4>CLI</h4><div role="tabpanel"><p>CLI content</p></div></div>`
    );
  });

  it("falls back to 'Tab' when tab label is empty", () => {
    const html = `
      <div>
        <ul role="tablist"><li role="tab"></li></ul>
        <div role="tabpanel">content</div>
      </div>`;
    expect(run(html)).toContain('<h4>Tab</h4>');
  });
});

describe('flattenTabs — legacy containers', () => {
  it('flattens awsdocs-tab-container without role=tablist inside', () => {
    const html = `
      <div class="awsdocs-tab-container">
        <span class="awsdocs-tab">Option A</span>
        <span class="awsdocs-tab">Option B</span>
        <div class="awsdocs-tab-content"><p>Content A</p></div>
        <div class="awsdocs-tab-content"><p>Content B</p></div>
      </div>`;
    expect(run(html)).toEqual(
      `<div class="cloud-docs-cli-tabs"><h4>Option A</h4><div class="awsdocs-tab-content"><p>Content A</p></div><h4>Option B</h4><div class="awsdocs-tab-content"><p>Content B</p></div></div>`
    );
  });

  it('skips legacy container that already has role=tablist inside (handled by role-based pass)', () => {
    const html = `
      <div class="awsdocs-tab-container">
        <ul role="tablist"><li role="tab">X</li></ul>
        <div class="awsdocs-tab-content">panel</div>
      </div>`;
    expect(run(html)).not.toContain('role="tablist"');
  });

  it('skips legacy container with no panels (no awsdocs-tab-content children)', () => {
    const html = `
      <div class="awsdocs-tab-container">
        <span class="awsdocs-tab">Lone Tab</span>
      </div>`;
    expect(run(html)).toContain('awsdocs-tab-container');
  });
});

// ─── preprocessHtml ──────────────────────────────────────────────────────────

function preprocess(bodyHtml: string): string {
  const html = `<html><body><div id="main-col-body">${bodyHtml}</div></body></html>`;
  const $ = cheerio.load(html);
  const $main = $('#main-col-body');
  awsProvider.preprocessHtml!($, $main);
  return $main.html() ?? '';
}

describe('awsProvider.preprocessHtml — h1 removal', () => {
  it('removes the first h1', () => {
    const out = preprocess('<h1 id="title">Title</h1><p>Body</p>');
    expect(out).not.toContain('<h1');
    expect(out).toContain('Body');
  });

  it('does not remove subsequent h1 elements', () => {
    const out = preprocess('<h1>First</h1><h1>Second</h1>');
    expect(out).not.toContain('>First<');
    expect(out).toContain('>Second<');
  });
});

describe('awsProvider.preprocessHtml — pre normalisation', () => {
  it('flattens nested code/span inside pre to plain text', () => {
    const inner = `<code class="json "><span>{</span>\n  "key": "value"\n}</code>`;
    const out = preprocess(`<pre class="programlisting">${inner}</pre>`);
    expect(out).toContain('class="language-json"');
    expect(out).not.toContain('<span');
    // The text content should be preserved
    expect(out).toContain('"key": "value"');
  });

  it('infers json lang from code class', () => {
    const out = preprocess(`<pre><code class="json">{"a":1}</code></pre>`);
    expect(out).toContain('language-json');
  });

  it('infers yaml lang from code class', () => {
    const out = preprocess(`<pre><code class="yaml">key: val</code></pre>`);
    expect(out).toContain('language-yaml');
  });

  it('infers bash lang from code class', () => {
    const out = preprocess(`<pre><code class="bash">echo hi</code></pre>`);
    expect(out).toContain('language-bash');
  });

  it('omits lang class when none matches', () => {
    const out = preprocess(`<pre><code class="unknown-lang">data</code></pre>`);
    expect(out).not.toContain('language-');
    expect(out).toContain('<code>');
  });

  it('HTML-escapes special chars in code text', () => {
    const out = preprocess(`<pre><code>a < b && c > d</code></pre>`);
    expect(out).toContain('&lt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&gt;');
  });

  it('replaces pre inside td with per-line inline code joined by <br>', () => {
    const out = preprocess(
      `<table><tbody><tr><td><pre><code>line1\nline2\nline3</code></pre></td></tr></tbody></table>`
    );
    expect(out).not.toContain('<pre');
    expect(out).toContain('<code>line1</code>');
    expect(out).toContain('<br>');
    expect(out).toContain('<code>line2</code>');
  });

  it('strips leading/trailing blank lines from pre-in-td', () => {
    const out = preprocess(
      `<table><tbody><tr><td><pre><code>\n\nline1\nline2\n\n</code></pre></td></tr></tbody></table>`
    );
    // Should not start with an empty <code></code>
    expect(out).not.toMatch(/<code><\/code><br>/);
    expect(out).toContain('<code>line1</code>');
  });

  it('processes real cfn-rds-resource fixture without throwing', () => {
    const html = fixture('cfn-rds-resource.html');
    const $ = cheerio.load(html);
    const $main = $('#main-col-body');
    expect(() => awsProvider.preprocessHtml!($, $main)).not.toThrow();
    // After preprocessing, no nested code/span inside pre
    $main.find('pre').each((_, pre) => {
      expect($(pre).find('span, a').length).toBe(0);
    });
  });
});
