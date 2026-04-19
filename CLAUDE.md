# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
bun install                # install dependencies
bun run build              # bundle into dist/index.cjs (zero-dependency)
bun run cli pull <url>     # run dev CLI (tsx src/cli.ts)
node dist/index.cjs --help # run bundled CLI
bun test                   # run tests (vitest)
bun run typecheck          # tsc --noEmit
```

## Architecture

### Data flow

```
URL
 → pickProvider(url)          # selects DocProvider by hostname
 → fetchToc(provider, url)    # GETs toc-contents.json, parses to TocNode[]
 → findSubtree(tree, href)    # depth-first search for the input page's node
 → walk(subtree, …)           # depth-first; nodes with children become dirs
     → writePage → htmlToMarkdown(html, provider)
```

`run.ts` owns the orchestration loop. Each page is fetched sequentially with a configurable delay.

### Provider pattern

`DocProvider` (`src/providers/types.ts`) is the only abstraction that varies between cloud vendors:

- `matches(url)` — decides which provider owns a URL
- `tocUrl(url)` — derives the TOC JSON endpoint from a page URL
- `startHref(url)` — extracts the filename key used to locate the page in the TOC tree
- `parseToc(json)` — normalises vendor-specific JSON shape into `TocNode[]`
- `contentSelector` — CSS selector for the main content element
- `junkSelectors` — elements to strip before conversion

`aws.ts` is the only implementation. `pickProvider` in `aws.ts` is a linear scan of `providers[]`; adding a new vendor means appending to that array.

### HTML → Markdown pipeline (`scrape.ts`)

Before Turndown runs, two normalisation passes happen:

1. **Tab flattening** (`flattenTabs` in `tabs.ts`) — rewrites AWS `<awsdocs-tabs>` / `<dl>` tab containers to `<h4>label</h4>{panel}` so Turndown emits readable headings instead of raw custom elements.
2. **`<pre>` normalisation** — AWS nests `<code class="replaceable">` and `<span>` inside `<pre><code>`, which confuses Turndown into emitting inline backticks inside fenced blocks. Each `<pre>` is collapsed to `<pre><code>{plain text}</code></pre>` with a language hint inferred from CSS class names before Turndown processes it.

Turndown is configured with ATX headings, fenced code blocks, GFM tables, and `-` bullets.

### Output layout

Nodes with children become subdirectories named after the sanitised title; leaf nodes become `.md` files. A node that has both children and an `href` writes its own page as `<dir>/<title>.md` alongside its children's directory. Resume works by checking file existence before fetching.
