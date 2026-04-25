import type { CheerioAPI, Cheerio } from 'cheerio';
import * as cheerio from 'cheerio';
import type { DocProvider, TocNode } from '../types.ts';

export const gcpProvider: DocProvider = {
  name: 'gcp',

  matches(url) {
    return url.hostname === 'cloud.google.com' || url.hostname === 'docs.cloud.google.com';
  },

  async discoverTocUrls(url, _fetchText) {
    return [url.href];
  },

  startHref(url) {
    return url.pathname;
  },

  guideDir(url) {
    return url.pathname.split('/').slice(1, 3).join('/');
  },

  parseToc(raw) {
    const $ = cheerio.load(raw);
    // The book-specific nav list is marked with menu="_book" to distinguish it
    // from the global tab menus (Technology areas, Cross-product tools).
    const $bookList = $('ul.devsite-nav-list[menu="_book"]').first();
    if (!$bookList.length) return [];
    return parseNavList($, $bookList);
  },

  contentSelector: 'article.devsite-article',

  junkSelectors: [
    '.devsite-article-meta',
    'devsite-thumb-rating',
    'devsite-feedback',
    'devsite-hats-survey',
    'devsite-content-footer',
    '.devsite-floating-action-buttons',
    'devsite-toc',
    'devsite-recommendations-sidebar',
    'devsite-actions',
    'devsite-feature-tooltip',
    '.nocontent',
    '[data-nosnippet]',
    'devsite-header',
    'devsite-book-nav',
    'devsite-footer',
    'devsite-footer-utility',
    'devsite-footer-linkbox',
    'devsite-cookie-notification-bar',
    'devsite-snackbar',
    'devsite-tabs.upper-tabs',
    'devsite-tabs.lower-tabs',
    'script',
    'style',
    'noscript',
  ],

  preprocessHtml($: CheerioAPI, $main: Cheerio<any>) {
    $main.find('h1').first().remove();
    normalizeDevsiteCode($, $main);
    transformAsides($, $main);
    unwrapSelectorTabs($, $main);
    unwrapVars($, $main);
  },
};

// ─── TOC parsing ─────────────────────────────────────────────────────────────

function parseNavList($: cheerio.CheerioAPI, $ul: cheerio.Cheerio<any>): TocNode[] {
  const nodes: TocNode[] = [];
  const items = $ul.children('li.devsite-nav-item').toArray();

  let i = 0;
  while (i < items.length) {
    const $li = $(items[i]!);

    if ($li.hasClass('devsite-nav-heading')) {
      // Bold section header: collect all following non-heading siblings as children
      const $div = $li.children('div.devsite-nav-title').first();
      const title = $div.find('.devsite-nav-text').text().trim() || $div.text().trim();
      i++;
      const children: TocNode[] = [];
      while (i < items.length && !$(items[i]!).hasClass('devsite-nav-heading')) {
        const node = parseNavItem($, $(items[i]!));
        if (node) children.push(node);
        i++;
      }
      if (title) nodes.push({ title, href: null, children });
    } else {
      const node = parseNavItem($, $li);
      if (node) nodes.push(node);
      i++;
    }
  }

  return nodes;
}

function parseNavItem($: cheerio.CheerioAPI, $li: cheerio.Cheerio<any>): TocNode | null {
  let title = '';
  let href: string | null = null;

  const $directLink = $li.children('a.devsite-nav-title').first();
  if ($directLink.length) {
    title = $directLink.find('.devsite-nav-text').text().trim() || $directLink.text().trim();
    href = $directLink.attr('href') ?? null;
  } else {
    // Expandable group: li > div.devsite-expandable-nav > [toggle, title, ul]
    const $expandable = $li.children('div.devsite-expandable-nav').first();
    const $titleEl = $expandable.children('a.devsite-nav-title, div.devsite-nav-title').first();
    title = $titleEl.find('.devsite-nav-text').text().trim() || $titleEl.text().trim();
    if ($titleEl.is('a')) href = $titleEl.attr('href') ?? null;
  }

  if (!title) return null;

  // Children live in ul.devsite-nav-section inside expandable-nav
  const $section = $li.find('ul.devsite-nav-section').first();
  const children = $section.length ? parseNavList($, $section) : [];

  return { title, href, children };
}

// ─── preprocessHtml helpers ──────────────────────────────────────────────────

function normalizeDevsiteCode($: CheerioAPI, $main: Cheerio<any>): void {
  $main.find('devsite-code').each((_, el) => {
    const $el = $(el);
    const $pre = $el.find('pre').first();
    if (!$pre.length) {
      $el.remove();
      return;
    }

    const lang =
      $pre.attr('syntax') ??
      $pre.attr('language') ??
      $el.attr('syntax') ??
      $el.attr('language') ??
      null;

    const text = $pre.text();
    const langClass = lang ? ` class="language-${lang.toLowerCase()}"` : '';
    $el.replaceWith(`<pre><code${langClass}>${escapeForHtml(text)}</code></pre>`);
  });

  // Any remaining <pre> with devsite-syntax-* spans: collapse to plain text
  $main.find('pre').each((_, pre) => {
    const $pre = $(pre);
    if ($pre.closest('td, th').length > 0) {
      const lines = $pre.text().split('\n');
      while (lines.length && !lines[0]!.trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
      $pre.replaceWith(lines.map((l) => `<code>${escapeForHtml(l)}</code>`).join('<br>'));
      return;
    }
    if ($pre.find('span[class*="devsite-syntax-"]').length > 0) {
      const text = $pre.text();
      $pre.empty().append(`<code>${escapeForHtml(text)}</code>`);
    }
  });
}

const ASIDE_LABELS: Record<string, string> = {
  note: 'NOTE',
  caution: 'CAUTION',
  warning: 'WARNING',
  'key-point': 'KEY POINT',
  beta: 'BETA',
  special: 'NOTE',
};

function transformAsides($: CheerioAPI, $main: Cheerio<any>): void {
  const selector = Object.keys(ASIDE_LABELS)
    .map((c) => `aside.${c}`)
    .join(', ');
  $main.find(selector).each((_, el) => {
    const $el = $(el);
    const cls = Object.keys(ASIDE_LABELS).find((c) => $el.hasClass(c)) ?? 'note';
    const label = ASIDE_LABELS[cls] ?? 'NOTE';
    // Strip the redundant <strong> label Google includes inside the aside
    $el
      .find('> p > strong:first-child, > strong:first-child')
      .first()
      .parent()
      .find('strong')
      .first()
      .remove();
    const $first = $el.children().first();
    if ($first.length) {
      $first.prepend(`<strong>${label}:</strong> `);
    }
    $el.replaceWith(`<blockquote>${$el.html() ?? ''}</blockquote>`);
  });
}

function unwrapSelectorTabs($: CheerioAPI, $main: Cheerio<any>): void {
  $main.find('div.ds-selector-tabs').each((_, el) => {
    $(el).replaceWith($(el).html() ?? '');
  });
}

function unwrapVars($: CheerioAPI, $main: Cheerio<any>): void {
  $main.find('var[translate="no"]').each((_, el) => {
    $(el).replaceWith($(el).text());
  });
}

function escapeForHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
