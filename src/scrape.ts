import * as cheerio from "cheerio";
import TurndownService from "turndown";
// @ts-expect-error - turndown-plugin-gfm has no types shipped
import { gfm } from "turndown-plugin-gfm";
import type { DocProvider } from "./providers/types.ts";

export function htmlToMarkdown(html: string, provider: DocProvider): string {
  const $ = cheerio.load(html);
  const $main = $(provider.contentSelector).first();
  if ($main.length === 0) {
    throw new Error(`No content at selector ${provider.contentSelector}`);
  }

  for (const sel of provider.junkSelectors) {
    $main.find(sel).remove();
  }

  provider.preprocessHtml?.($, $main);

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
