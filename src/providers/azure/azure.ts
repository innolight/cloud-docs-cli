import type { CheerioAPI, Cheerio } from 'cheerio';
import type { DocProvider, TocNode } from '../types.ts';

export const azureProvider: DocProvider = {
  name: 'azure',

  matches(url) {
    return url.hostname === 'learn.microsoft.com';
  },

  async discoverTocUrls(url, fetchText) {
    const pageHtml = await fetchText(url.href);
    const match =
      pageHtml.match(/<meta[^>]+name="toc_rel"[^>]+content="([^"]+)"/) ??
      pageHtml.match(/<meta[^>]+content="([^"]+)"[^>]+name="toc_rel"/);
    if (match) {
      return [new URL(match[1]!, url).href];
    }
    // Fallback: toc.json at locale/service/guide root
    const segments = url.pathname.split('/');
    const guideRoot = url.origin + segments.slice(0, 4).join('/') + '/';
    return [`${guideRoot}toc.json`];
  },

  startHref(url) {
    return url.pathname.split('/').pop() ?? '';
  },

  guideDir(url) {
    return url.pathname.split('/').slice(1, 4).join('/');
  },

  parseToc(json) {
    if (!json || typeof json !== 'object') return [];
    const items = (json as { items?: RawAzureTocEntry[] }).items;
    if (!Array.isArray(items)) return [];
    return parseEntries(items);
  },

  contentSelector: 'main#main',

  junkSelectors: [
    '#ms--content-header',
    '#article-header',
    '#article-metadata',
    '.doc-outline',
    '#center-doc-outline',
    '.is-helpful',
    '.feedback-section',
    '[data-bi-name="site-feedback-section"]',
    '[unauthorized-private-section]',
    '#ms--additional-resources',
    '#ms--additional-resources-mobile',
    '.header-holder',
    'nav',
    'footer',
    '.ask-learn-container',
    '#ms--ai-summary-cta',
    'script',
    'style',
    'noscript',
  ],

  preprocessHtml($: CheerioAPI, $main: Cheerio<any>) {
    flattenRoleBased($);
    transformAlerts($, $main);
  },
};

interface RawAzureTocEntry {
  toc_title?: string;
  href?: string;
  children?: RawAzureTocEntry[];
}

function parseEntries(entries: RawAzureTocEntry[]): TocNode[] {
  const out: TocNode[] = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const title = typeof e.toc_title === 'string' ? e.toc_title : '';
    if (!title) {
      process.stderr.write(`[azure] skipping malformed TOC entry: ${JSON.stringify(e)}\n`);
      continue;
    }
    let href: string | null = typeof e.href === 'string' ? e.href : null;
    if (href) {
      const qIdx = href.indexOf('?');
      if (qIdx !== -1) href = href.slice(0, qIdx);
    }
    out.push({
      title,
      href,
      children: Array.isArray(e.children) ? parseEntries(e.children) : [],
    });
  }
  return out;
}

const ALERT_CLASSES = ['NOTE', 'TIP', 'IMPORTANT', 'CAUTION', 'WARNING'] as const;

function transformAlerts($: CheerioAPI, $main: Cheerio<any>): void {
  const selector = ALERT_CLASSES.map((t) => `div.${t}`).join(', ');
  $main.find(selector).each((_, el) => {
    const $el = $(el);
    const type = ALERT_CLASSES.find((t) => $el.hasClass(t)) ?? 'NOTE';
    $el.find('> p').first().remove();
    const $firstChild = $el.children().first();
    if ($firstChild.length) {
      $firstChild.prepend(`<strong>${type}:</strong> `);
    }
    $el.replaceWith(`<blockquote>${$el.html() ?? ''}</blockquote>`);
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

function buildFlattened($: CheerioAPI, labels: string[], $panels: Cheerio<any>): string {
  const parts: string[] = [];
  $panels.each((i, panel) => {
    const label = labels[i] ?? `Tab ${i + 1}`;
    parts.push(`<h4>${escapeForHtml(label)}</h4>${$.html(panel)}`);
  });
  return `<div class="cloud-docs-cli-tabs">${parts.join('')}</div>`;
}

function escapeForHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
