import type { DocProvider, TocNode } from "./types.ts";

interface RawTocEntry {
  title?: string;
  href?: string;
  contents?: RawTocEntry[];
}

function parseEntries(entries: RawTocEntry[]): TocNode[] {
  const out: TocNode[] = [];
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const title = typeof e.title === "string" ? e.title : "";
    if (!title) continue;
    out.push({
      title,
      href: typeof e.href === "string" ? e.href : null,
      children: Array.isArray(e.contents) ? parseEntries(e.contents) : [],
    });
  }
  return out;
}

export const awsProvider: DocProvider = {
  name: "aws",

  matches(url) {
    return url.hostname === "docs.aws.amazon.com";
  },

  tocUrl(url) {
    // Guide root is the URL's path minus the final page filename.
    // e.g. /AmazonRDS/latest/UserGuide/zero-etl.html -> /AmazonRDS/latest/UserGuide/
    const guideRoot = url.pathname.replace(/[^/]+$/, "");
    return `${url.origin}${guideRoot}toc-contents.json`;
  },

  startHref(url) {
    const last = url.pathname.split("/").pop() ?? "";
    return last;
  },

  guideDir(url) {
    const [, service, , guide] = url.pathname.split("/");
    return `${service}/${guide}`;
  },

  parseToc(json) {
    if (!json || typeof json !== "object") return [];
    const contents = (json as { contents?: RawTocEntry[] }).contents;
    if (!Array.isArray(contents)) return [];
    return parseEntries(contents);
  },

  contentSelector: "#main-col-body",

  junkSelectors: [
    "#aws-page-ctas",
    ".feedback-container",
    ".feedbackComponent",
    "#feedbackYesNo",
    ".awsdocs-page-header-container",
    ".awsdocs-filter-selector",
    ".awsdocs-language-selector",
    "#awsdocs-legal-pages",
    ".awsui-util-container-header-description",
    "#awsdocs-copyright",
    "#awsdocs-nav",
    "script",
    "style",
    "noscript",
  ],
};

export const providers: DocProvider[] = [awsProvider];

export function pickProvider(url: URL): DocProvider {
  const p = providers.find((x) => x.matches(url));
  if (!p) throw new Error(`No provider registered for ${url.hostname}`);
  return p;
}
