import type { DocProvider, TocNode } from './providers/types.ts';
import { fetchText as defaultFetchText, fetchJson as defaultFetchJson } from './net.ts';

export async function fetchToc(
  provider: DocProvider,
  url: URL,
  fetchTextFn: (url: string) => Promise<string> = defaultFetchText,
  fetchJsonFn: (url: string) => Promise<unknown> = defaultFetchJson
): Promise<TocNode[]> {
  const tocUrls = await provider.discoverTocUrls(url, fetchTextFn);
  const trees = await Promise.all(
    tocUrls.map(async (tocUrl) => provider.parseToc(await fetchJsonFn(tocUrl)))
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

interface SubtreeResult {
  node: TocNode;
  prefix: string;
  ancestors: { node: TocNode; prefix: string }[];
}

function findSubtreeWithPosition(tree: TocNode[], startHref: string): SubtreeResult | null {
  const pad = Math.max(2, String(tree.length).length);
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]!;
    const prefix = String(i + 1).padStart(pad, '0') + '-';
    if (node.href === startHref) {
      return { node, prefix, ancestors: [] };
    }
    const hit = findSubtreeWithPosition(node.children, startHref);
    if (hit) {
      return { ...hit, ancestors: [{ node, prefix }, ...hit.ancestors] };
    }
  }
  return null;
}

export function resolveSubtree(
  tree: TocNode[],
  startHref: string,
  fallbackTitle: string
): { subtree: TocNode; prefix: string; ancestors: { node: TocNode; prefix: string }[] } {
  if (!startHref)
    return {
      subtree: { title: fallbackTitle, href: null, children: tree },
      prefix: '',
      ancestors: [],
    };
  const result = findSubtreeWithPosition(tree, startHref);
  if (!result) throw new Error(`Could not find TOC node for href "${startHref}"`);
  return { subtree: result.node, prefix: result.prefix, ancestors: result.ancestors };
}
