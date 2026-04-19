import { writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify as yamlStringify } from "yaml";
import type { DocProvider, TocNodeFile } from "./providers/types.ts";
import { pickProvider } from "./providers/aws.ts";
import { fetchToc, resolveSubtree } from "./toc.ts";
import { fetchHtml, htmlToMarkdown } from "./scrape.ts";
import { ensureDir, exists } from "./fs-util.ts";
import { buildFileTree } from "./naming.ts";

interface Stats {
  written: number;
  skipped: number;
  failed: number;
}

export interface RunOptions {
  url: string;
  outDir: string;
  delayMs?: number;
}

export async function run(opts: RunOptions): Promise<Stats> {
  const url = new URL(opts.url);
  const provider = pickProvider(url);
  const tree = await fetchToc(provider, url);
  const startHref = provider.startHref(url);
  const fallbackTitle = url.pathname.replace(/\/$/, "").split("/").pop() ?? "guide";
  const { subtree, prefix } = resolveSubtree(tree, startHref, fallbackTitle);

  const pageBaseUrl = new URL(url.href);
  // Drop the filename so we can resolve relative hrefs from the TOC.
  pageBaseUrl.pathname = pageBaseUrl.pathname.replace(/[^/]+$/, "");

  const stats: Stats = { written: 0, skipped: 0, failed: 0 };
  const guideDir = path.join(opts.outDir, provider.guideDir(url));
  await ensureDir(guideDir);

  const fileTree = buildFileTree(subtree, startHref ? guideDir : path.dirname(guideDir), prefix);
  await walk(fileTree, pageBaseUrl, provider, opts.delayMs ?? 500, stats);
  return stats;
}

async function walk(
  node: TocNodeFile,
  baseUrl: URL,
  provider: DocProvider,
  delayMs: number,
  stats: Stats,
): Promise<void> {
  if (node.dirPath) {
    await ensureDir(node.dirPath);
    const tocPath = path.join(node.dirPath, "content.yaml");
    await writeFile(tocPath, yamlStringify(fileNodeToSerial(node, node.dirPath)), "utf8");
    console.log(`toc   ${rel(tocPath)}`);
  }
  if (node.filePath && node.href) {
    await writePage(node, node.filePath, baseUrl, provider, delayMs, stats);
  }
  for (const child of node.children) {
    await walk(child, baseUrl, provider, delayMs, stats);
  }
}

async function writePage(
  node: TocNodeFile,
  outPath: string,
  baseUrl: URL,
  provider: DocProvider,
  delayMs: number,
  stats: Stats,
): Promise<void> {
  if (await exists(outPath)) {
    console.log(`skip  ${rel(outPath)}`);
    stats.skipped++;
    return;
  }

  const href = node.href!;
  const pageUrl = new URL(href, baseUrl).href;

  try {
    const html = await fetchWithRetry(pageUrl);
    const md = `# ${node.title}\n\n<!-- source: ${pageUrl} -->\n\n${htmlToMarkdown(html, provider)}`;
    await writeFile(outPath, md, "utf8");
    console.log(`write ${rel(outPath)}`);
    stats.written++;
  } catch (err) {
    console.error(`fail  ${rel(outPath)} — ${(err as Error).message}`);
    stats.failed++;
  }

  await sleep(delayMs);
}

async function fetchWithRetry(url: string): Promise<string> {
  try {
    return await fetchHtml(url);
  } catch (err) {
    await sleep(2000);
    return await fetchHtml(url);
  }
}

interface TocSerial {
  title: string;
  href?: string;
  filePath?: string;
  contents?: TocSerial[];
}

function fileNodeToSerial(node: TocNodeFile, base: string): TocSerial {
  const obj: TocSerial = { title: node.title };
  if (node.href !== null) obj.href = node.href;
  if (node.filePath !== null) obj.filePath = "./" + path.relative(base, node.filePath);
  if (node.children.length > 0) obj.contents = node.children.map((c) => fileNodeToSerial(c, base));
  return obj;
}

function rel(p: string): string {
  return path.relative(process.cwd(), p) || p;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
