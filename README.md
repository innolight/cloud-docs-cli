# cloud-docs-cli

Download cloud provider documentation into local Markdown files — so you can read, search, and embed docs offline without depending on a browser or internet connection.

## Vision

Cloud docs are vast, scattered, and web-only. The goal of this project is a lightweight CLI that walks a documentation subtree (starting from any page in the sidebar) and writes it out as clean Markdown. The output is portable: it can feed a RAG pipeline, a local knowledge base, or just be read in your editor.

The architecture is provider-aware but not provider-coupled — a small `DocProvider` interface captures the URL patterns and CSS selectors that differ between vendors, while the TOC traversal, HTML-to-Markdown conversion, and file writing are shared. AWS is the first provider; GCP and Azure are planned.

## Requirements

- **Node.js ≥ 20** or **Bun**

## Installation

### npx / bunx

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

<details>
<summary><b>Standalone Binaries (No Dependencies)</b></summary>

Download the latest single-file executable for your platform from [GitHub Releases](https://github.com/innolight/cloud-docs-cli/releases):
- `cloud-docs-linux-x64.tar.gz`
- `cloud-docs-linux-arm64.tar.gz`
- `cloud-docs-darwin-x64.tar.gz` (Intel Mac)
- `cloud-docs-darwin-arm64.tar.gz` (Apple Silicon)
- `cloud-docs-windows-x64.zip`

After downloading, extract the binary and move it to your path (e.g., `/usr/local/bin`). 

*Note: On macOS, you may need to run `xattr -d com.apple.quarantine cloud-docs` before the first execution.*
</details>

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

**Examples**

```sh
# Pull the complete S3 doc folder
cloud-docs pull --out cloud-docs https://docs.aws.amazon.com/AmazonS3/latest/userguide/

# Pull just S3 Cost Optimisation doc
cloud-docs pull --out cloud-docs https://docs.aws.amazon.com/AmazonS3/latest/userguide/cost-optimization.html
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

## Features

- **TOC-driven traversal** — fetches `toc-contents.json` from the guide root, finds the requested page, and walks the subtree depth-first; no brittle HTML link-following.
- **Ordered directory structure** — mirrors the sidebar hierarchy using numbered prefixes (e.g., `01-Introduction/`, `02-Getting-Started/`) to preserve the logical reading order in your file explorer.
- **Clean Markdown output** — strips navigation, feedback widgets, and legal boilerplate; uses Turndown + GFM for pipe tables.
- **Tabbed code blocks** — rewrites AWS `<awsdocs-tabs>` elements to `#### Label` headings so tab content is preserved in plain Markdown.
- **Code block normalization** — collapses nested `<pre><code>` structures before Turndown runs, with language hints inferred from AWS class names.
- **Resume support** — skips pages whose `.md` file already exists; re-running a completed subtree does zero network work.
- **Polite fetching** — configurable delay between requests (default 500 ms), descriptive `User-Agent`, and a single retry with backoff on transient errors.

## Known limitations

- **Internal links stay absolute.** Links between in-scope pages are not yet rewritten to relative `.md` paths.
- **No image download.** `<img>` src attributes remain absolute URLs.
- **Sequential fetching.** One request at a time; a 500-page subtree takes ~4 minutes.
- **AWS only.** GCP and Azure providers are not yet implemented.

## Development

```sh
bun install                # install dependencies
bun run build              # bundle into dist/index.cjs (zero-dependency)
bun run build:bin          # compile local binary via Bun
bun run cli pull <url>     # run dev CLI (tsx src/cli.ts)
node dist/index.cjs --help # run bundled CLI
bun test                   # run tests (vitest)
bun run typecheck          # tsc --noEmit
```

## Roadmap

1. [x] Phase 1: Zero-dependency npm distribution (npx/bunx)
2. [ ] Phase 2: Compiled single binary via `bun build --compile`
3. [ ] Relative internal-link rewriting
4. [ ] Image download to `assets/`
5. [ ] Parallel fetching with a configurable concurrency cap
6. [ ] GCP and Azure providers
