import * as cheerio from "cheerio";
import TurndownService from "turndown";
// @ts-expect-error - turndown-plugin-gfm has no types shipped
import { gfm } from "turndown-plugin-gfm";
import type { DocProvider } from "./providers/types.ts";
import { flattenTabs } from "./tabs.ts";

const DEFAULT_UA = "cloud-docs-cli/0.1 (+https://github.com/)";

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": DEFAULT_UA } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

export function htmlToMarkdown(html: string, provider: DocProvider): string {
  const $ = cheerio.load(html);
  const $main = $(provider.contentSelector).first();
  if ($main.length === 0) {
    throw new Error(`No content at selector ${provider.contentSelector}`);
  }

  for (const sel of provider.junkSelectors) {
    $main.find(sel).remove();
  }

  // The first h1 inside main content duplicates the title we prepend from the TOC.
  $main.find("h1").first().remove();

  flattenTabs($);

  // AWS wraps code samples as <pre><code class="lang"><code class="userinput">…
  // with further nested <code class="replaceable"> / <span> for styled substitutions.
  // Nested <code> inside <pre> confuses Turndown (it emits inline backticks inside
  // a fenced block). Reduce each <pre> to <pre><code>{plain text}</code></pre>,
  // preserving the language hint on the outer code node if we can infer one.
  $main.find("pre").each((_, pre) => {
    const $pre = $(pre);
    if ($pre.closest("td, th").length > 0) {
      // Fenced code blocks inside table cells break GFM pipe-table rows.
      // Emit per-line inline <code> spans joined by <br> instead.
      const lines = $pre.text().split("\n");
      while (lines.length && !lines[0]!.trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
      $pre.replaceWith(lines.map(l => `<code>${escapeForHtml(l)}</code>`).join("<br>"));
      return;
    }
    const lang = inferLang($pre);
    const text = $pre.text();
    const langClass = lang ? ` class="language-${lang}"` : "";
    $pre.empty().append(`<code${langClass}>${escapeForHtml(text)}</code>`);
  });

  const mainHtml = $.html($main);

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });
  td.use(gfm);

  // The bundled GFM table-cell rule does not strip newlines, so multi-paragraph
  // cells or fenced code blocks break pipe-table rows. Override to collapse them.
  td.addRule("tableCell", {
    filter: ["td", "th"],
    replacement(content, node) {
      const collapsed = content.replace(/\n+/g, " ").trim();
      const index = Array.prototype.indexOf.call(node.parentNode!.childNodes, node);
      return (index === 0 ? "| " : " ") + collapsed + " |";
    },
  });

  return td.turndown(mainHtml).trim() + "\n";
}

function inferLang($pre: import("cheerio").Cheerio<any>): string | null {
  const classes = `${$pre.attr("class") ?? ""} ${$pre.find("code").first().attr("class") ?? ""}`;
  const m = classes.match(/\b(?:language-|lang-)?(json|yaml|yml|bash|sh|shell|python|py|javascript|js|typescript|ts|sql|java|go|ruby|rb|xml|html|css|hcl|terraform|tf)\b/i);
  return m?.[1] ? m[1].toLowerCase() : null;
}

function escapeForHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
