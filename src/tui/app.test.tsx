import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { render } from 'ink-testing-library';
import type { TocNode } from '../providers/types.ts';
import { TocBrowserApp } from './app.tsx';

const leaf = (title: string, href: string): TocNode => ({ title, href, children: [] });
const branch = (title: string, children: TocNode[]): TocNode => ({
  title,
  href: null,
  children,
});

const SIMPLE_TREE: TocNode[] = [
  leaf('Welcome', 'welcome.html'),
  branch('Networking', [
    leaf('Concepts', 'concepts.html'),
    leaf('Planning', 'planning.html'),
  ]),
];

// ─── Initial render ──────────────────────────────────────────────────────────

describe('TocBrowserApp — initial render', () => {
  it('renders each top-level node title', async () => {
    const { lastFrame } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    expect(lastFrame()).toContain('Welcome');
    expect(lastFrame()).toContain('Networking');
  });

  it('renders [ ] checkbox for unselected nodes', async () => {
    const { lastFrame } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    expect(lastFrame()).toContain('[ ]');
  });

  it('shows the key-hint bar', async () => {
    const { lastFrame } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    const frame = lastFrame() ?? '';
    expect(frame).toContain('space');
    expect(frame).toContain('enter');
    expect(frame).toContain('q');
    expect(frame).not.toContain('a all');
    expect(frame).not.toContain('n none');
  });

  it('does not render children of collapsed branch nodes', async () => {
    const { lastFrame } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    expect(lastFrame()).not.toContain('Concepts');
    expect(lastFrame()).not.toContain('Planning');
  });
});

// ─── Keyboard navigation ─────────────────────────────────────────────────────

