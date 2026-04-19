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
