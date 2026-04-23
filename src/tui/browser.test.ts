import { describe, it, expect } from 'vitest';
import {
  buildBrowserTree,
  stateOf,
  toggle,
  coalesce,
  computeLeafCounts,
  computeSelectedCounts,
  stateFromCounts,
} from './browser.ts';
import type { TocNode } from '../providers/types.ts';

const leaf = (title: string, href: string): TocNode => ({ title, href, children: [] });
const branch = (title: string, children: TocNode[]): TocNode => ({ title, href: null, children });

const TREE: TocNode[] = [
  leaf('Welcome', 'welcome.html'),
  branch('Networking', [leaf('Concepts', 'concepts.html'), leaf('Planning', 'planning.html')]),
];

// ─── buildBrowserTree ────────────────────────────────────────────────────────

describe('buildBrowserTree', () => {
  it('creates a BrowserNode per TocNode', () => {
    const nodes = buildBrowserTree(TREE);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.toc).toBe(TREE[0]);
    expect(nodes[1]!.toc).toBe(TREE[1]);
  });

  it('assigns prefix based on sibling position', () => {
    const nodes = buildBrowserTree(TREE);
    expect(nodes[0]!.prefix).toBe('01-');
    expect(nodes[1]!.prefix).toBe('02-');
  });

  it('uses 3-digit prefix when there are >= 100 siblings', () => {
    const big = Array.from({ length: 100 }, (_, i) => leaf(`P${i}`, `p${i}.html`));
    const nodes = buildBrowserTree(big);
    expect(nodes[0]!.prefix).toBe('001-');
    expect(nodes[99]!.prefix).toBe('100-');
  });

  it('recursively builds children with correct prefixes', () => {
    const nodes = buildBrowserTree(TREE);
    const net = nodes[1]!;
    expect(net.children).toHaveLength(2);
    expect(net.children[0]!.toc.title).toBe('Concepts');
    expect(net.children[0]!.prefix).toBe('01-');
    expect(net.children[1]!.prefix).toBe('02-');
  });

  it('children carry the full ancestor chain', () => {
    const nodes = buildBrowserTree(TREE);
    const concepts = nodes[1]!.children[0]!;
    expect(concepts.ancestors).toHaveLength(1);
    expect(concepts.ancestors[0]!.node.title).toBe('Networking');
    expect(concepts.ancestors[0]!.prefix).toBe('02-');
  });

  it('nodes start collapsed', () => {
    const nodes = buildBrowserTree(TREE);
    expect(nodes[0]!.expanded).toBe(false);
    expect(nodes[1]!.expanded).toBe(false);
    expect(nodes[1]!.children[0]!.expanded).toBe(false);
  });

  it('top-level nodes have empty ancestors', () => {
    const nodes = buildBrowserTree(TREE);
    expect(nodes[0]!.ancestors).toEqual([]);
    expect(nodes[1]!.ancestors).toEqual([]);
  });
});

// ─── stateOf ────────────────────────────────────────────────────────────────

describe('stateOf', () => {
  it('leaf not in selected → off', () => {
    const nodes = buildBrowserTree(TREE);
    expect(stateOf(nodes[0]!, new Set())).toBe('off');
  });

  it('leaf in selected → on', () => {
    const nodes = buildBrowserTree(TREE);
    expect(stateOf(nodes[0]!, new Set([TREE[0]!]))).toBe('on');
  });

  it('branch with no children selected → off', () => {
    const nodes = buildBrowserTree(TREE);
    expect(stateOf(nodes[1]!, new Set())).toBe('off');
  });

  it('branch with all leaf descendants selected → on', () => {
    const nodes = buildBrowserTree(TREE);
    const selected = new Set([TREE[1]!.children[0]!, TREE[1]!.children[1]!]);
    expect(stateOf(nodes[1]!, selected)).toBe('on');
  });

  it('branch with some leaf descendants selected → partial', () => {
    const nodes = buildBrowserTree(TREE);
    const selected = new Set([TREE[1]!.children[0]!]);
    expect(stateOf(nodes[1]!, selected)).toBe('partial');
  });
});

// ─── toggle ─────────────────────────────────────────────────────────────────

