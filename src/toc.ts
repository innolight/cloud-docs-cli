import type { DocProvider, TocNode } from "./providers/types.ts";
import { fetchText, fetchJson } from "./net.ts";

export async function fetchToc(provider: DocProvider, url: URL): Promise<TocNode[]> {
  const tocUrls = await provider.discoverTocUrls(url, fetchText);
  const trees = await Promise.all(
    tocUrls.map(async (tocUrl) => provider.parseToc(await fetchJson(tocUrl))),
  );
  return trees.flat();
}

export function findSubtree(tree: TocNode[], startHref: string): TocNode | null {
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
