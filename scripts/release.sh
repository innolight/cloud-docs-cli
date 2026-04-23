#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

DRY_RUN=false
VERSION_ARG=""

# Parse arguments
for arg in "$@"; do
    if [ "$arg" == "--dry-run" ]; then
        DRY_RUN=true
    else
        VERSION_ARG="$arg"
    fi
done

if [ -z "$VERSION_ARG" ] && [ "$DRY_RUN" = false ]; then
    echo "Usage: $0 [--dry-run] [patch|minor|major|<version>]"
    exit 1
fi

if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}🧪 DRY RUN: No changes will be committed.${NC}"
fi

echo -e "${CYAN}🚀 Starting release process...${NC}"

# 1. Typecheck
echo "Step 1: Typecheck..."
bun run typecheck

# 2. Test
echo "Step 2: Testing source code..."
bun run test

# 3. Build & Verify JS Bundle
echo "Step 3: Building JS bundle..."
npm run build:node

echo "Verifying JS bundle integrity..."
if node ./dist/index.js --help | grep -q "Usage: cloud-docs"; then
    echo -e "${GREEN}JS bundle verification passed. ✓${NC}"
else
    echo -e "${RED}JS bundle verification failed!${NC}"
    exit 1
fi

# 4. Build & Verify Binary
echo "Step 4: Building binary..."
npm run build:bin

echo "Verifying binary integrity..."
if ./release/cloud-docs --help | grep -q "Usage: cloud-docs"; then
    echo -e "${GREEN}Binary verification passed. ✓${NC}"
else
    echo -e "${RED}Binary verification failed!${NC}"
    exit 1
fi

# 5. Version bump
if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}Step 5: [DRY RUN] Skipping version bump.${NC}"
    echo -e "${GREEN}Dry run completed successfully! All checks passed. ✓${NC}"
else
    echo -e "${CYAN}Step 5: Versioning...${NC}"
    npm version "$VERSION_ARG" -m "chore(release): v%s"
    echo -e "${GREEN}Release prepared successfully! ✨${NC}"
    echo "Don't forget to push your tags: git push --follow-tags"
fi
