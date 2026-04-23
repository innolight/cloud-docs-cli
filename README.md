# cloud-docs-cli

Download cloud provider documentation into local Markdown files — so you can read, search, and embed docs offline without depending on a browser or internet connection.

## 🚀 Why Cloud Docs CLI?

Cloud documentation is vast, scattered, and browser-only. This CLI downloads any AWS doc subtree as clean, portable Markdown — so you can:

- **Read and search offline** — grep, or open in your editor, no internet required
- **Build a local knowledge base** — using LLM to compile your personal knowledge base
- **Feed an AI / RAG pipeline** — point your embeddings at local `.md` files instead of scraping URLs at query time

## Try it

```sh
# Pull the complete S3 doc folder
npx cloud-docs-cli@latest pull --out .cloud-docs https://docs.aws.amazon.com/AmazonS3/latest/userguide/

# Interactively select docs
npx cloud-docs-cli@latest pull --interactive https://docs.aws.amazon.com/AmazonS3/latest/userguide/
npx cloud-docs-cli@latest pull --interactive https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blobs-introduction

```

**Requirement**: Node.js ≥ 20 or Bun

## Installation

### npx / bunx

You can run it directly without installing via `npx` or `bunx`:

```sh
# Using npx (Node.js)
npx cloud-docs-cli@latest pull <url>

# Using bunx (Bun)
bunx cloud-docs-cli@latest pull <url>
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

_Note: On macOS, you may need to run `xattr -d com.apple.quarantine cloud-docs` before the first execution._

</details>

## Usage

```sh
cloud-docs pull <url> [options]
```

**Arguments**

| Argument | Description                                      |
| -------- | ------------------------------------------------ |
| `<url>`  | URL of any page in the AWS documentation sidebar |

**Options**

| Flag                | Default  | Description                               |
| ------------------- | -------- | ----------------------------------------- |
| `-o, --out <dir>`   | `./.out` | Directory to write Markdown files into    |
| `-i, --interactive` | `false`  | Interactively select docs to download     |
| `--delay <ms>`      | `500`    | Milliseconds to wait between page fetches |

**Output**
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

## Features & Roadmap

### Core Capabilities

- **[x] Clean Markdown** — Strips noise (navigation, feedback, legal) for pure, searchable documentation.
- **[x] Hierarchy Preservation** — Mirrors the sidebar with numbered folders to maintain the vendor's logical reading order.
- **[x] Interactive Docs Tree Browser** — Explore and select specific subtrees for download via a terminal UI.
- **[x] Resume Support** — Skips existing files to avoid redundant network calls and save bandwidth.
- **[x] Tabbed Content Handling** — Rewrites vendor-specific `<awsdocs-tabs>` and Azure tabs into readable headers.
- **[x] RAG & AI Ready** — Optimized for feeding clean context into LLM pipelines and knowledge bases.
- **[x] Polite Fetching** — Configurable delays and retries with backoff to respect provider limits.

### Supported Providers

- **[x] AWS** (Amazon Web Services)
- **[x] Microsoft Azure**
- **[ ] Google Cloud Platform (GCP)** (Planned)

### Future Roadmap

- **[ ] Dry Run Mode** — Preview the file tree and download plan without writing any files.
- **[ ] Relative Link Rewriting** — Turn absolute URLs into local `.md` file links for seamless offline navigation.
- **[ ] Local Image Downloads** — Capture and store images alongside Markdown files.
- **[ ] Parallel Fetching** — Speed up large downloads with a configurable concurrency cap.

## Development

```sh
bun install                # install dependencies
bun run build              # bundle into dist/index.js (zero-dependency)
bun run build:bin          # compile local binary via Bun
bun run cli pull <url>     # run dev CLI (tsx src/cli.ts)
node dist/index.js --help # run bundled CLI
bun test                   # run tests (vitest)
bun run typecheck          # tsc --noEmit
```

### Verifying output after changes

Pull the same URL into two separate directories — one from a known-good state, one after your changes — then diff them:

```sh
# 1. Baseline (run once, keep around)
bun run cli pull -o .outv2 https://docs.aws.amazon.com/AmazonS3/latest/userguide/cost-optimization.html

# 2. After your changes
bun run cli pull -o .outv3 https://docs.aws.amazon.com/AmazonS3/latest/userguide/cost-optimization.html

# 3. Compare
bun scripts/compare-outputs.ts .outv2 .outv3
```

The script exits `0` if the outputs are identical, or `1` with a diff summary showing missing, extra, or changed files. Use any two directory names; the `.out*` pattern is git-ignored.
