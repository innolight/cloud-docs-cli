# Release & Distribution Guide

This guide outlines how to release new versions of `cloud-docs-cli` and explains the underlying distribution strategy.

## Distribution Strategy

To ensure maximum reach and performance, we distribute via two primary channels:

1.  **Phase 1: NPM Registry (Dual-Runtime)**
    - Target: Developers with Node.js or Bun installed.
    - Mechanism: A zero-dependency CommonJS bundle (`dist/index.cjs`).
    - Benefit: Fast installs and universal compatibility.

2.  **Phase 2: GitHub Releases (Standalone Binaries)**
    - Target: Users without a JS runtime or for use in CI/CD.
    - Mechanism: Single-file executables for Linux, macOS, and Windows.
    - Benefit: Zero-dependency execution and maximum speed.

---

## Prerequisites (One-Time Setup)

Before your first release, ensure you have the necessary permissions:

1.  **NPM Account:** Register at [npmjs.com](https://www.npmjs.com/).
2.  **Authentication:** Run `npm login` in your terminal.
3.  **GitHub Access:** Ensure you have write access to the repository to push tags and trigger actions.

---

## Release Workflow

Follow these steps to publish a new version. The `release` script ensures the code is type-safe and compilable before tagging.

### 1. Prepare & Tag
Run the release command with the version bump type (`patch`, `minor`, or `major`).

```bash
# Example: Bug fix (0.1.0 -> 0.1.1)
bun run release patch
```
*This command runs typechecks, verifies both the NPM bundle and the binary build, and creates a local git tag.*

### 2. Push to GitHub
Push the branch and the new tag to trigger the automated binary builds.

```bash
git push origin main --follow-tags
```
*This triggers the `.github/workflows/release.yml` workflow to build and upload binaries.*

### 3. Publish to NPM
Publish the JavaScript package while the binaries are building.

```bash
# Requires npm login
npm publish --access public
```

> **Note:** The `npm publish` command automatically triggers a fresh build of the `dist/` bundle via the `prepublishOnly` hook defined in `package.json`, ensuring the registry always receives the latest compiled code.

---

## Verification

After releasing, verify that all channels are updated:

1.  **NPM:** Run `npx cloud-docs-cli@latest --version` to check the new version.
2.  **GitHub:** Visit the [Releases](https://github.com/...) page and ensure assets (`.tar.gz`, `.zip`) are attached to the new tag.
3.  **Actions:** Check the "Release Binaries" workflow for any build failures.

---

## Technical Architecture

### NPM Bundling (Phase 1)
We use `esbuild` to produce a "Zero-Dependency" bundle. 
- **Format:** CommonJS (`cjs`) is used to ensure compatibility with both Node.js and Bun's transpilers.
- **Shebang:** `#!/usr/bin/env node` is injected to allow direct execution.
- **Entry:** Defined in `package.json` under the `bin` field.

### Binary Compilation (Phase 2)
We use `bun build --compile` for standalone executables.
- **Speed:** Bun's compiler is significantly faster than `pkg` or `nexe`.
- **Matrix:** The GitHub Action builds for `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, and `windows-x64`.

---

## Troubleshooting

### "Dynamic require of node:events is not supported"
Ensure the build format in `package.json` is set to `cjs`. Bundling ESM with certain Node.js built-ins can cause runtime errors in older Node versions.

### Incompatible Binaries
If a compiled binary fails on a specific OS, check the GitHub Action logs. Often, missing library headers on the build runner are the cause.
