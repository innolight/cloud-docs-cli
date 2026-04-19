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

## Binary Distribution (GitHub Releases)

In addition to NPM, we distribute standalone, single-file executables for users without Node.js or Bun installed. This process is fully automated.

### How it works
The `.github/workflows/release.yml` workflow is triggered whenever a new version tag (e.g., `v0.1.0`) is pushed to GitHub.

1.  **Matrix Build:** It uses `bun build --compile` to generate binaries for 5 platforms (Linux x64/ARM, macOS x64/ARM, Windows x64).
2.  **GitHub Release:** It creates a new release entry, generates automatic release notes, and attaches the compressed binaries (`.tar.gz` or `.zip`).

---

## Step-by-Step Release Process

We use a high-confidence release flow. The `release` script in `package.json` ensures your code is type-safe and builds locally **before** it creates a git tag.

### 1. Execute the Release Command
Run the helper script with the type of version bump you need (`patch`, `minor`, or `major`).

```bash
# For bug fixes (0.1.0 -> 0.1.1)
bun run release patch

# For new features (0.1.0 -> 0.2.0)
bun run release minor

# For breaking changes (0.1.0 -> 1.0.0)
bun run release major
```

**What this script does:**
1.  **Runs Typecheck:** Ensures no TypeScript errors.
2.  **Runs Build:** Verifies that the native binary compiles correctly.
3.  **Bumps Version:** Updates `package.json`.
4.  **Commits & Tags:** Creates a "Version bump" commit and a git tag (e.g., `v0.1.1`) locally.

### 2. Push to GitHub
Push your local commit and the new tag to trigger the automated binary build.

```bash
# Pushes the branch and all new tags simultaneously
git push origin main --follow-tags
```

### 3. Publish to NPM
While the binaries are building in GitHub Actions, publish the JavaScript package to the registry.

```bash
# Live publish (requires npm login)
npm publish --access public
```

### 4. Post-Publish Verification
Verify that the package is live and the binaries are available:

1.  **Check GitHub Actions:** Ensure the "Release Binaries" workflow finishes successfully.
2.  **Verify NPM:**
    ```bash
    npx cloud-docs-cli@latest --version
    ```
3.  **Check GitHub Releases:** Verify that the `.tar.gz` and `.zip` assets are attached to the new release.

---

## Troubleshooting

### "Dynamic require of node:events is not supported"
If you see this error, ensure the build format is set to `cjs` in the `esbuild` command within `package.json`. ESM bundling with CJS dependencies often triggers this in Node.js.

### Bundle Size
If the bundle grows significantly beyond 5MB, check `package.json` for large new dependencies. `esbuild` includes everything in the `dist/index.cjs` file to ensure zero-dependency installs for users.
