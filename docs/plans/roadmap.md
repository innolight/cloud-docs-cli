# Roadmap

## Vision

A lightweight, portable CLI that mirrors cloud-vendor documentation into a
local tree of clean Markdown — readable in an editor, grep-able offline,
droppable into a RAG pipeline, and stable enough to re-run on a schedule.

The core bet is that the _navigation tree_ is the durable interface to a
docset — not the HTML. Vendors redesign their page chrome constantly, but
the logical TOC (a tree of titles and hrefs) is stable and usually exposed
as JSON somewhere. Build on that, and the scraper stays thin.

The architecture is provider-aware but not provider-coupled: a small
`DocProvider` seam captures URL rules and CSS selectors; TOC traversal,
HTML→Markdown, and file writing are shared. AWS is the proving ground;
Azure and GCP are the generalization test.

## Where we are today

A working AWS pipeline: `URL → toc-contents.json → subtree walk → per-page
fetch → clean HTML → Turndown → .md files mirroring the TOC`. Resume works,
tabbed code blocks flatten, nested `<pre><code>` normalizes cleanly, and
the whole thing is ~400 lines of TypeScript.

What it can't yet claim:

- **Offline-complete.** Internal links stay absolute; images aren't mirrored.
  A reader without network gets broken cross-references.
- **Verifiable.** No post-run check that every TOC leaf produced a file, no
  structured report of failures, no way to diff two runs.
- **Format-drift resilient.** If AWS changes `toc-contents.json` schema or
  the content selector, we'll silently emit garbage or crash mid-walk.
- **Fast at scale.** Sequential fetching means a large guide (IAM, EC2) is
  ~30+ minutes.
- **Tested.** No fixtures, no snapshot tests. Every Turndown/Cheerio tweak
  is a leap of faith.

## Milestone 1 — AWS, flawlessly

Ship a CLI that a teammate can point at any AWS guide subtree and trust the
output without spot-checking. "Flawless" means: every in-scope page lands
as a `.md` file, nested to mirror the sidebar; every link that _could_ be
local _is_ local; every image is on disk; every failure is surfaced in a
structured report; and every change to the HTML→Markdown path is guarded
by a fixture test.

Features below are grouped by the quality they deliver, roughly in priority
order. Each is a self-contained unit of work sized for a single PR.

### Correctness & completeness

1. **Relative internal-link rewriting.**
   While walking the TOC, build an `href → local-path` map. After all pages
   are written, post-process each `.md` and rewrite in-scope absolute URLs
   (including cross-guide ones if the target is in the map) to relative
   `./sibling.md` or `../parent/dir/child.md` paths. Preserve `#fragment`
   suffixes. Out-of-scope links stay absolute.
   _Why it matters:_ biggest offline-readability win; makes the corpus
   self-contained.

2. **Image download to `assets/`.**
   Mirror `<img src>` assets into an `assets/` dir at the scrape root (or
   per-subtree if preferred), deduplicated by content hash. Rewrite `src`
   to the local path. Skip images already on disk on resume.

3. **Fragment / anchor preservation.**
   Keep `#section-id` when linking to another in-scope page. For in-page
   anchors, rely on GFM heading slugs — add a regression test that Turndown's
   default slugging matches what internal links expect.

4. **Completeness audit.**
   After a run, walk the TOC again and assert every `href`-bearing node has
   a file on disk. Emit a structured report (`report.json`) with counts,
   missing pages, and any failed fetches. Non-zero exit if anything's off.

5. **TOC schema validation.**
   Parse `toc-contents.json` through a small runtime validator (zod or a
   hand-rolled check). If AWS changes the shape, fail loudly at the top of
   the run, not mid-walk with a cryptic error.

### Resilience & performance

6. **Parallel fetching with a concurrency cap.**
   `p-limit` with `--concurrency` (default 4). Respect the existing
   `--delay` as a per-worker token interval, not a global one. Add a
   per-host semaphore so future multi-guide runs don't stampede one host.

7. **Smarter retry / backoff.**
   Replace the single 2 s retry with exponential backoff (3 attempts) and
   honour `Retry-After` on 429/503. Treat network errors and 5xx as
   retryable; 4xx as terminal.

