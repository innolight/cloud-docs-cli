import type { DocProvider, TocNode } from "./providers/types.ts";

const DEFAULT_UA = "cloud-docs-cli/0.1 (+https://github.com/)";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": DEFAULT_UA } });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": DEFAULT_UA } });
  if (!res.ok) throw new Error(`TOC fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.json();
}

// Some AWS guides split their TOC across multiple files. The page lists them in
// <meta name="tocs" content="toc-contents.json;toc-AWS_S3.json"> (semicolon-separated).
function extractTocFilenames(html: string): string[] | null {
  const match = html.match(/<meta[^>]+name="tocs"[^>]+content="([^"]+)"/);
  if (!match) return null;
  return match[1]!.split(";").map((s) => s.trim()).filter(Boolean);
}

export async function fetchToc(
  provider: DocProvider,
  url: URL,
): Promise<TocNode[]> {
  const guideRoot = url.origin + url.pathname.replace(/[^/]+$/, "");

  const pageHtml = await fetchText(url.href);
  const tocFilenames = extractTocFilenames(pageHtml);

  const tocUrls = tocFilenames && tocFilenames.length > 0
    ? tocFilenames.map((name) => `${guideRoot}${name}`)
    : [provider.tocUrl(url)];

  const trees = await Promise.all(
    tocUrls.map(async (tocUrl) => provider.parseToc(await fetchJson(tocUrl))),
  );

  return trees.flat();
}

export function findSubtree(
  tree: TocNode[],
  startHref: string,
): TocNode | null {
  for (const node of tree) {
    if (node.href === startHref) return node;
    const hit = findSubtree(node.children, startHref);
    if (hit) return hit;
  }
  return null;
}

function findSubtreeWithPosition(
  tree: TocNode[],
  startHref: string,
): { node: TocNode; prefix: string } | null {
  const pad = Math.max(2, String(tree.length).length);
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]!;
    if (node.href === startHref) {
      return { node, prefix: String(i + 1).padStart(pad, "0") + "-" };
    }
    const hit = findSubtreeWithPosition(node.children, startHref);
    if (hit) return hit;
  }
  return null;
}

export function resolveSubtree(
  tree: TocNode[],
  startHref: string,
  fallbackTitle: string,
): { subtree: TocNode; prefix: string } {
  if (!startHref) return { subtree: { title: fallbackTitle, href: null, children: tree }, prefix: "" };
  const result = findSubtreeWithPosition(tree, startHref);
  if (!result) throw new Error(`Could not find TOC node for href "${startHref}"`);
  return { subtree: result.node, prefix: result.prefix };
}
