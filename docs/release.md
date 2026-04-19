# Release & Distribution Guide

This guide explains how `cloud-docs-cli` is packaged and the step-by-step process for publishing new versions to the npm registry.

## Distribution Architecture

To ensure maximum compatibility and speed, we use a **"Dual-Runtime" Zero-Dependency** strategy:

1.  **Bundler:** [esbuild](https://esbuild.github.io/) bundles all source code and dependencies (`commander`, `cheerio`, `turndown`, etc.) into a single file.
2.  **Format:** We output to **CommonJS (`.cjs`)**. This is the most reliable format for bundling CJS dependencies into a single file that remains compatible with both modern Node.js (20+) and Bun.
3.  **Shebang:** A `#!/usr/bin/env node` shebang is injected at the top of the bundle.
4.  **Runtime:** 
    *   **Node.js:** Executes the `.cjs` bundle using the standard Node engine.
    *   **Bun:** Detects the bundle and executes it significantly faster using its internal transpiler.

---

## One-Time Setup

Before your first release, ensure you have an npm account and are authenticated:

1.  **Create Account:** Register at [npmjs.com](https://www.npmjs.com/).
2.  **Login:**
    ```bash
    npm login
    ```
3.  **Verify Name:** The package name `cloud-docs-cli` was verified as available on 2026-04-19.

---

## Step-by-Step Release Process

### 1. Prepare the Release
Ensure your local environment is clean and all changes are committed.

```bash
# Verify type safety
bun run typecheck

# (Optional) Run tests if available
# bun test
```

### 2. Version Bump
Follow [Semantic Versioning](https://semver.org/).

```bash
# For bug fixes
npm version patch

# For new features
npm version minor

# For breaking changes
npm version major
```
*This command automatically updates `package.json` and creates a git tag.*

### 3. Build & Verify
The `prepublishOnly` script in `package.json` will run the build automatically, but it's good practice to verify manually:

```bash
# Build the bundle
bun run build

# Verify the bundle size (should be ~3MB)
ls -lh dist/index.cjs

# Test the bundle locally
node dist/index.cjs --help
```

### 4. Publish to NPM
Publish the package to the public registry.

```bash
# Dry run first to see what files are included
npm publish --dry-run

# Live publish
npm publish --access public
```

### 5. Post-Publish Verification
Verify that the package is live and installable:

```bash
# Test via npx (might take a minute to propagate)
npx cloud-docs-cli@latest --help
```

---

## Troubleshooting

### "Dynamic require of node:events is not supported"
If you see this error, ensure the build format is set to `cjs` in the `esbuild` command within `package.json`. ESM bundling with CJS dependencies often triggers this in Node.js.

### Bundle Size
If the bundle grows significantly beyond 5MB, check `package.json` for large new dependencies. `esbuild` includes everything in the `dist/index.cjs` file to ensure zero-dependency installs for users.