8. **Structured logging.**
   Swap `console.log` for a tiny logger (pino or hand-rolled JSON lines) so
   runs can be piped to a file and machine-parsed. Keep a human-readable
   mode for the default CLI path.

### Observability & trust

9. **Run manifest.**
   On each run, write a `manifest.json` alongside the output: scrape
   timestamp, CLI version, input URL, TOC snapshot hash, list of
   `{href, local_path, bytes, sha256}`. Enables diffing two runs and
   proving the mirror is intact.

10. **Frontmatter metadata.**
    Prepend YAML frontmatter to each `.md`: `source_url`, `title`,
    `scraped_at`, `toc_path` (breadcrumb). Makes the corpus directly usable
    by RAG loaders and doc-site generators.

11. **Fixture-based snapshot tests.**
    Commit a handful of real AWS HTML pages (one with tabs, one with
    deeply-nested `<pre><code>`, one with a GFM-hostile table, one with
    `awsui` legacy tabs). Assert their rendered Markdown byte-for-byte.
    Regression guard for every future Turndown/Cheerio change.

### Ergonomics

12. **Config-file batch mode.**
    `cloud-docs pull --config targets.toml` — one invocation walks several
    subtrees, sharing the concurrency budget, link map (so cross-guide
    links resolve locally), and report.

13. **`--dry-run` / `--plan`.**
    Fetch and parse the TOC, print the file tree that _would_ be written,
    exit. Lets the user sanity-check the target before committing 4 minutes
    of fetches.

14. **Compiled single binary.**
    `bun build --compile` (once Bun is the local runtime) or `pkg` as a
    fallback. Drop-in executable for users without a Node toolchain.

### Definition of done for Milestone 1

- [ ] Scraping the full DynamoDB Developer Guide produces a complete, fully
      internally-linked, image-mirrored Markdown tree readable entirely
      offline with no broken links.
- [ ] Post-run `report.json` shows 0 missing, 0 failed.
- [ ] Fixture snapshots cover the four known AWS markup quirks (tabs,
      nested code, tables, legacy tabs); CI runs them on every PR.
- [ ] Re-running the same command writes 0 bytes of new content.
- [ ] A 500-page guide finishes in under 90 seconds with `--concurrency 8`.

## Milestone 2 — Azure

Generalize the `DocProvider` seam by adding Microsoft Learn as a second
implementation. Azure's docs are largely generated from a public
`MicrosoftDocs` GitHub source (Markdown!), which gives us an interesting
fork in the road: scrape the rendered site to reuse the AWS pipeline, or
shortcut through the source repos for higher fidelity.

Open questions to resolve before committing to an approach:

- Does Microsoft Learn expose a TOC JSON endpoint analogous to AWS's
  `toc-contents.json`? (A `toc.json` is known to exist per learn.microsoft.com
  service roots — confirm shape and coverage.)
- Is the GitHub source path worth the complexity, or does it undercut the
  "build on the durable TOC" bet by coupling us to repo layouts?
- What are Azure's rate-limit / WAF behaviours vs AWS?

The goal of this milestone is less about Azure coverage breadth and more
about **stressing the abstraction**: every place the Milestone 1 code
implicitly assumes AWS (selectors, URL shapes, tab markup, content
container) should surface as a provider method or fall away entirely.

## Milestone 3 — GCP

Add Google Cloud as a third provider. GCP's documentation stack differs
again — heavier client-side rendering, different TOC surface — which gives
us a third datapoint for where the `DocProvider` interface is right and
where it's overfit.

By this milestone, adding a fourth provider should be a weekend project.
If it isn't, the abstraction needs another pass.

## Non-goals (for now)

- Headless-browser rendering. The static TOC + HTML approach is working;
  we revisit only if a provider forces it.
- Incremental sync / change detection against live docs. Interesting, but
  out of scope until Milestone 1 is solid.
- Full-text search UI. The output is plain Markdown — users can point any
  existing tool (ripgrep, Obsidian, a RAG indexer) at it.
- Authoring / round-tripping edits back to the vendor. Strictly a read path.
