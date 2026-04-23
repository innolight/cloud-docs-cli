# Feature Plan: Image Download to `assets/`

**Roadmap item:** Milestone 1 #2  
**Status:** Ready for implementation
**Date:** 2026.04.20

---

## Requirement

AWS documentation pages embed diagrams and screenshots as `<img>` tags.
The current pipeline preserves these verbatim: Turndown emits whatever `src`
value it finds in the HTML, which on AWS pages is always a root-relative path
like `/images/AmazonRDS/latest/UserGuide/images/pending_maintenance_rds.png`.

The output Markdown works in a browser pointed at `docs.aws.amazon.com` but
is broken offline — a Markdown viewer has no `/images/…` directory on the
local filesystem.

**Goal:** Mirror every in-scope `<img>` asset to disk alongside the Markdown
output and rewrite the Markdown reference to a relative local path, so the
corpus is fully self-contained for offline reading.

---

## System: input and output

### Input

- **HTML page** being converted (fetched from `docs.aws.amazon.com`).
- **Page URL** (e.g. `https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_UpgradeDBInstance.Upgrading.html`) — needed to resolve root-relative `src` attributes to absolute fetch URLs.
- **Page output path** (e.g. `/path/to/out/AmazonRDS/UserGuide/08-Managing/01-Upgrading.md`) — needed to compute the correct relative `../` path from the `.md` file to the `assets/` directory.
- **`outDir`** (the `--out` flag value, e.g. `/path/to/out`) — the root under which `assets/` is created.

### Output (per page)

- **Markdown file** with `<img src>` references rewritten from root-relative
  paths to relative local paths:

  ```markdown
  # Before

  ![Read replica](/images/AmazonRDS/latest/UserGuide/images/read-replica.png)

  # After

  ![Read replica](../../assets/images/AmazonRDS/latest/UserGuide/images/read-replica.png)
  ```

- **Image files** on disk, mirroring the source URL path under `outDir/assets/`:
  ```
  outDir/assets/images/AmazonRDS/latest/UserGuide/images/read-replica.png
  ```
- On fetch failure: original root-relative `src` is preserved in the Markdown
  (the page is still usable online); a warning is logged.

### Storage layout

```
out/
  assets/
    images/
      AmazonRDS/
        latest/
          UserGuide/
            images/
              read-replica.png
              pending_maintenance_rds.png
  AmazonRDS/
    UserGuide/
      08-Managing-a-DB-instance/
        10-Working-with-DB-instance-read-replicas/
          05-Cross-Region-read-replicas.md
            → ../../../../assets/images/AmazonRDS/.../read-replica.png
```

The relative path is computed mechanically with `path.relative(pageOutDir, localPath)`.

---

## Key decisions and alternatives considered

### 1. Which images to mirror?

**Decision: AWS-hosted images only** — images whose resolved host matches the
page URL's host (`docs.aws.amazon.com`).

Alternatives considered:

- **All images everywhere** — includes third-party badges, external diagrams.
  Rejected: adds failure modes (dead external hosts, rate limits, licensing
  noise) for little offline value.
- **AWS + same-origin relative** — a subset of the above. Not needed given
  all observed AWS images are already root-relative on the same host.

In practice, 100% of images found in the RDS and S3 guide output are
root-relative paths on `docs.aws.amazon.com` (604 total refs, all `.png`).

### 2. Local filename and path scheme

**Decision: mirror the source URL pathname verbatim under `outDir/assets/`.**

Example:

```
src:   /images/AmazonRDS/latest/UserGuide/images/pending_maintenance_rds.png
disk:  outDir/assets/images/AmazonRDS/latest/UserGuide/images/pending_maintenance_rds.png
```

The local path is a trivial string operation: `path.join(outDir, "assets", pathname.replace(/^\//, ""))`.

Alternatives considered:

| Scheme                                                  | Pros                                                             | Cons                                                           | Verdict            |
| ------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | ------------------ |
| Mirror source path (chosen)                             | Zero collision risk; no hash; trivial resume; original filenames | Deep nesting under `assets/`                                   | ✅ chosen          |
| Hash-only (`ab3f92.png`)                                | Dedup across any source                                          | Opaque filenames; requires hashing bytes before naming         | ❌ over-engineered |
| Original name + hash suffix (`read-replica.ab3f92.png`) | Readable + collision-safe                                        | Hash still requires downloading before naming                  | ❌ over-engineered |
| Original name only (`read-replica.png`)                 | Readable                                                         | Collision risk when same filename appears across guide subdirs | ❌ fragile         |
| Mirror source path under flat `assets/`                 | Collision-free; self-documenting                                 | Same as chosen                                                 | ✅ same            |

### 3. `assets/` location

**Decision: `outDir/assets/`** — single pool at the output root.

Alternatives considered:

