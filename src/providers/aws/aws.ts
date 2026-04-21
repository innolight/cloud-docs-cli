import type { CheerioAPI, Cheerio } from 'cheerio';
import type { DocProvider, TocNode } from '../types.ts';

export const awsProvider: DocProvider = {
  name: 'aws',

  matches(url) {
    return url.hostname === 'docs.aws.amazon.com';
  },

  async discoverTocUrls(url, fetchText) {
    const guideRoot = url.origin + url.pathname.replace(/[^/]+$/, '');
    const pageHtml = await fetchText(url.href);
    // Some AWS guides split their TOC across multiple files listed in
    // <meta name="tocs" content="toc-contents.json;toc-AWS_S3.json">
    const match = pageHtml.match(/<meta[^>]+name="tocs"[^>]+content="([^"]+)"/);
    if (match) {
      const names = match[1]!
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length > 0) return names.map((name) => `${guideRoot}${name}`);
    }
    return [`${guideRoot}toc-contents.json`];
  },

  startHref(url) {
    return url.pathname.split('/').pop() ?? '';
  },

  guideDir(url) {
    const [, service, , guide] = url.pathname.split('/');
    return `${service}/${guide}`;
  },

  parseToc(json) {
    if (!json || typeof json !== 'object') return [];
    const contents = (json as { contents?: RawTocEntry[] }).contents;
    if (!Array.isArray(contents)) return [];
    return parseEntries(contents);
  },

  contentSelector: '#main-col-body',

  junkSelectors: [
    '#aws-page-ctas',
    '.feedback-container',
    '.feedbackComponent',
    '#feedbackYesNo',
    '.awsdocs-page-header-container',
    '.awsdocs-filter-selector',
    '.awsdocs-language-selector',
    '#awsdocs-legal-pages',
    '.awsui-util-container-header-description',
    '#awsdocs-copyright',
    '#awsdocs-nav',
    'script',
    'style',
    'noscript',
  ],

  preprocessHtml($: CheerioAPI, $main: Cheerio<any>) {
    // The first h1 duplicates the TOC title we prepend at write time.
    $main.find('h1').first().remove();

    flattenTabs($);

    // AWS wraps code samples as <pre><code class="lang"><code class="userinput">…
    // with further nested <code class="replaceable"> / <span> for styled substitutions.
    // Nested <code> inside <pre> confuses Turndown (emits inline backticks inside
    // a fenced block). Reduce each <pre> to <pre><code>{plain text}</code></pre>,
    // preserving any language hint inferred from CSS class names.
    $main.find('pre').each((_, pre) => {
      const $pre = $(pre);
      if ($pre.closest('td, th').length > 0) {
        // Fenced code blocks inside table cells break GFM pipe-table rows.
        // Emit per-line inline <code> spans joined by <br> instead.
        const lines = $pre.text().split('\n');
        while (lines.length && !lines[0]!.trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
        $pre.replaceWith(lines.map((l) => `<code>${escapeForHtml(l)}</code>`).join('<br>'));
        return;
      }
      const lang = inferLang($pre);
      const text = $pre.text();
      const langClass = lang ? ` class="language-${lang}"` : '';
      $pre.empty().append(`<code${langClass}>${escapeForHtml(text)}</code>`);
    });
  },
};

interface RawTocEntry {
  title?: string;
  href?: string;
  contents?: RawTocEntry[];
}

function parseEntries(entries: RawTocEntry[]): TocNode[] {
  const out: TocNode[] = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const title = typeof e.title === 'string' ? e.title : '';
    if (!title) {
      process.stderr.write(`[aws] skipping malformed TOC entry: ${JSON.stringify(e)}\n`);
      continue;
    }
    out.push({
      title,
      href: typeof e.href === 'string' ? e.href : null,
      children: Array.isArray(e.contents) ? parseEntries(e.contents) : [],
    });
  }
  return out;
}

function inferLang($pre: Cheerio<any>): string | null {
  const classes = `${$pre.attr('class') ?? ''} ${$pre.find('code').first().attr('class') ?? ''}`;
  const m = classes.match(
    /\b(?:language-|lang-)?(json|yaml|yml|bash|sh|shell|python|py|javascript|js|typescript|ts|sql|java|go|ruby|rb|xml|html|css|hcl|terraform|tf)\b/i
  );
  return m?.[1] ? m[1].toLowerCase() : null;
}

function escapeForHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * AWS renders tabbed examples a few different ways depending on page age:
 *   - Current: <awsdocs-tabs> wrapping a <dl> with <dt> labels and <dd tab-id>
 *     panels.
 *   - Role-based: [role="tablist"] siblings of [role="tabpanel"] panels.
 *   - Legacy: div.awsdocs-tab-container / div.awsui-tabs.
 * All get rewritten in place to flat <h4>label</h4> + panel HTML so Turndown
 * emits "#### Label" followed by the panel's code blocks.
 */
export function flattenTabs($: CheerioAPI): void {
  flattenAwsdocsTabs($);
  flattenRoleBased($);
  flattenLegacy($);
}

function flattenAwsdocsTabs($: CheerioAPI): void {
  $('awsdocs-tabs').each((_, el) => {
    const $el = $(el);
    const labels: string[] = [];
    const panelsHtml: string[] = [];
    $el.find('> dl > dt').each((__, dt) => {
      labels.push($(dt).text().trim() || 'Tab');
    });
    $el.find('> dl > dd[tab-id]').each((__, dd) => {
      panelsHtml.push($(dd).html() ?? '');
    });
    const parts = panelsHtml.map(
      (inner, i) => `<h4>${escapeForHtml(labels[i] ?? `Tab ${i + 1}`)}</h4>${inner}`
    );
    $el.replaceWith(`<div class="cloud-docs-cli-tabs">${parts.join('')}</div>`);
  });
}

function flattenRoleBased($: CheerioAPI): void {
  $('[role="tablist"]').each((_, tablist) => {
    const $list = $(tablist);
    const labels = $list
      .find('[role="tab"]')
      .toArray()
      .map((t) => $(t).text().trim() || 'Tab');

    const $container = $list.parent();
    const $panels = $container.find('[role="tabpanel"]');

    $container.replaceWith(buildFlattened($, labels, $panels));
  });
}

function flattenLegacy($: CheerioAPI): void {
  $('div.awsdocs-tab-container, div.awsui-tabs').each((_, el) => {
    const $el = $(el);
    if ($el.find('[role="tablist"]').length > 0) return;

    const labels: string[] = [];
    $el.find(".awsdocs-tab, .awsui-tabs-tab-label, li[role='tab']").each((__, t) => {
      const text = $(t).text().trim();
      if (text) labels.push(text);
    });

    const $panels = $el.find('.awsdocs-tab-content, .awsui-tabs-content');
    if ($panels.length === 0) return;

    $el.replaceWith(buildFlattened($, labels, $panels));
  });
}

function buildFlattened($: CheerioAPI, labels: string[], $panels: Cheerio<any>): string {
  const parts: string[] = [];
  $panels.each((i, panel) => {
    const label = labels[i] ?? `Tab ${i + 1}`;
    parts.push(`<h4>${escapeForHtml(label)}</h4>${$.html(panel)}`);
  });
  return `<div class="cloud-docs-cli-tabs">${parts.join('')}</div>`;
}
