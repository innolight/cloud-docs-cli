#!/usr/bin/env bun
/**
 * Compare two CLI output directories to verify correctness after refactoring.
 *
 * Usage:
 *   bun scripts/compare-outputs.ts <dirA> <dirB>
 *   bun scripts/compare-outputs.ts .outv2 .outv3
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function color(c: string, s: string) {
  return `${c}${s}${RESET}`;
}

function collectFiles(dir: string): Map<string, string> {
  const result = new Map<string, string>();
  function walk(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const rel = relative(dir, full);
        result.set(rel, readFileSync(full, 'utf-8'));
      }
    }
  }
  walk(dir);
  return result;
}

function diffLines(a: string, b: string): { removed: number; added: number; preview: string[] } {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const preview: string[] = [];
  let removed = 0;
  let added = 0;

  // Simple LCS-based line diff (good enough for reporting)
  const aSet = new Set(aLines);
  const bSet = new Set(bLines);

  for (const line of aLines) {
    if (!bSet.has(line)) removed++;
  }
  for (const line of bLines) {
    if (!aSet.has(line)) added++;
  }

  // Collect a short preview of changed lines (first 5 removed, first 5 added)
  let shownRemoved = 0;
  let shownAdded = 0;
  for (const line of aLines) {
    if (!bSet.has(line) && shownRemoved < 5) {
      preview.push(color(RED, `  - ${line.slice(0, 120)}`));
      shownRemoved++;
    }
  }
  for (const line of bLines) {
    if (!aSet.has(line) && shownAdded < 5) {
      preview.push(color(GREEN, `  + ${line.slice(0, 120)}`));
      shownAdded++;
    }
  }

  return { removed, added, preview };
}

function main() {
  const [, , dirA, dirB] = process.argv;
  if (!dirA || !dirB) {
    console.error('Usage: bun scripts/compare-outputs.ts <dirA> <dirB>');
    process.exit(1);
  }

  for (const d of [dirA, dirB]) {
    try {
      statSync(d);
    } catch {
      console.error(`Directory not found: ${d}`);
      process.exit(1);
    }
  }

  console.log(`\n${color(BOLD, 'Comparing output directories')}`);
  console.log(`  ${color(CYAN, 'A')} ${dirA}`);
  console.log(`  ${color(CYAN, 'B')} ${dirB}\n`);

  const filesA = collectFiles(dirA);
  const filesB = collectFiles(dirB);

  const onlyInA: string[] = [];
  const onlyInB: string[] = [];
  const inBoth: string[] = [];

  for (const k of filesA.keys()) {
    if (filesB.has(k)) inBoth.push(k);
    else onlyInA.push(k);
  }
  for (const k of filesB.keys()) {
    if (!filesA.has(k)) onlyInB.push(k);
  }

  // --- Structure report ---
  console.log(color(BOLD, 'File structure'));
  console.log(`  Total in A: ${filesA.size}`);
  console.log(`  Total in B: ${filesB.size}`);
  console.log(`  Common:     ${inBoth.length}`);

  if (onlyInA.length) {
    console.log(color(RED, `\n  Only in A (${onlyInA.length}) — missing from B:`));
    for (const f of onlyInA.sort()) console.log(color(DIM, `    ${f}`));
  }
  if (onlyInB.length) {
    console.log(color(GREEN, `\n  Only in B (${onlyInB.length}) — new in B:`));
    for (const f of onlyInB.sort()) console.log(color(DIM, `    ${f}`));
  }

  // --- Content diff report ---
  const identical: string[] = [];
  const different: { file: string; removed: number; added: number; preview: string[] }[] = [];

  for (const f of inBoth) {
    const contentA = filesA.get(f)!;
    const contentB = filesB.get(f)!;
    if (contentA === contentB) {
      identical.push(f);
    } else {
      const diff = diffLines(contentA, contentB);
      different.push({ file: f, ...diff });
    }
  }

  console.log(`\n${color(BOLD, 'Content comparison (common files)')}`);
  console.log(color(GREEN, `  Identical: ${identical.length}`));
  console.log(color(different.length ? RED : GREEN, `  Changed:   ${different.length}`));

  if (different.length) {
    console.log(color(BOLD, '\nChanged files:'));
    for (const { file, removed, added, preview } of different.sort((a, b) =>
      a.file.localeCompare(b.file)
    )) {
      console.log(
        `\n  ${color(YELLOW, file)}  ${color(RED, `-${removed}`)} ${color(GREEN, `+${added}`)}`
      );
      for (const line of preview) console.log(line);
    }
  }

  // --- Summary ---
  const totalIssues = onlyInA.length + onlyInB.length + different.length;
  console.log(`\n${color(BOLD, 'Summary')}`);
  if (totalIssues === 0) {
    console.log(color(GREEN, '  Outputs are identical. ✓\n'));
  } else {
    console.log(
      color(
        RED,
        `  ${totalIssues} issue(s): ${onlyInA.length} missing, ${onlyInB.length} new, ${different.length} changed\n`
      )
    );
    process.exit(1);
  }
}

main();
