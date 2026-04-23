# Feature Plan: Azure Documentation Provider

**Roadmap item:** Milestone 2
**Status:** In Progress
**Date:** 2026.04.20

---

## Goal

Extend `cloud-docs-cli` to support Microsoft Learn (Azure) documentation. This involves implementing the `DocProvider` interface for `learn.microsoft.com` and ensuring the shared scraping logic generalizes well to Azure's HTML and TOC structures.

---

## Findings: Microsoft Learn Structure

### 1. Table of Contents (TOC)

- **Location:** Identified via `<meta name="toc_rel" content="toc.json">` in the page HTML.
- **URL Pattern:** Usually relative to the page or at the service root (e.g., `https://learn.microsoft.com/en-us/azure/aks/toc.json`).
- **JSON Schema:**
  ```json
  {
    "items": [
      {
        "toc_title": "Overview",
        "href": "index",
        "children": [ ... ]
      }
    ]
  }
  ```
- **Hrefs:** Three patterns found in the wild:
  - Relative: `concepts-network` (same service directory, most common)
  - Absolute without locale: `/azure/well-architected/...` or `/cli/azure/aks` (cross-service)
  - With query params: `concepts-network?pivots=...` (strip the query part)
- **Absolute href resolution:** Microsoft issues HTTP 302 for `/azure/...` → `/en-us/azure/...`. `fetch()` follows redirects automatically, so no special handling is needed in `run.ts`.

### 2. Content Extraction

- **Main Selector:** `main#main`.
- **Junk Selectors:**
  - `#ms--content-header`, `#article-header` (Breadcrumbs, title, actions — `h1` lives here)
  - `#article-metadata` (Author, date, reading time)
  - `.doc-outline`, `#center-doc-outline` (Right-rail mini TOC)
  - `.is-helpful`, `.feedback-section` (Feedback widgets)
  - `.header-holder`, `nav`, `footer` (Site chrome)
  - `.ask-learn-container`, `#ms--ai-summary-cta` (AI/Chat components)

### 3. Special Markup

- **Tabs:** Uses standard WAI-ARIA `role="tablist"`, `role="tab"`, and `role="tabpanel"`.
- **Alerts/Admonitions:** Uses `div` with classes `NOTE`, `TIP`, `IMPORTANT`, `CAUTION`, `WARNING`. Structure:
  ```html
  <div class="NOTE">
    <p>Note</p>
    <!-- decorative label — same as class, strip it -->
    <p>actual content</p>
  </div>
  ```
- **Code Blocks:** Often uses `<pre>` wrapping `<code>`, sometimes with language classes like `lang-azurecli` or `lang-typescript`.

---

## Implementation Strategy

### 1. `AzureProvider` Implementation (`src/providers/azure/azure.ts`)

- **`matches(url)`:** Check for `learn.microsoft.com`.

- **`discoverTocUrls(url, fetchText)`:**
  - Fetch the page HTML.
  - Extract `toc_rel` meta tag value.
  - Resolve it relative to the current page URL to produce the absolute `toc.json` URL.

- **`startHref(url)`:**
  - Same as AWS: `url.pathname.split('/').pop() ?? ''`.
  - For `/en-us/azure/aks/concepts-network` → `concepts-network`.

- **`guideDir(url)`:**
  - Take the first three path segments (locale + service + guide): `url.pathname.split('/').slice(1, 4).join('/')`.
  - For `/en-us/azure/aks/concepts-network` → `en-us/azure/aks`.

- **`parseToc(json)`:**
  - Top-level key is `items` (not `contents` like AWS).
  - Title field is `toc_title` (not `title`).
  - Children field is `children`.
  - Strip query parameters from each `href` (e.g. `?pivots=...`).

- **`preprocessHtml($, $main)`:**
  - No explicit `h1` removal needed — `#article-header` junk selector already covers it.
  - Tab flattening: copy `flattenRoleBased` locally (the WAI-ARIA role-based variant from `aws.ts`). Do not import from `aws.ts`.
  - Alert transformation: for each `div.NOTE, div.TIP, div.IMPORTANT, div.CAUTION, div.WARNING`:
    1. Extract the type from the element's class list.
    2. Remove the first `<p>` child (the decorative label).
    3. Replace the `<div>` with `<blockquote>` containing the remaining children, prepending `<strong>TYPE:</strong> ` to the first child's content.
    - Result in Markdown: `> **NOTE:** actual content`

### 2. Registration

- Add `azureProvider` to `src/providers/registry.ts`.

### 3. No `run.ts` changes required

- Relative hrefs resolve correctly against `pageBaseUrl` (already derived from the entry page URL).
- Absolute hrefs without locale (e.g. `/azure/well-architected/...`) redirect via HTTP 302 to the locale-prefixed URL — handled transparently by `fetch()`.
- `DEFAULT_UA` is already used in `net.ts`.

---

## Verification Plan

### Automated Tests

- **Unit Tests:** Create `src/providers/azure/azure.test.ts` to cover `startHref`, `guideDir`, `parseToc` (including query-strip and `toc_title` mapping), and `discoverTocUrls` with mocked HTML/JSON.
- **Integration Test:** Run the CLI against a small Azure subtree:
  ```bash
  bun run cli pull https://learn.microsoft.com/en-us/azure/aks/concepts-network --out ./out
  ```

### Manual Check

- Verify `content.yaml` nesting matches the Microsoft Learn sidebar.
- Verify Markdown files are clean and free of "junk" elements.
- Verify tabs are flattened into readable `####` headers.
- Verify alerts render as `> **NOTE:** ...` blockquotes.
- Verify internal links and images (once Milestone 1 #1 and #2 are merged).
