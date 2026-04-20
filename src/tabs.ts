import type { CheerioAPI, Cheerio } from "cheerio";

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
  $("awsdocs-tabs").each((_, el) => {
    const $el = $(el);
    const labels: string[] = [];
    const panelsHtml: string[] = [];
    $el.find("> dl > dt").each((__, dt) => {
      labels.push($(dt).text().trim() || "Tab");
    });
    $el.find("> dl > dd[tab-id]").each((__, dd) => {
      panelsHtml.push($(dd).html() ?? "");
    });
    const parts = panelsHtml.map(
      (inner, i) => `<h4>${escapeHtml(labels[i] ?? `Tab ${i + 1}`)}</h4>${inner}`,
    );
    $el.replaceWith(`<div class="cloud-docs-cli-tabs">${parts.join("")}</div>`);
  });
}

function flattenRoleBased($: CheerioAPI): void {
  $('[role="tablist"]').each((_, tablist) => {
    const $list = $(tablist);
    const labels = $list.find('[role="tab"]').toArray()
      .map((t) => $(t).text().trim() || "Tab");

    const $container = $list.parent();
    const $panels = $container.find('[role="tabpanel"]');

    $container.replaceWith(buildFlattened($, labels, $panels));
  });
}

function flattenLegacy($: CheerioAPI): void {
  $("div.awsdocs-tab-container, div.awsui-tabs").each((_, el) => {
    const $el = $(el);
    if ($el.find('[role="tablist"]').length > 0) return;

    const labels: string[] = [];
    $el.find(".awsdocs-tab, .awsui-tabs-tab-label, li[role='tab']").each((__, t) => {
      const text = $(t).text().trim();
      if (text) labels.push(text);
    });

    const $panels = $el.find(".awsdocs-tab-content, .awsui-tabs-content");
    if ($panels.length === 0) return;

    $el.replaceWith(buildFlattened($, labels, $panels));
  });
}

function buildFlattened(
  $: CheerioAPI,
  labels: string[],
  $panels: Cheerio<any>,
): string {
  const parts: string[] = [];
  $panels.each((i, panel) => {
    const label = labels[i] ?? `Tab ${i + 1}`;
    parts.push(`<h4>${escapeHtml(label)}</h4>${$.html(panel)}`);
  });
  return `<div class="cloud-docs-cli-tabs">${parts.join("")}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