describe('toggle', () => {
  it('off leaf → adds it to selected', () => {
    const nodes = buildBrowserTree(TREE);
    const next = toggle(nodes[0]!, new Set());
    expect(next.has(TREE[0]!)).toBe(true);
    expect(next.size).toBe(1);
  });

  it('on leaf → removes it from selected', () => {
    const nodes = buildBrowserTree(TREE);
    const next = toggle(nodes[0]!, new Set([TREE[0]!]));
    expect(next.size).toBe(0);
  });

  it('off branch → adds all leaf descendants', () => {
    const nodes = buildBrowserTree(TREE);
    const next = toggle(nodes[1]!, new Set());
    expect(next.has(TREE[1]!.children[0]!)).toBe(true);
    expect(next.has(TREE[1]!.children[1]!)).toBe(true);
    expect(next.size).toBe(2);
  });

  it('on branch → removes all leaf descendants', () => {
    const nodes = buildBrowserTree(TREE);
    const selected = new Set([TREE[1]!.children[0]!, TREE[1]!.children[1]!]);
    const next = toggle(nodes[1]!, selected);
    expect(next.size).toBe(0);
  });

  it('partial branch → selects all leaf descendants', () => {
    const nodes = buildBrowserTree(TREE);
    const selected = new Set([TREE[1]!.children[0]!]);
    const next = toggle(nodes[1]!, selected);
    expect(next.has(TREE[1]!.children[0]!)).toBe(true);
    expect(next.has(TREE[1]!.children[1]!)).toBe(true);
    expect(next.size).toBe(2);
  });

  it('does not mutate the original set', () => {
    const nodes = buildBrowserTree(TREE);
    const original = new Set<TocNode>();
    toggle(nodes[0]!, original);
    expect(original.size).toBe(0);
  });
});

// ─── coalesce ───────────────────────────────────────────────────────────────

describe('coalesce', () => {
  it('returns empty array when nothing is selected', () => {
    const nodes = buildBrowserTree(TREE);
    expect(coalesce(nodes, new Set())).toEqual([]);
  });

  it('single leaf selection → that leaf as the root', () => {
    const nodes = buildBrowserTree(TREE);
    const results = coalesce(nodes, new Set([TREE[0]!]));
    expect(results).toHaveLength(1);
    expect(results[0]!.subtree).toBe(TREE[0]);
    expect(results[0]!.prefix).toBe('01-');
    expect(results[0]!.ancestors).toEqual([]);
  });

  it('all leaves of a branch selected → branch is the root', () => {
    const nodes = buildBrowserTree(TREE);
    const selected = new Set([TREE[1]!.children[0]!, TREE[1]!.children[1]!]);
    const results = coalesce(nodes, selected);
    expect(results).toHaveLength(1);
    expect(results[0]!.subtree).toBe(TREE[1]);
    expect(results[0]!.prefix).toBe('02-');
    expect(results[0]!.ancestors).toEqual([]);
  });

  it('partially selected branch → individual selected leaves', () => {
    const nodes = buildBrowserTree(TREE);
    const selected = new Set([TREE[1]!.children[0]!]);
    const results = coalesce(nodes, selected);
    expect(results).toHaveLength(1);
    expect(results[0]!.subtree).toBe(TREE[1]!.children[0]);
    expect(results[0]!.prefix).toBe('01-');
    expect(results[0]!.ancestors[0]!.node).toBe(TREE[1]);
  });

  it('disconnected selections produce multiple roots', () => {
    const nodes = buildBrowserTree(TREE);
    const selected = new Set([TREE[0]!, TREE[1]!.children[0]!]);
    const results = coalesce(nodes, selected);
    expect(results).toHaveLength(2);
    expect(results[0]!.subtree).toBe(TREE[0]);
    expect(results[1]!.subtree).toBe(TREE[1]!.children[0]);
  });

  it('all nodes selected → top-level roots are returned as-is', () => {
    const nodes = buildBrowserTree(TREE);
    const selected = new Set([TREE[0]!, TREE[1]!.children[0]!, TREE[1]!.children[1]!]);
    const results = coalesce(nodes, selected);
    expect(results).toHaveLength(2);
    expect(results[0]!.subtree).toBe(TREE[0]);
    expect(results[1]!.subtree).toBe(TREE[1]);
  });
});

