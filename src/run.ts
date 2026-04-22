import { writeFile as fsWriteFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type { DocProvider, TocNodeFile } from './providers/types.ts';
import { pickProvider } from './providers/registry.ts';
import { fetchToc, resolveSubtree } from './toc.ts';
import { fetchText, fetchWithRetry } from './net.ts';
import { htmlToMarkdown } from './scrape.ts';
import { ensureDir as fsEnsureDir, exists as fsExists, sanitize } from './fs-util.ts';
import { buildFileTree, fileNodeToSerial } from './naming.ts';

interface Stats {
  written: number;
  skipped: number;
  failed: number;
}

export interface RunDeps {
  fetchText: (url: string) => Promise<string>;
  fetchPage: (url: string) => Promise<string>;
  writeFile: (path: string, data: string, encoding: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  ensureDir: (dir: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string) => void;
  errorLog: (msg: string) => void;
}

const defaultDeps: RunDeps = {
  fetchText,
  fetchPage: fetchWithRetry,
  writeFile: (p, data, enc) => fsWriteFile(p, data, enc as BufferEncoding),
  exists: fsExists,
  ensureDir: fsEnsureDir,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  log: (msg) => console.log(msg),
  errorLog: (msg) => console.error(msg),
};

export interface RunOptions {
  url: string;
  outDir: string;
  delayMs?: number;
  deps?: Partial<RunDeps>;
}

export async function run(opts: RunOptions): Promise<Stats> {
  const deps: RunDeps = { ...defaultDeps, ...opts.deps };
  const url = new URL(opts.url);
  const provider = pickProvider(url);
  const tree = await fetchToc(provider, url, deps.fetchText);
  const startHref = provider.startHref(url);
  const fallbackTitle = url.pathname.replace(/\/$/, '').split('/').pop() ?? 'guide';
  const { subtree, prefix, ancestors } = resolveSubtree(tree, startHref, fallbackTitle);

  const pageBaseUrl = new URL(url.href);
  // Drop the filename so we can resolve relative hrefs from the TOC.
  pageBaseUrl.pathname = pageBaseUrl.pathname.replace(/[^/]+$/, '');

  const stats: Stats = { written: 0, skipped: 0, failed: 0 };
  const guideDir = path.join(opts.outDir, provider.guideDir(url));
  await deps.ensureDir(guideDir);

  let baseDir = startHref ? guideDir : path.dirname(guideDir);
  for (const { node: aNode, prefix: aPrefix } of ancestors) {
    baseDir = path.join(baseDir, aPrefix + sanitize(aNode.title, 'untitled'));
  }
  await deps.ensureDir(baseDir);

  const fileTree = buildFileTree(subtree, baseDir, prefix);
  await walk(fileTree, pageBaseUrl, provider, opts.delayMs ?? 500, stats, deps);
  return stats;
}

async function walk(
  node: TocNodeFile,
  baseUrl: URL,
  provider: DocProvider,
  delayMs: number,
  stats: Stats,
  deps: RunDeps
): Promise<void> {
  if (node.kind === 'branch') {
    await deps.ensureDir(node.dirPath);
    const tocPath = path.join(node.dirPath, 'content.yaml');
    await deps.writeFile(tocPath, yamlStringify(fileNodeToSerial(node, node.dirPath)), 'utf8');
    deps.log(`toc   ${rel(tocPath)}`);
  }
  if (node.filePath && node.href) {
    await writePage(node, node.filePath, baseUrl, provider, delayMs, stats, deps);
  }
  if (node.kind === 'branch') {
    for (const child of node.children) {
      await walk(child, baseUrl, provider, delayMs, stats, deps);
    }
  }
}

async function writePage(
  node: TocNodeFile,
  outPath: string,
  baseUrl: URL,
  provider: DocProvider,
  delayMs: number,
  stats: Stats,
  deps: RunDeps
): Promise<void> {
  if (await deps.exists(outPath)) {
    deps.log(`skip  ${rel(outPath)}`);
    stats.skipped++;
    return;
  }

  const href = node.href!;
  const pageUrl = new URL(href, baseUrl).href;

  try {
    const html = await deps.fetchPage(pageUrl);
    const md = `# ${node.title}\n\n<!-- source: ${pageUrl} -->\n\n${htmlToMarkdown(html, provider)}`;
    await deps.writeFile(outPath, md, 'utf8');
    deps.log(`write ${rel(outPath)}`);
    stats.written++;
  } catch (err) {
    deps.errorLog(`fail  ${rel(outPath)} — ${(err as Error).message}`);
    stats.failed++;
  }

  await deps.sleep(delayMs);
}

function rel(p: string): string {
  return path.relative(process.cwd(), p) || p;
}
