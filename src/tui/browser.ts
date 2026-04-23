import type { TocNode } from '../providers/types.ts';

export interface BrowserNode {
  toc: TocNode;
  expanded: boolean;
  children: BrowserNode[];
  prefix: string;
  ancestors: { node: TocNode; prefix: string }[];
}

export interface ResolvedSelection {
  subtree: TocNode;
  prefix: string;
  ancestors: { node: TocNode; prefix: string }[];
}

export function buildBrowserTree(
  nodes: TocNode[],
  ancestors: { node: TocNode; prefix: string }[] = []
): BrowserNode[] {
  const pad = Math.max(2, String(nodes.length).length);
  return nodes.map((toc, i) => {
    const prefix = String(i + 1).padStart(pad, '0') + '-';
    const children = buildBrowserTree(toc.children, [...ancestors, { node: toc, prefix }]);
    return { toc, expanded: false, children, prefix, ancestors };
  });
}

export function stateOf(node: BrowserNode, selected: Set<TocNode>): 'on' | 'off' | 'partial' {
  if (node.children.length === 0) {
    return selected.has(node.toc) ? 'on' : 'off';
  }
  const childStates = node.children.map((c) => stateOf(c, selected));
  if (childStates.every((s) => s === 'on')) return 'on';
  if (childStates.every((s) => s === 'off')) return 'off';
  return 'partial';
}

export function toggle(node: BrowserNode, selected: Set<TocNode>): Set<TocNode> {
  const shouldAdd = stateOf(node, selected) !== 'on';
  const next = new Set(selected);
  applyToLeaves(node, next, shouldAdd);
  return next;
}

function applyToLeaves(node: BrowserNode, set: Set<TocNode>, add: boolean): void {
  if (node.children.length === 0) {
    if (add) set.add(node.toc);
    else set.delete(node.toc);
    return;
  }
  for (const child of node.children) {
    applyToLeaves(child, set, add);
  }
}

export function coalesce(nodes: BrowserNode[], selected: Set<TocNode>): ResolvedSelection[] {
  const results: ResolvedSelection[] = [];
  for (const node of nodes) {
    const state = stateOf(node, selected);
    if (state === 'off') continue;
    if (state === 'on') {
      results.push({ subtree: node.toc, prefix: node.prefix, ancestors: node.ancestors });
    } else {
      results.push(...coalesce(node.children, selected));
    }
  }
  return results;
}
