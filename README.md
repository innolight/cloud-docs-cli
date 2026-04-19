# cloud-docs-cli

Mirror cloud provider documentation into local Markdown files — so you can read, search, and embed docs offline without depending on a browser or internet connection.

## Vision

Cloud docs are vast, scattered, and web-only. The goal of this project is a lightweight CLI that walks a documentation subtree (starting from any page in the sidebar) and writes it out as clean Markdown. The output is portable: it can feed a RAG pipeline, a local knowledge base, or just be read in your editor.

The architecture is provider-aware but not provider-coupled — a small `DocProvider` interface captures the URL patterns and CSS selectors that differ between vendors, while the TOC traversal, HTML-to-Markdown conversion, and file writing are shared. AWS is the first provider; GCP and Azure are planned.

## Features

- **TOC-driven traversal** — fetches `toc-contents.json` from the guide root, finds the requested page, and walks the subtree depth-first; no brittle HTML link-following.
- **Ordered directory structure** — mirrors the sidebar hierarchy using numbered prefixes (e.g., `01-Introduction/`, `02-Getting-Started/`) to preserve the logical reading order in your file explorer.
- **Clean Markdown output** — strips navigation, feedback widgets, and legal boilerplate; uses Turndown + GFM for pipe tables.
- **Tabbed code blocks** — rewrites AWS `<awsdocs-tabs>` elements to `#### Label` headings so tab content is preserved in plain Markdown.
- **Code block normalization** — collapses nested `<pre><code>` structures before Turndown runs, with language hints inferred from AWS class names.
- **Resume support** — skips pages whose `.md` file already exists; re-running a completed subtree does zero network work.
- **Polite fetching** — configurable delay between requests (default 500 ms), descriptive `User-Agent`, and a single retry with backoff on transient errors.

## Requirements

- **Node.js ≥ 20** or **Bun**

## Installation

You can run it directly without installing via `npx` or `bunx`:

```sh
# Using npx (Node.js)
npx cloud-docs-cli pull <url>

# Using bunx (Bun)
bunx cloud-docs-cli pull <url>
```

Alternatively, install it globally:

```sh
npm install -g cloud-docs-cli
# or
bun add -g cloud-docs-cli
```

## Usage

```sh
cloud-docs pull <url> [options]
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `<url>`  | URL of any page in the AWS documentation sidebar |

**Options**

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --out <dir>` | `./.out` | Directory to write Markdown files into |
| `--delay <ms>` | `500` | Milliseconds to wait between page fetches |

**Example**

```sh
# Mirror the Zero-ETL integrations subtree into ./out
npx cloud-docs-cli pull -o ./.out https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/zero-etl.html 
```

On completion the CLI prints a summary:

```
toc   .out/Zero-ETL integrations/content.yaml
write .out/Zero-ETL integrations/00-Zero-ETL integrations.md
write .out/Zero-ETL integrations/01-Getting started with zero-ETL integrations.md
...
Done: 10 written, 0 skipped, 0 failed
```

## Output structure

The CLI creates a mirrored directory tree based on the documentation's Table of Contents. 
- Directories and files are prefixed with numbers (e.g., `01-`, `02-`) to maintain the vendor's intended order.
- A `content.yaml` is generated at the root of the crawl containing the full subtree metadata.
- Parent nodes with their own content are written as `00-Title.md` inside their respective directory.

## Known limitations

- **Internal links stay absolute.** Links between in-scope pages are not yet rewritten to relative `.md` paths.
- **No image download.** `<img>` src attributes remain absolute URLs.
- **Sequential fetching.** One request at a time; a 500-page subtree takes ~4 minutes.
- **AWS only.** GCP and Azure providers are not yet implemented.

## Development

```sh
bun install                # install dependencies
bun run build              # bundle into dist/index.cjs (zero-dependency)
bun run cli pull <url>     # run dev CLI (tsx src/cli.ts)
node dist/index.cjs --help # run bundled CLI
bun test                   # run tests (vitest)
bun run typecheck          # tsc --noEmit
```

## Roadmap

1. [x] Phase 1: Zero-dependency npm distribution
2. [ ] Relative internal-link rewriting
3. [ ] Image download to `assets/`
4. [ ] Parallel fetching with a configurable concurrency cap
5. [ ] GCP and Azure providers
6. [ ] Compiled single binary via `bun build --compile`
