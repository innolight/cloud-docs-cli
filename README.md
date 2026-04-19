# cloud-docs-cli

Download cloud provider documentation into local Markdown files — so you can read, search, and embed docs offline without depending on a browser or internet connection.

## 🚀 Why Cloud Docs CLI?

Cloud documentation is vast, scattered, and browser-only. This CLI downloads any AWS doc subtree as clean, portable Markdown — so you can:

- **Feed an AI / RAG pipeline** — point your embeddings at local `.md` files instead of scraping URLs at query time
- **Read and search offline** — grep, ripgrep, or open in your editor, no internet required
- **Build a local knowledge base** — version-control your docs snapshot alongside your code
- **Stay fast** — one `pull` caches an entire doc section; re-runs skip already-downloaded pages

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
npx cloud-docs-cli pull --out cloud-docs https://docs.aws.amazon.com/AmazonS3/latest/userguide/

# Pull just Cost Optimisation section
npx cloud-docs-cli pull --out cloud-docs https://docs.aws.amazon.com/AmazonS3/latest/userguide/cost-optimization.html

# Pull CloudFormation Reference for S3
npx cloud-docs-cli https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3-bucket.html
```

On completion the CLI prints a summary:

```
toc   .out/AmazonS3/userguide/13-Cost-optimization/content.yaml
write .out/AmazonS3/userguide/13-Cost-optimization/00-Cost-optimization.md
toc   .out/AmazonS3/userguide/13-Cost-optimization/01-Billing-and-usage-reporting/content.yaml
write .out/AmazonS3/userguide/13-Cost-optimization/01-Billing-and-usage-reporting/00-Billing-and-usage-reporting.md
write .out/AmazonS3/userguide/13-Cost-optimization/01-Billing-and-usage-reporting/01-Using-cost-allocation-tags.md
...
Done: 31 written, 0 skipped, 0 failed
```

(`skip` appears instead of `write` when a file already exists — re-runs do zero network work for completed pages.)

## Output structure

The CLI mirrors the documentation hierarchy into a directory tree rooted at the output folder:

```
.out/
└── AmazonS3/userguide/              ← derived from the URL path
    └── 13-Cost-optimization/
        ├── content.yaml             ← subtree metadata for this directory
        ├── 00-Cost-optimization.md  ← parent page written as 00-<Title>.md
        ├── 01-Billing-and-usage-reporting/
        │   ├── content.yaml
        │   ├── 00-Billing-and-usage-reporting.md
        │   ├── 01-Using-cost-allocation-tags.md
        │   └── ...
        └── 02-Understanding-and-managing-storage-classes/
            ├── content.yaml
            └── ...
```

- **URL-derived prefix** — the output path begins with segments taken from the URL (e.g. `AmazonS3/userguide/`), so pulling from multiple guides never collides under the same `--out` root.
- **Numbered prefixes** — directories and files are prefixed with two-digit numbers (e.g. `01-`, `02-`) to preserve the vendor's intended reading order in any file explorer.
- **`content.yaml` per directory** — each directory gets its own `content.yaml` with the subtree metadata for that section.
- **Parent pages as `00-Title.md`** — a node that has both children and its own content is written as `00-<Title>.md` inside its directory, alongside its children.

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

1. [x] Distribution: Zero-dependency npm distribution (npx/bunx)
2. [x] Distribution: Compiled single binary (`bun build --compile`)
3. [ ] Relative internal-link rewriting
4. [ ] Image download to `assets/`
5. [ ] Parallel fetching with a configurable concurrency cap
6. [ ] Azure
7. [ ] GCP
