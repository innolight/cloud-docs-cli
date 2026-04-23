# Feature Plan: Interactive TOC Browser

**Roadmap item:** Milestone 1 ergonomics / Milestone 2 Azure
**Status:** Revised
**Date:** 2026-04-22

---

## Problem Statement

The CLI currently resolves a download subtree by matching a URL against its
`href` in the TOC. This breaks down for **section-header nodes** — nodes that
exist purely as organisational containers and carry no `href`. They appear
throughout Azure (and AWS) TOCs:

```yaml
- children:
    - href: concepts-network     # ← leaf: has a URL, can be targeted
      toc_title: Networking concepts
    - href: plan-networking
      toc_title: Plan networking for AKS
    ...
  toc_title: Networking          # ← section: no href, unreachable by URL
```

Passing `https://learn.microsoft.com/en-us/azure/aks/concepts-network` (a
child of "Networking") downloads only that one page. There is no URL a user
can supply to download the entire "Networking" section, because the section
node has no page.

The deeper problem is flexibility. Even when a parent _does_ have an href,
a user may want only a subset of its children, or may want to combine
disconnected sections (e.g. "Networking" + "Security") into a single run.
The current URL-driven interface gives no affordance for that.

---

## Proposed Solution: Interactive TOC Browser

Add an `--interactive` (or `-i`) flag that, instead of immediately walking
the resolved subtree, opens a terminal tree browser where the user can
navigate the full TOC, toggle nodes for download, and confirm.

```
$ bun run cli pull --interactive https://learn.microsoft.com/en-us/azure/aks/

  Azure Kubernetes Service (AKS)
  ├── [x] What is AKS?
  ├── [ ] Compare AKS with other Azure container options
  ├── [~] Get started with AKS          (3 / 8 selected)
  │    ├── [x] Kubernetes basics
  │    ├── [x] AKS basics
  │    ├── [ ] Core AKS concepts
  │    ...
  ├── [x] Networking                    ← section with no href
  │    ├── [x] Networking concepts
  │    ├── [x] Plan networking for AKS
  │    ...
  ...

  ↑/↓ navigate   space toggle   → expand   ← collapse   enter confirm   q quit
```

The selected set becomes the list of subtrees to download. The run walks each
selected subtree in order, writing output under the same directory structure
as today.

---

## Design Details

### Selection semantics

- Toggling a **branch node** selects/deselects all of its descendant leaf nodes
  recursively.
- A branch shows `[~]` when its descendants are partially selected (some on,
  some off). This state is **derived**, not stored — see State model below.
- Leaf nodes toggle individually.
- **Overlap coalescing:** at confirm time, the selected-leaf set is reduced to
  the minimal covering set of roots. A node becomes a selection root only when
  all of its descendant leaves are selected and no ancestor of the node is
  already a selection root. This ensures disconnected selections never walk the
  same page twice.
- Confirming with zero selections exits without downloading.

### Initial state

| Invocation                | Browser initial state                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Trailing-slash / root URL | Everything **deselected**, tree collapsed to top-level                                                      |
| Specific-page URL         | Subtree rooted at the resolved node **fully selected**, all ancestor nodes **expanded**, cursor on the node |

The trailing-slash default is deliberately conservative: interactive mode on a
full guide is "narrow down from nothing." Starting fully selected on a 300-node
guide invites accidental mass downloads.

When a specific-page URL is given and the user confirms immediately, the result
is identical to running without `--interactive`.

### Multiple disconnected selections

The user can select any combination of nodes regardless of ancestry. After
coalescing (see above), each root becomes an independent subtree download.
Output directories are nested exactly as today, based on each root's position in
the ancestors chain.

### Keyboard controls

| Key                  | Action                                                    |
| -------------------- | --------------------------------------------------------- |
| `↑` / `↓`, `k` / `j` | Move cursor                                               |
| `→` / `l`            | Expand node (no-op if leaf or already expanded)           |
| `←` / `h`            | Collapse node; on a leaf, jump to and collapse its parent |
| `space`              | Toggle selection at cursor                                |
| `a`                  | Select all descendant leaves under cursor node            |
| `n`                  | Deselect all descendant leaves under cursor node          |
| `enter`              | Confirm and start download                                |
| `q` / `ctrl-c`       | Quit without downloading                                  |

`esc` is **not** mapped to quit — it conventionally means "cancel current
action" and is reserved for future use (e.g. dismissing a search overlay).

---

## Technical Approach

### Terminal UI library: Ink

Use **Ink** (React-based terminal renderer) with `useInput` for key handling,
`useApp` for controlled exit, and `<Box>`/`<Text>` components for layout.
Flexbox layout (`justifyContent="space-between"`) renders the right-aligned
`(3 / 8 selected)` metadata trivially; the `[~]` glyph is a plain string in
a `<Text>` component.

**Tradeoff:** Ink adds `react` and `ink` as runtime dependencies and increases
the esbuild bundle by roughly 400–600 KB. This is acceptable for a CLI tool.

**Required config changes:**

- `tsconfig.json`: add `"jsx": "react-jsx"` and `"jsxImportSource": "react"`.
- `package.json`: add `ink`, `react` to `dependencies`; add `ink-testing-library`
  and `@types/react` to `devDependencies`.

### Non-TTY guard

If `--interactive` is passed but `process.stdout.isTTY` is falsy (e.g. CI,
piped output), exit immediately with:

```
Error: --interactive requires a TTY. Remove the flag or run in a terminal.
```

Silent fallback to non-interactive would mask stale flags in CI scripts.

### Orchestration refactor in `run.ts`