- **Per-guide `assets/` next to guide content** (e.g. `outDir/AmazonRDS/UserGuide/assets/`) — saves 2 `../` hops in relative paths; better self-containment for zipping a single guide. Requires the code to track the "guide root" directory, which is not currently a named concept in `run.ts`. Deferred to batch-mode work (roadmap #12).
- **Mirror entire source URL path from filesystem root** — e.g. `out/images/AmazonRDS/…` without the `assets/` wrapper. Saves one path component; slightly more confusing to distinguish from page output.

### 4. Failure handling

**Decision: preserve original src, log warning, continue.**

Alternatives considered:

- **Fail the page** — maximum strictness; one dead icon breaks the whole run. Rejected: too fragile for a first pass.
- **Drop the `<img>` tag** — clean render but silently loses information. Rejected.

### 5. Architecture: where does image logic live?

**Decision: Design B — transform-pass pattern mirroring `src/tabs.ts`.**

Three designs were evaluated:

**Design A — staged pipeline (pure functions composed in `run.ts`)**
Four standalone pure functions (`collectImageRefs`, `htmlToMarkdown`,
`downloadImages`, `rewriteImageSrcs`). Clean separation, injectable fetcher.
Downside: Cheerio must be set up twice (once for image collection, once for
Markdown conversion) or `$main` must be threaded out of `htmlToMarkdown`,
fighting the existing structure.

**Design B — transform pass (chosen)**
A new `src/images.ts` module, structured exactly like `src/tabs.ts`.
Two exported pure functions operate on an existing Cheerio instance (`$` +
`$main`) and on Markdown strings. `htmlToMarkdown` calls `collectImageRefs`
in sequence with `flattenTabs` and the `<pre>` normalisation pass. All I/O
(fetch + write) stays in `run.ts`. No double parse; minimal structural change.

**Design C — `ImageRegistry` class (run-wide state)**
A stateful registry threaded through the whole run. `register(src, ctx)` is
pure; `flush(fetcher)` downloads only unseen images once across all pages;
`rewrite(markdown, refs, results)` is pure. Enables true cross-page dedup
(10 pages sharing the same image → 1 download). Rejected for this PR as
over-engineered: cross-page dedup belongs with batch-mode work (roadmap #12).
Design C is the right eventual direction; Design B is the right step now.

---

## Implementation plan

### New file: `src/images.ts`

Mirrors the structure of `src/tabs.ts`. Exports:

```typescript
export interface PageContext {
  pageUrl: string; // absolute URL of the page being converted
  pageOutPath: string; // absolute output path of the .md file
  outDir: string; // root output dir (the --out value)
}

export interface ImageRef {
  src: string; // original src attribute value
  absoluteUrl: string; // resolved fetch target
  localPath: string; // absolute path: outDir/assets/images/…
  relativePath: string; // relative from pageOutPath dir → localPath
}

export interface ImageResult {
  ref: ImageRef;
  status: 'ok' | 'failed';
}

// Pure. Scans $main.find("img[src]"). Skips out-of-scope and malformed.
// Does NOT mutate the DOM.
export function collectImageRefs($: CheerioAPI, $main: Cheerio<any>, ctx: PageContext): ImageRef[];

// Pure. Replaces ref.src → ref.relativePath in markdown for "ok" results.
// "failed" results leave the original src untouched.
export function applyImageResults(markdown: string, results: ImageResult[]): string;
```

`collectImageRefs` logic per `<img src>`:

1. Resolve `src` to absolute URL via `new URL(src, ctx.pageUrl)`. Skip malformed.
2. Skip if resolved host ≠ `new URL(ctx.pageUrl).host`.
3. `localPath = path.join(ctx.outDir, "assets", pathname.replace(/^\//, ""))`.
4. `relativePath = path.relative(path.dirname(ctx.pageOutPath), localPath)` with `path.sep → "/"`.

### Changes to `src/scrape.ts`

1. Add `fetchBinary(url): Promise<Uint8Array>` — uses `res.arrayBuffer()`,
   not `res.text()`. Reuses `DEFAULT_UA`.

2. Update `htmlToMarkdown`:
   - New signature: `(html, provider, ctx: PageContext) → { markdown, images }`
   - After `flattenTabs` + `<pre>` pass, call `collectImageRefs($, $main, ctx)`.
   - Return `{ markdown: td.turndown(mainHtml).trim() + "\n", images }`.

### Changes to `src/run.ts`

1. Add `outDir: string` to `walk()` and `writePage()` signatures.
2. In `writePage`, replace the `htmlToMarkdown` call:
   ```typescript
   const { markdown, images } = htmlToMarkdown(html, provider, {
     pageUrl,
     pageOutPath: outPath,
     outDir,
   });
   ```
3. After `htmlToMarkdown`, loop over `images`: skip if `exists(localPath)`,
   otherwise `fetchBinary` + `writeFile`. Collect `ImageResult[]`.
4. Call `applyImageResults(markdown, results)` to get the final Markdown.
5. Then write the `.md` file.

### New file: `src/images.test.ts`

Unit tests (vitest, style of `toc.test.ts`). All tests are pure — no I/O,
no network, no disk.

**`collectImageRefs` cases:**

- Root-relative in-scope src → correct `absoluteUrl`, `localPath`, `relativePath`
- Absolute same-host src → collected
- External host (e.g. `shields.io`) → skipped
- Malformed src → skipped without throwing
- No `<img>` elements → returns `[]`
- `relativePath` uses forward slashes regardless of OS
- Shallow page (fewer `../`) vs deep page (more `../`) → correct depth

**`applyImageResults` cases:**

- `status: "ok"` → src replaced with `relativePath` in Markdown
- `status: "failed"` → src unchanged
- Mixed results → only `ok` refs rewritten
- Empty results → Markdown unchanged

---

## Verification checklist

- [ ] `bun run typecheck` passes
- [ ] `bun test` passes (including new `images.test.ts`)
- [ ] `bun run cli pull <rds-guide-url> --out /tmp/img-test` produces:
  - `assets/images/AmazonRDS/…` tree with `.png` files
  - `.md` files with `../../assets/images/…` relative refs (not `/images/…`)
- [ ] Re-running the same command: no `img` log lines, pages skipped, no new files written
- [ ] Opening a `.md` file with images in a Markdown viewer while offline: images render
