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
bun test                   # run tests (vitest)
bun run typecheck          # tsc --noEmit
```

## Architecture

### Data flow

```
URL
 → pickProvider(url)          # selects DocProvider by hostname
 → fetchToc(provider, url)    # fetches page HTML, detects split TOC via <meta name="tocs">,
                               # GETs one or more toc-contents.json files, parses to TocNode[]
 → resolveSubtree(tree, href) # depth-first search; returns node + numeric position prefix
 → buildFileTree(subtree, …)  # assigns dirPath/filePath to every node
 → walk(fileTree, …)          # depth-first; writes content.yaml per dir, fetches pages
     → writePage → htmlToMarkdown(html, provider)
```

`run.ts` owns the orchestration loop. Each page is fetched sequentially with a configurable delay.

### Provider pattern

`DocProvider` (`src/providers/types.ts`) is the only abstraction that varies between cloud vendors:

- `matches(url)` — decides which provider owns a URL
- `tocUrl(url)` — derives the TOC JSON endpoint from a page URL
- `startHref(url)` — extracts the filename key used to locate the page in the TOC tree
- `parseToc(json)` — normalises vendor-specific JSON shape into `TocNode[]`
- `guideDir(url)` — returns the relative output directory for the guide (e.g. `AmazonRDS/UserGuide`)
- `contentSelector` — CSS selector for the main content element
- `junkSelectors` — elements to strip before conversion

`aws.ts` is the only implementation. `pickProvider` in `aws.ts` is a linear scan of `providers[]`; adding a new vendor means appending to that array.

### HTML → Markdown pipeline (`scrape.ts`)

Before Turndown runs, two normalisation passes happen:

1. **Tab flattening** (`flattenTabs` in `tabs.ts`) — rewrites AWS `<awsdocs-tabs>` / `<dl>` tab containers to `<h4>label</h4>{panel}` so Turndown emits readable headings instead of raw custom elements.
2. **`<pre>` normalisation** — AWS nests `<code class="replaceable">` and `<span>` inside `<pre><code>`, which confuses Turndown into emitting inline backticks inside fenced blocks. Each `<pre>` is collapsed to `<pre><code>{plain text}</code></pre>` with a language hint inferred from CSS class names before Turndown processes it.

Turndown is configured with ATX headings, fenced code blocks, GFM tables, and `-` bullets.

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
