import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { htmlToMarkdown } from './scrape.ts';
import { awsProvider } from './providers/aws/aws.ts';
import type { DocProvider } from './providers/types.ts';

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'providers/aws/__fixtures__'
);

function fixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), 'utf8');
}

// ─── rds-welcome.html — simple page ─────────────────────────────────────────

describe('htmlToMarkdown — rds-welcome.html', () => {
  let md: string;

  beforeAll(() => {
    md = htmlToMarkdown(fixture('rds-welcome.html'), awsProvider);
  });

  it('does not start with an h1 (preprocessHtml strips the first h1)', () => {
    expect(md.trimStart()).not.toMatch(/^# /);
  });

  it('uses ATX headings (## not underline)', () => {
    expect(md).toMatch(/^## /m);
    expect(md).not.toMatch(/^={3,}$/m);
  });

  it('uses dash bullet markers', () => {
    expect(md).toMatch(/^-   /m);
    expect(md).not.toMatch(/^\* /m);
  });

  it('renders the comparison table as a GFM pipe table', () => {
    expect(md).toContain('| Feature |');
    expect(md).toContain('| --- |');
  });

  it('table cells do not contain newlines', () => {
    const tableLines = md.split('\n').filter((l) => l.startsWith('| '));
    for (const line of tableLines) {
      expect(line).not.toContain('\n');
    }
  });

  it('ends with a single trailing newline', () => {
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
  });
});

// ─── cfn-rds-resource.html — code blocks ────────────────────────────────────

describe('htmlToMarkdown — cfn-rds-resource.html (code blocks)', () => {
  let md: string;

  beforeAll(() => {
    md = htmlToMarkdown(fixture('cfn-rds-resource.html'), awsProvider);
  });

  it('emits fenced code blocks with language hint', () => {
    expect(md).toMatch(/^```json\n/m);
    expect(md).toMatch(/^```yaml\n/m);
  });

  it('does not leak raw HTML tags from nested <span> / <a> inside <pre>', () => {
    expect(md).not.toContain('<span');
    expect(md).not.toContain('<a href=');
  });

  it('preserves the code content (not empty blocks)', () => {
    const jsonBlock = md.match(/```json\n([\s\S]*?)```/);
    expect(jsonBlock).not.toBeNull();
    expect(jsonBlock![1]!.trim().length).toBeGreaterThan(10);
  });
});

// ─── cfn-create-stack.html — tabs page ──────────────────────────────────────

describe('htmlToMarkdown — cfn-create-stack.html (awsdocs-tabs)', () => {
  let md: string;

  beforeAll(() => {
    md = htmlToMarkdown(fixture('cfn-create-stack.html'), awsProvider);
  });

  it('no raw awsdocs-tabs element in output', () => {
    expect(md).not.toContain('awsdocs-tabs');
  });

  it('tab labels become #### headings', () => {
    const h4s = md.match(/^#### .+/gm) ?? [];
    expect(h4s.length).toBeGreaterThan(0);
    expect(h4s[0]).toMatch(/^#### (CLI|Console|PowerShell|AWS CLI)/);
  });
});

// ─── error case ─────────────────────────────────────────────────────────────

describe('htmlToMarkdown — error cases', () => {
  it('throws when contentSelector is not found', () => {
    const provider: DocProvider = {
      ...awsProvider,
      contentSelector: '#does-not-exist',
    };
    expect(() => htmlToMarkdown('<html><body><p>hi</p></body></html>', provider)).toThrow(
      'No content at selector #does-not-exist'
    );
  });

  it('strips junk selectors before conversion', () => {
    const html = `
      <html><body>
        <div id="main-col-body">
          <div class="feedback-container">JUNK</div>
          <p>Real content</p>
        </div>
      </body></html>`;
    const result = htmlToMarkdown(html, awsProvider);
    expect(result).not.toContain('JUNK');
    expect(result).toContain('Real content');
  });

  it('renders em with underscore delimiter', () => {
    const html = `<div id="main-col-body"><p><em>italics</em></p></div>`;
    const result = htmlToMarkdown(html, awsProvider);
    expect(result).toContain('_italics_');
  });
});
