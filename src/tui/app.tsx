import React, { useReducer, useCallback, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { TocNode } from '../providers/types.ts';
import {
  buildBrowserTree,
  stateOf,
  toggle,
  coalesce,
  type BrowserNode,
  type ResolvedSelection,
} from './browser.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface State {
  roots: BrowserNode[];
  selected: Set<TocNode>;
  cursorIndex: number; // index into the flat visible list
  viewportOffset: number;
}

type Action =
  | { type: 'MOVE'; delta: -1 | 1 }
  | { type: 'EXPAND' }
  | { type: 'COLLAPSE' }
  | { type: 'TOGGLE' };

// ─── Flat visible list ───────────────────────────────────────────────────────

function flattenVisible(nodes: BrowserNode[]): BrowserNode[] {
  const result: BrowserNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.expanded) result.push(...flattenVisible(node.children));
  }
  return result;
}

function findParent(roots: BrowserNode[], target: BrowserNode): BrowserNode | null {
  for (const node of roots) {
    if (node.children.includes(target)) return node;
    const found = findParent(node.children, target);
    if (found) return found;
  }
  return null;
}

function setExpanded(roots: BrowserNode[], target: BrowserNode, value: boolean): BrowserNode[] {
  return roots.map((node) => {
    if (node === target) return { ...node, expanded: value };
    if (node.children.length > 0) {
      const children = setExpanded(node.children, target, value);
      return { ...node, children };
    }
    return node;
  });
}

// ─── Initial state helpers ───────────────────────────────────────────────────

function expandToHref(
  roots: BrowserNode[],
  href: string
): { expandedRoots: BrowserNode[]; target: BrowserNode | null } {
  for (let i = 0; i < roots.length; i++) {
    const node = roots[i]!;
    if (node.toc.href === href) {
      return { expandedRoots: roots, target: node };
    }
    if (node.children.length > 0) {
      const { expandedRoots: newChildren, target } = expandToHref(node.children, href);
      if (target) {
        const newRoots = [...roots];
        newRoots[i] = { ...node, expanded: true, children: newChildren };
        return { expandedRoots: newRoots, target };
      }
    }
  }
  return { expandedRoots: roots, target: null };
}