// ─── computeLeafCounts ──────────────────────────────────────────────────────

describe('computeLeafCounts', () => {
  it('assigns 1 to every leaf', () => {
    const nodes = buildBrowserTree(TREE);
    const counts = computeLeafCounts(nodes);
    expect(counts.get(nodes[0]!)).toBe(1);
    expect(counts.get(nodes[1]!.children[0]!)).toBe(1);
    expect(counts.get(nodes[1]!.children[1]!)).toBe(1);
  });

  it('sums descendant leaves for branches', () => {
    const nodes = buildBrowserTree(TREE);
    const counts = computeLeafCounts(nodes);
    expect(counts.get(nodes[1]!)).toBe(2);
  });

  it('includes every node in the tree', () => {
    const nodes = buildBrowserTree(TREE);
    const counts = computeLeafCounts(nodes);
    expect(counts.size).toBe(4); // Welcome, Networking, Concepts, Planning
  });

  it('handles deeply nested trees', () => {
    const deep: TocNode[] = [
      branch('A', [branch('B', [branch('C', [leaf('D1', 'd1'), leaf('D2', 'd2')])])]),
    ];
    const nodes = buildBrowserTree(deep);
    const counts = computeLeafCounts(nodes);
    expect(counts.get(nodes[0]!)).toBe(2);
  });
});

// ─── computeSelectedCounts ──────────────────────────────────────────────────

describe('computeSelectedCounts', () => {
  it('returns 0 for all nodes when nothing is selected', () => {
    const nodes = buildBrowserTree(TREE);
    const counts = computeSelectedCounts(nodes, new Set());
    expect(counts.get(nodes[0]!)).toBe(0);
    expect(counts.get(nodes[1]!)).toBe(0);
    expect(counts.get(nodes[1]!.children[0]!)).toBe(0);
  });

  it('returns 1 for a selected leaf', () => {
    const nodes = buildBrowserTree(TREE);
    const counts = computeSelectedCounts(nodes, new Set([TREE[0]!]));
    expect(counts.get(nodes[0]!)).toBe(1);
  });

  it('bubbles selected leaf counts up to ancestors', () => {
    const nodes = buildBrowserTree(TREE);
    const counts = computeSelectedCounts(nodes, new Set([TREE[1]!.children[0]!]));
    expect(counts.get(nodes[1]!.children[0]!)).toBe(1);
    expect(counts.get(nodes[1]!.children[1]!)).toBe(0);
    expect(counts.get(nodes[1]!)).toBe(1);
  });

  it('counts all descendants when every leaf is selected', () => {
    const nodes = buildBrowserTree(TREE);
    const counts = computeSelectedCounts(
      nodes,
      new Set([TREE[1]!.children[0]!, TREE[1]!.children[1]!])
    );
    expect(counts.get(nodes[1]!)).toBe(2);
  });
});

// ─── stateFromCounts ────────────────────────────────────────────────────────

describe('stateFromCounts', () => {
  it('off when selected count is 0', () => {
    expect(stateFromCounts(0, 3)).toBe('off');
  });

  it('on when selected count equals total leaves', () => {
    expect(stateFromCounts(3, 3)).toBe('on');
  });

  it('partial when some but not all leaves are selected', () => {
    expect(stateFromCounts(1, 3)).toBe('partial');
    expect(stateFromCounts(2, 3)).toBe('partial');
  });

  it('agrees with stateOf across tree and selection variants', () => {
    const nodes = buildBrowserTree(TREE);
    const leafCounts = computeLeafCounts(nodes);
    const variants: Set<TocNode>[] = [
      new Set(),
      new Set([TREE[0]!]),
      new Set([TREE[1]!.children[0]!]),
      new Set([TREE[1]!.children[0]!, TREE[1]!.children[1]!]),
      new Set([TREE[0]!, TREE[1]!.children[0]!, TREE[1]!.children[1]!]),
    ];
    for (const sel of variants) {
      const selCounts = computeSelectedCounts(nodes, sel);
      for (const root of nodes) {
        const fast = stateFromCounts(selCounts.get(root)!, leafCounts.get(root)!);
        expect(fast).toBe(stateOf(root, sel));
      }
    }
  });
});
