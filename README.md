# cloud-docs-cli

Mirror cloud provider documentation into local Markdown files — so you can read, search, and embed docs offline without depending on a browser or internet connection.

## Vision

Cloud docs are vast, scattered, and web-only. The goal of this project is a lightweight CLI that walks a documentation subtree (starting from any page in the sidebar) and writes it out as clean Markdown. The output is portable: it can feed a RAG pipeline, a local knowledge base, or just be read in your editor.

The architecture is provider-aware but not provider-coupled — a small `DocProvider` interface captures the URL patterns and CSS selectors that differ between vendors, while the TOC traversal, HTML-to-Markdown conversion, and file writing are shared. AWS is the first provider; GCP and Azure are planned.

## Features

- **TOC-driven traversal** — fetches `toc-contents.json` from the guide root, finds the requested page, and walks the subtree depth-first; no brittle HTML link-following
- **Clean Markdown output** — strips navigation, feedback widgets, and legal boilerplate; uses Turndown + GFM for pipe tables
- **Tabbed code blocks** — rewrites AWS `<awsdocs-tabs>` elements to `#### Label` headings so tab content is preserved in plain Markdown
- **Code block normalization** — collapses nested `<pre><code>` structures before Turndown runs, with language hints inferred from AWS class names
- **Resume support** — skips pages whose `.md` file already exists; re-running a completed subtree does zero network work
- **Polite fetching** — configurable delay between requests (default 500 ms), descriptive `User-Agent`, and a single retry with backoff on transient errors

## Requirements

- Node.js ≥ 20
- [pnpm](https://pnpm.io/) (or npm/yarn — adjust commands accordingly)

## Installation

```sh
git clone <repo>
cd cloud-docs-cli
pnpm install
```

## Usage

```sh
pnpm run cli pull <url> [options]
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
pnpm run cli pull -o ./.out https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/zero-etl.html 
```

On completion the CLI prints a summary:

```
Done: 10 written, 0 skipped, 0 failed
```

## Output structure

Each page in the TOC subtree becomes one `.md` file. File names are derived from the original HTML filename (e.g. `zero-etl.html` → `zero-etl.md`). All files are written flat into the output directory.

## Known limitations

- **Internal links stay absolute.** Links between in-scope pages are not rewritten to relative `.md` paths.
- **No image download.** `<img>` src attributes remain absolute URLs.
- **Sequential fetching.** One request at a time; a 500-page subtree takes ~4 minutes.
- **AWS only.** GCP and Azure providers are not yet implemented.
- **No batch mode.** One URL per invocation; no config-file support.

## Project structure

```
src/
├── cli.ts          # CLI entry point (Commander)
├── run.ts          # Orchestration: URL → TOC → walk → write
├── toc.ts          # Fetch and search toc-contents.json
├── scrape.ts       # Single page: fetch → clean → normalize → Markdown
├── tabs.ts         # Rewrite AWS tab containers
├── fs-util.ts      # Path sanitization, directory helpers
└── providers/
    ├── types.ts    # DocProvider interface, TocNode type
    └── aws.ts      # AWS-specific URL rules and selectors
```

## Roadmap

1. Relative internal-link rewriting
2. Image download to `assets/`
3. Parallel fetching with a configurable concurrency cap
4. GCP provider
5. Config-file batch mode (`--config targets.toml`)
6. Compiled single binary via `bun build --compile`
7. Snapshot tests for HTML → Markdown conversion