function buildInitialState(tree: TocNode[], initialHref?: string): State {
  const roots = buildBrowserTree(tree);
  const empty: State = { roots, selected: new Set<TocNode>(), cursorIndex: 0, viewportOffset: 0 };

  if (!initialHref) return empty;

  const { expandedRoots, target } = expandToHref(roots, initialHref);
  if (!target) return empty;

  const selected = new Set<TocNode>();
  addAllLeaves(target, selected);

  const visible = flattenVisible(expandedRoots);
  const cursorIndex = Math.max(0, visible.indexOf(target));

  const parentToc = target.ancestors.length > 0
    ? target.ancestors[target.ancestors.length - 1]!.node
    : null;
  const viewportOffset = parentToc
    ? Math.max(0, visible.findIndex((n) => n.toc === parentToc))
    : cursorIndex;

  return { roots: expandedRoots, selected, cursorIndex, viewportOffset };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function reducer(state: State, action: Action): State {
  const visible = flattenVisible(state.roots);
  const cursor = state.cursorIndex;
  const node = visible[cursor];

  switch (action.type) {
    case 'MOVE': {
      const next = clamp(cursor + action.delta, 0, visible.length - 1);
      return { ...state, cursorIndex: next };
    }

    case 'EXPAND': {
      if (!node || node.children.length === 0 || node.expanded) return state;
      const roots = setExpanded(state.roots, node, true);
      return { ...state, roots };
    }

    case 'COLLAPSE': {
      if (!node) return state;
      if (node.children.length > 0 && node.expanded) {
        const roots = setExpanded(state.roots, node, false);
        return { ...state, roots };
      }
      // On a leaf, jump to parent and collapse it
      const parent = findParent(state.roots, node);
      if (!parent) return state;
      const roots = setExpanded(state.roots, parent, false);
      const newVisible = flattenVisible(roots);
      const parentIdx = newVisible.indexOf(parent);
      return { ...state, roots, cursorIndex: clamp(parentIdx, 0, newVisible.length - 1) };
    }

    case 'TOGGLE': {
      if (!node) return state;
      return { ...state, selected: toggle(node, state.selected) };
    }

  }
}

function addAllLeaves(node: BrowserNode, set: Set<TocNode>): void {
  if (node.children.length === 0) {
    set.add(node.toc);
    return;
  }
  for (const child of node.children) addAllLeaves(child, set);
}

// ─── Row rendering ───────────────────────────────────────────────────────────

const CHECKBOX: Record<'on' | 'off' | 'partial', string> = {
  on: '[x]',
  off: '[ ]',
  partial: '[~]',
};

interface RowProps {
  node: BrowserNode;
  selected: Set<TocNode>;
  isCursor: boolean;
  columns: number;
}

function Row({ node, selected, isCursor, columns }: RowProps): React.JSX.Element {
  const depth = node.ancestors.length;
  const indent = '  '.repeat(depth);
  const state = stateOf(node, selected);
  const checkbox = CHECKBOX[state];
  const arrow = node.children.length > 0 ? (node.expanded ? '▾ ' : '▸ ') : '  ';

  const rightMeta =
    node.children.length > 0
      ? (() => {
          const leaves = countLeaves(node);
          const sel = countSelectedLeaves(node, selected);
          return sel > 0 && sel < leaves ? `  (${sel} / ${leaves} selected)` : '';
        })()
      : '';

  const prefixPart = `${indent}${checkbox} ${arrow}`;
  const available = columns - prefixPart.length - rightMeta.length - 1;
  const title =
    node.toc.title.length > available
      ? node.toc.title.slice(0, available - 1) + '…'
      : node.toc.title;

  return (
    <Box>
      <Text inverse={isCursor}>
        {prefixPart}
        {title}
        {rightMeta}
      </Text>
    </Box>
  );
}

function countLeaves(node: BrowserNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

function countSelectedLeaves(node: BrowserNode, selected: Set<TocNode>): number {
  if (node.children.length === 0) return selected.has(node.toc) ? 1 : 0;
  return node.children.reduce((sum, c) => sum + countSelectedLeaves(c, selected), 0);
}

// ─── Main component ───────────────────────────────────────────────────────────

const RESERVED_LINES = 3; // footer: blank line + count + hint (hint must fit in 80 cols)
const SCROLLOFF = 4; // rows of context kept above/below cursor (like vim scrolloff)
const HINT = '↑↓/jk: move  ←→/hl: fold  space: toggle  enter: confirm  q: quit';

interface TocBrowserAppProps {
  tree: TocNode[];
  initialHref?: string;
  onConfirm: (selections: ResolvedSelection[]) => void;
  onQuit: () => void;
}

export function TocBrowserApp({ tree, initialHref, onConfirm, onQuit }: TocBrowserAppProps): React.JSX.Element {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;

  const [state, dispatch] = useReducer(reducer, undefined, () =>
    buildInitialState(tree, initialHref)
  );

  // Always-current reference so the useInput callback never reads stale state.
  const stateRef = useRef(state);
  stateRef.current = state;

  const visible = flattenVisible(state.roots);

  const rawViewportHeight = Math.max(1, rows - RESERVED_LINES);
  // Each scroll indicator ("⋯ N more above/below") occupies one line.
  // When both are shown, total lines = rawViewportHeight + 2 + RESERVED_LINES,
  // which overflows the terminal. Reserve those 2 lines upfront when the list
  // overflows so the terminal never gets a scroll bar.
  const viewportHeight = visible.length > rawViewportHeight
    ? Math.max(1, rawViewportHeight - 2)
    : rawViewportHeight;

  // Keep viewport tracking cursor with scrolloff (mutually exclusive conditions ensured by effectiveSO)
  const effectiveSO = Math.min(SCROLLOFF, Math.floor(viewportHeight / 2));
  let viewportOffset = state.viewportOffset;
  if (state.cursorIndex < viewportOffset + effectiveSO)
    viewportOffset = Math.max(0, state.cursorIndex - effectiveSO);
  const maxOffset = Math.max(0, visible.length - viewportHeight);
  if (state.cursorIndex >= viewportOffset + viewportHeight - effectiveSO)
    viewportOffset = Math.min(maxOffset, state.cursorIndex - viewportHeight + 1 + effectiveSO);

  const visibleSlice = visible.slice(viewportOffset, viewportOffset + viewportHeight);
  const hiddenAbove = viewportOffset;
  const hiddenBelow = visible.length - viewportOffset - viewportHeight;
  const padLines = Math.max(
    0,
    viewportHeight
      - (hiddenAbove > 0 ? 1 : 0)
      - visibleSlice.length
      - (hiddenBelow > 0 ? 1 : 0)
  );

  const handleInput = useCallback(
    (input: string, key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean; return: boolean }) => {
      if (key.upArrow || input === 'k') dispatch({ type: 'MOVE', delta: -1 });
      else if (key.downArrow || input === 'j') dispatch({ type: 'MOVE', delta: 1 });
      else if (key.rightArrow || input === 'l') dispatch({ type: 'EXPAND' });
      else if (key.leftArrow || input === 'h') dispatch({ type: 'COLLAPSE' });
      else if (input === ' ') dispatch({ type: 'TOGGLE' });
      else if (key.return || input === '\r')
        onConfirm(coalesce(stateRef.current.roots, stateRef.current.selected));
      else if (input === 'q') onQuit();
    },
    [onConfirm, onQuit]
  );

  useInput(handleInput);

  return (
    <Box flexDirection="column">
      {hiddenAbove > 0 && (
        <Box>
          <Text dimColor>{`  ⋯ ${hiddenAbove} more above`}</Text>
        </Box>
      )}
      {visibleSlice.map((node, i) => (
        <Row
          key={node.prefix + node.toc.title}
          node={node}
          selected={state.selected}
          isCursor={viewportOffset + i === state.cursorIndex}
          columns={columns}
        />
      ))}
      {hiddenBelow > 0 && (
        <Box>
          <Text dimColor>{`  ⋯ ${hiddenBelow} more below`}</Text>
        </Box>
      )}
      <Box height={padLines} />
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {state.roots.reduce((s, n) => s + countSelectedLeaves(n, state.selected), 0)} /{' '}
          {state.roots.reduce((s, n) => s + countLeaves(n), 0)} selected
        </Text>
        <Text dimColor>{HINT}</Text>
      </Box>
    </Box>
  );
}
