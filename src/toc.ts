import type { DocProvider, TocNode } from "./providers/types.ts";

const DEFAULT_UA = "cloud-docs-cli/0.1 (+https://github.com/)";

export async function fetchToc(
  provider: DocProvider,
  url: URL,
): Promise<TocNode[]> {
  const tocUrl = provider.tocUrl(url);
  const res = await fetch(tocUrl, { headers: { "User-Agent": DEFAULT_UA } });
  if (!res.ok) {
    throw new Error(`TOC fetch failed: ${res.status} ${res.statusText} (${tocUrl})`);
  }
  const json = await res.json();
  return provider.parseToc(json);
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

export function resolveSubtree(
  tree: TocNode[],
  startHref: string,
  fallbackTitle: string,
): TocNode {
  if (!startHref) return { title: fallbackTitle, href: null, children: tree };
  const found = findSubtree(tree, startHref);
  if (!found) throw new Error(`Could not find TOC node for href "${startHref}"`);
  return found;
}