`run()` currently couples TOC fetch, subtree resolution, and the walk loop.
Interactive mode must inject a selection step between fetch and walk, and must
walk **one or more** pre-resolved subtrees. The refactor splits `run.ts` into
three exported functions and keeps `run()` as a thin wrapper:

```
fetchGuideToc(url, deps)
  → { provider, tree, pageBaseUrl }

resolveSelections(tree, startHref | null, fallbackTitle)
  → ResolvedSelection[]       ← array; non-interactive returns exactly one

walkSelections(selections, { provider, pageBaseUrl, outDir, delayMs, deps })
  → Stats

run(opts)                     ← unchanged signature; composes the three above
```

`ResolvedSelection` is the existing `{ subtree, prefix, ancestors }` tuple,
renamed and array-lifted. All existing `run()` tests continue to pass.

### Data flow (interactive path)

```
URL
 → pickProvider(url)
 → fetchGuideToc(provider, url, deps)
     returns: { provider, tree, pageBaseUrl }
 → [--interactive] openTocBrowser(tree, { initialHref })
     returns: ResolvedSelection[]   ← coalesced at confirm time
 → walkSelections(selections, { provider, pageBaseUrl, outDir, delayMs, deps })
```

### State model

The browser keeps a single **`Set<TocNode>` of selected leaf nodes** as the
source of truth. Branch selection state is always **derived**:

```ts
function stateOf(node: BrowserNode, selected: Set<TocNode>): 'on' | 'off' | 'partial' {
  if (node.children.length === 0) {
    return selected.has(node.toc) ? 'on' : 'off';
  }
  const childStates = node.children.map((c) => stateOf(c, selected));
  if (childStates.every((s) => s === 'on')) return 'on';
  if (childStates.every((s) => s === 'off')) return 'off';
  return 'partial';
}
```

`toggle(node, selected)` walks the subtree and adds or removes leaf nodes from
the set. Because the set is the only mutable state, re-renders are pure — the
React component receives `selected` as a prop and derives everything from it.

```ts
interface BrowserNode {
  toc: TocNode;
  expanded: boolean;
  children: BrowserNode[];
  // Eagerly computed at tree construction (stable for a given TOC):
  prefix: string;
  ancestors: { node: TocNode; prefix: string }[];
}
```

Prefix and ancestors are computed in a single pass over the `TocNode[]` tree
at `BrowserNode` construction time, using the same sibling-index logic as
`resolveSubtree` in `toc.ts`. At confirm time the browser maps each selection
root to its stored `{ prefix, ancestors }` to produce a `ResolvedSelection[]`.

### Viewport and scroll

Azure TOCs can exceed 300 nodes. Ink does not scroll automatically.

The visible window is clamped to `stdout.rows - reservedLines` (header + footer
key-hint bar). The browser tracks a `viewportOffset` integer in state:

- Moving the cursor above the window decrements `viewportOffset`.
- Moving below increments it.
- A `⋯ N more above` / `⋯ N more below` hint line is shown when nodes are
  hidden in either direction.

`stdout.rows` is read via Ink's `useStdout` hook and the viewport is
recomputed on `SIGWINCH` (terminal resize).

### Terminal width

When a rendered row (indent + glyph + title + right metadata) exceeds
`stdout.columns`, the **title is hard-truncated with `…`**. The right-side
metadata (e.g. `(3 / 8 selected)`) takes priority and is never truncated.
No wrapping; the one-line-per-node model is preserved.

---

## Implementation Pieces

1. **`src/tui/browser.ts`** — pure state: `BrowserNode` tree construction
   (prefix/ancestors computed eagerly), `toggle`, `stateOf`, `coalesce →
ResolvedSelection[]`. No I/O; fully unit-testable with Vitest.
2. **`src/tui/app.tsx`** — Ink component. Owns state via `useReducer`.
   Keys via `useInput`. Viewport math via `useStdout` + `SIGWINCH`. Renders
   a fixed-height window of `BrowserNode` rows with scroll hints.
3. **`src/tui/index.ts`** — `openTocBrowser(tree, opts) → Promise<ResolvedSelection[]>`.
   Renders the Ink app; resolves on confirm (with selections) or quit (empty
   array). Accepts optional `stdin`/`stdout` for testing.
4. **`src/run.ts`** — extract `fetchGuideToc`, `resolveSelections`,
   `walkSelections`; keep `run()` as the composed non-interactive wrapper.
5. **`src/cli.ts`** — add `-i, --interactive` flag; add TTY guard; compose
   `fetchGuideToc → openTocBrowser → walkSelections` for the interactive path.
6. **`tsconfig.json`** — add `"jsx": "react-jsx"`, `"jsxImportSource": "react"`.
7. **`package.json`** — add `ink`, `react` (runtime deps); add
   `ink-testing-library`, `@types/react` (dev deps).
8. **Tests:**
   - `src/tui/browser.test.ts` — toggle, stateOf, coalesce (Vitest, no Ink).
   - `src/tui/app.test.tsx` — key-sequence tests via `ink-testing-library`:
     initial state, partial-branch render, viewport scroll, narrow-terminal
     truncation, confirm returns expected selections, quit returns empty.
   - `src/run.test.ts` — existing tests unchanged; add tests for
     `walkSelections` with multiple `ResolvedSelection[]` entries.

---

## Out of Scope

- Mouse support.
- Search / filter within the TOC (reserve `/` as the trigger for a future
  iteration).
- Persisting a selection to a config file for replay (`--config` from roadmap
  item 12 is a better home for that).
- Global select-all. A global `a` would silently queue hundreds of HTTP
  requests; the branch-scoped `a` / `n` is sufficient.
- Non-interactive `--depth N` climb (separate, simpler change if needed as a
  quick escape hatch before this ships).
