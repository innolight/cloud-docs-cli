# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Behavioural Guidelines

- **Must use Test Driven Development.** Write a failing test first, confirm it fails, then write the minimum code to make it pass. Do not write implementation code before there is a test that requires it.

## Commands

```sh
bun install                # install dependencies
bun run build              # bundle into dist/index.js (zero-dependency)
bun run cli pull <url>     # run dev CLI (tsx src/cli.ts)
node dist/index.js --help # run bundled CLI
bun run test               # run tests (vitest)
bun run typecheck          # tsc --noEmit
```

### `pull` flags

| Flag                | Default | Description                                            |
| ------------------- | ------- | ------------------------------------------------------ |
| `-o, --out <dir>`   | `./out` | Output directory                                       |
| `--delay <ms>`      | `500`   | Delay between requests                                 |
| `-i, --interactive` | off     | Open TUI TOC browser to select subtrees (requires TTY) |
| `--dry-run`         | off     | Print planned file tree without writing anything       |

## Architecture

### Data flow

```
URL
 → pickProvider(url)              # selects DocProvider by hostname (registry.ts)
 → fetchToc(provider, url)        # calls provider.discoverTocUrls() to find TOC JSON URL(s),
                                   # GETs each, calls provider.parseToc() → TocNode[]
 → resolveSubtree(tree, href)     # depth-first search; returns node + numeric position prefix
 → buildFileTree(subtree, …)      # assigns dirPath/filePath to every node
 → walk(fileTree, …)              # depth-first; writes content.yaml per dir, fetches pages
     → writePage → htmlToMarkdown(html, provider)
```

`run.ts` owns the orchestration loop. Each page is fetched sequentially with a configurable delay. In `--dry-run` mode, `dryWalk` logs the planned file tree and counts pages without fetching or writing.

### Provider pattern

`DocProvider` (`src/providers/types.ts`) is the only abstraction that varies between cloud vendors:

- `matches(url)` — decides which provider owns a URL
- `discoverTocUrls(url, fetchText)` — fetches the entry page and returns one or more TOC source URLs (e.g. reads `<meta name="tocs">` for AWS split-TOC guides, `<meta name="toc_rel">` for Azure; GCP returns the page URL itself since the TOC is embedded in the HTML)
- `startHref(url)` — extracts the filename key used to locate the page in the TOC tree
- `parseToc(raw: string)` — parses the raw response (JSON text for AWS/Azure, HTML for GCP) into `TocNode[]`
- `guideDir(url)` — returns the relative output directory for the guide (e.g. `AmazonRDS/UserGuide`)
- `contentSelector` — CSS selector for the main content element
- `junkSelectors` — elements to strip before conversion
- `preprocessHtml?($, $main)` — optional vendor-specific HTML cleanup called after junk removal, before Turndown runs (e.g. tab flattening, `<pre>` normalisation, alert block transformation)

`providers/registry.ts` holds `providers[]` and exports `pickProvider` (linear scan). Current implementations:

- `aws.ts` — `docs.aws.amazon.com`
- `azure.ts` — `learn.microsoft.com`
- `gcp.ts` — `cloud.google.com`, `docs.cloud.google.com`

Adding a new vendor means implementing `DocProvider` and appending to `providers[]` in `registry.ts`.

### HTML → Markdown pipeline (`scrape.ts`)

`htmlToMarkdown` does the following in order:

1. Loads HTML with Cheerio, selects `provider.contentSelector`, strips `provider.junkSelectors`.
2. Calls `provider.preprocessHtml?.($, $main)` for vendor-specific cleanup. AWS's implementation:
   - Removes the first `<h1>` (duplicates the TOC title prepended at write time).
   - **Tab flattening** (`flattenTabs` in `aws.ts`) — rewrites `<awsdocs-tabs>/<dl>`, `[role="tablist"]`, and legacy `div.awsdocs-tab-container` patterns to `<h4>label</h4>{panel}`.
   - **`<pre>` normalisation** — collapses nested `<code>`/`<span>` inside `<pre>` to plain text with a language hint inferred from CSS class names. `<pre>` inside table cells become inline `<code>` spans joined with `<br>` (fenced blocks break GFM pipe rows).
     Azure's implementation flattens role-based tabs and rewrites `div.NOTE/TIP/IMPORTANT/…` alert blocks to `<blockquote>`.
3. Runs Turndown with ATX headings, fenced code blocks, GFM tables, and `-` bullets. A custom `tableCell` rule collapses newlines inside cells to spaces so multi-paragraph cells don't break pipe-table rows.

### Interactive TUI (`tui/`)

When `--interactive` is passed, `openTocBrowser` (Ink/React) renders a terminal TOC browser. The user can navigate the tree and confirm one or more subtree selections. The resolved selections are passed to `walkSelections` exactly as the non-interactive path would produce from `resolveSelections`. Key modules:

- `tui/app.tsx` — React component tree for the browser
- `tui/browser.ts` — selection resolution logic; exports `ResolvedSelection`
- `tui/index.ts` — entry point; wraps Ink's `render` in a Promise

### Output layout

Nodes with children become subdirectories; leaf nodes become `.md` files. A node that has both children and an `href` writes its own page as `<dir>/00-<title>.md` inside that directory. Each directory also gets a `content.yaml` TOC snapshot. Resume works by checking file existence before fetching.

## Verifying changes

After refactoring or making significant changes, use the output comparison script to confirm the CLI still produces identical results.

### Workflow

1. Pull a known guide into a baseline folder (skip if one already exists):
   ```sh
   bun run cli pull -o .outv2 https://docs.aws.amazon.com/AmazonS3/latest/userguide/cost-optimization.html
   ```
2. Pull the same URL into a new folder using the updated code:
   ```sh
   bun run cli pull -o .outv3 https://docs.aws.amazon.com/AmazonS3/latest/userguide/cost-optimization.html
   ```
3. Run the comparison script:
   ```sh
   bun scripts/compare-outputs.ts .outv2 .outv3
   ```

The script exits `0` if all files are identical, or `1` and prints a diff summary if there are missing, extra, or changed files. The `.outv2` / `.outv3` directories are git-ignored.