describe('TocBrowserApp — navigation', () => {
  it('expands a branch node with l (right)', async () => {
    const { lastFrame, stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write('j'); // move to Networking
    stdin.write('l'); // expand
    expect(lastFrame()).toContain('Concepts');
    expect(lastFrame()).toContain('Planning');
  });

  it('collapses an expanded branch with h (left)', async () => {
    const { lastFrame, stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write('j');
    stdin.write('l'); // expand
    expect(lastFrame()).toContain('Concepts');
    stdin.write('h'); // collapse
    expect(lastFrame()).not.toContain('Concepts');
  });

  it('moves cursor to child after expand and down', async () => {
    const { lastFrame, stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write('j'); // Networking
    stdin.write('l'); // expand Networking
    stdin.write('j'); // move into Concepts
    stdin.write(' '); // select Concepts
    expect(lastFrame()).toContain('[x]');
  });
});

// ─── Selection ───────────────────────────────────────────────────────────────

describe('TocBrowserApp — selection', () => {
  it('space toggles a leaf node to selected', async () => {
    const { lastFrame, stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write(' ');
    expect(lastFrame()).toContain('[x]');
  });

  it('space deselects an already-selected leaf node', async () => {
    const { lastFrame, stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write(' '); // select
    stdin.write(' '); // deselect
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('[x]');
    expect(frame).toContain('[ ]');
  });

  it('selecting all children of a branch renders [x] on the branch', async () => {
    const { lastFrame, stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write('j'); // Networking
    stdin.write('l'); // expand
    stdin.write('j'); // Concepts
    stdin.write(' '); // select
    stdin.write('j'); // Planning
    stdin.write(' '); // select
    stdin.write('k'); // back to Concepts
    stdin.write('k'); // back to Networking
    expect(lastFrame()).toContain('[x]');
  });

  it('partially selecting children renders [~] on the branch', async () => {
    const { lastFrame, stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write('j'); // Networking
    stdin.write('l'); // expand
    stdin.write('j'); // Concepts
    stdin.write(' '); // select only Concepts
    stdin.write('k'); // back to Networking
    expect(lastFrame()).toContain('[~]');
  });
});

// ─── Confirm and quit ────────────────────────────────────────────────────────

describe('TocBrowserApp — confirm and quit', () => {
  it('enter calls onConfirm with coalesced selections', async () => {
    const onConfirm = vi.fn();
    const { stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={onConfirm} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write(' '); // select Welcome
    stdin.write('\r'); // enter
    expect(onConfirm).toHaveBeenCalledOnce();
    const [selections] = onConfirm.mock.calls[0]!;
    expect(selections).toHaveLength(1);
    expect(selections[0].subtree.title).toBe('Welcome');
  });

  it('enter with no selection calls onConfirm with empty array', async () => {
    const onConfirm = vi.fn();
    const { stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={onConfirm} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write('\r');
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it('q calls onQuit', async () => {
    const onQuit = vi.fn();
    const { stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={onQuit} />
    );
    await act(async () => {});
    stdin.write('q');
    expect(onQuit).toHaveBeenCalledOnce();
  });
});

// ─── initialHref ─────────────────────────────────────────────────────────────

describe('TocBrowserApp — initialHref', () => {
  it('pre-selects the subtree rooted at initialHref leaf', async () => {
    const { lastFrame } = render(
      <TocBrowserApp
        tree={SIMPLE_TREE}
        initialHref="planning.html"
        onConfirm={vi.fn()}
        onQuit={vi.fn()}
      />
    );
    await act(async () => {});
    // Networking is expanded; Planning is visible and selected; Networking is partial
    expect(lastFrame()).toContain('Planning');
    expect(lastFrame()).toContain('[~]'); // Networking partially selected (only Planning)
  });

  it('expands all ancestors of the initialHref node', async () => {
    const { lastFrame } = render(
      <TocBrowserApp
        tree={SIMPLE_TREE}
        initialHref="concepts.html"
        onConfirm={vi.fn()}
        onQuit={vi.fn()}
      />
    );
    await act(async () => {});
    expect(lastFrame()).toContain('Concepts');
    expect(lastFrame()).toContain('Planning');
  });

  it('confirming immediately returns only the initialHref subtree', async () => {
    const onConfirm = vi.fn();
    const { stdin } = render(
      <TocBrowserApp
        tree={SIMPLE_TREE}
        initialHref="planning.html"
        onConfirm={onConfirm}
        onQuit={vi.fn()}
      />
    );
    await act(async () => {});
    stdin.write('\r');
    expect(onConfirm).toHaveBeenCalledOnce();
    const [selections] = onConfirm.mock.calls[0]!;
    expect(selections).toHaveLength(1);
    expect(selections[0].subtree.title).toBe('Planning');
  });

  it('falls back to empty/collapsed state when initialHref is not found', async () => {
    const { lastFrame } = render(
      <TocBrowserApp
        tree={SIMPLE_TREE}
        initialHref="nonexistent.html"
        onConfirm={vi.fn()}
        onQuit={vi.fn()}
      />
    );
    await act(async () => {});
    expect(lastFrame()).not.toContain('[x]');
    expect(lastFrame()).not.toContain('Concepts');
  });
});

// ─── Global selection count ──────────────────────────────────────────────────

describe('TocBrowserApp — global selection count', () => {
  it('shows 0 / N selected when nothing is selected', async () => {
    const { lastFrame } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    expect(lastFrame()).toContain('0 / 3 selected');
  });

  it('updates count after selecting a leaf', async () => {
    const { lastFrame, stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write(' '); // select Welcome
    expect(lastFrame()).toContain('1 / 3 selected');
  });

  it('updates count after selecting all descendants of a branch', async () => {
    const { lastFrame, stdin } = render(
      <TocBrowserApp tree={SIMPLE_TREE} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    stdin.write('j'); // Networking
    stdin.write(' '); // toggle — selects all leaves (Concepts + Planning)
    expect(lastFrame()).toContain('2 / 3 selected');
  });
});

// ─── Scrolloff ───────────────────────────────────────────────────────────────

describe('TocBrowserApp — scrolloff', () => {
  it('scrolls viewport so SCROLLOFF rows remain above cursor when navigating up', async () => {
    // initialHref at item-15 sets state.viewportOffset=15; navigating up to index 4
    // should scroll the viewport back toward 0 rather than pinning cursor to the top edge.
    const bigTree: TocNode[] = Array.from({ length: 30 }, (_, i) =>
      leaf(`Item ${i}`, `item-${i}.html`)
    );
    const { lastFrame, stdin } = render(
      <TocBrowserApp
        tree={bigTree}
        initialHref="item-15.html"
        onConfirm={vi.fn()}
        onQuit={vi.fn()}
      />
    );
    await act(async () => {});

    // Navigate up 11 times: cursor 15 → 4
    for (let i = 0; i < 11; i++) stdin.write('k');

    // With SCROLLOFF=4, cursor at index 4 means viewportOffset scrolls to 0 — nothing hidden above.
    expect(lastFrame()).not.toContain('more above');
  });
});

// ─── Footer position ─────────────────────────────────────────────────────────

describe('TocBrowserApp — footer position', () => {
  it('hint line appears at terminal bottom when list is shorter than viewport', async () => {
    const smallTree = Array.from({ length: 5 }, (_, i) =>
      leaf(`Item ${i}`, `item-${i}.html`)
    );
    const { lastFrame } = render(
      <TocBrowserApp tree={smallTree} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    const lines = (lastFrame() ?? '').split('\n');
    // HINT line must sit at or after viewportHeight (rows=24 fallback, RESERVED_LINES=3 → 21)
    const hintLineIdx = lines.findIndex(l => l.includes('move') && l.includes('quit'));
    expect(hintLineIdx).toBeGreaterThanOrEqual(21);
  });
});

// ─── Viewport height does not overflow terminal ───────────────────────────────

describe('TocBrowserApp — viewport fits terminal height', () => {
  it('rendered line count stays at least one line under terminal rows when scrolled mid-list', async () => {
    const bigTree: TocNode[] = Array.from({ length: 30 }, (_, i) =>
      leaf(`Item ${i}`, `item-${i}.html`)
    );
    // item-8 puts the cursor in the middle: both "more above" and "more below"
    // indicators appear and must not push total lines to the terminal height.
    const { lastFrame } = render(
      <TocBrowserApp
        tree={bigTree}
        initialHref="item-8.html"
        onConfirm={vi.fn()}
        onQuit={vi.fn()}
      />
    );
    await act(async () => {});

    const frame = lastFrame() ?? '';
    const lineCount = frame.split('\n').length;
    // App defaults rows=24 when stdout.rows is undefined. Ink's render path
    // falls back to ansiEscapes.clearTerminal (whole-screen flicker on every
    // keystroke) as soon as outputHeight >= stdout.rows, so we must stay at
    // least one line under the terminal height.
    expect(lineCount).toBeLessThanOrEqual(23);
  });

  it('short list also stays under terminal rows', async () => {
    const smallTree = Array.from({ length: 5 }, (_, i) =>
      leaf(`Item ${i}`, `item-${i}.html`)
    );
    const { lastFrame } = render(
      <TocBrowserApp tree={smallTree} onConfirm={vi.fn()} onQuit={vi.fn()} />
    );
    await act(async () => {});
    const lineCount = (lastFrame() ?? '').split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(23);
  });
});

