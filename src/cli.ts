import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { fetchText, fetchWithRetry } from './net.ts';
import { exists, ensureDir } from './fs-util.ts';
import { run, fetchGuideToc, walkSelections } from './run.ts';
import { openTocBrowser } from './tui/index.ts';
import type { RunDeps } from './run.ts';

const program = new Command();

program
  .name('cloud-docs')
  .description('Download cloud provider docs into a local Markdown mirror')
  .version(pkg.version);

const defaultDeps: RunDeps = {
  fetchText,
  fetchPage: fetchWithRetry,
  writeFile: (p, data, enc) => writeFile(p, data, enc as BufferEncoding),
  exists,
  ensureDir,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  log: (msg) => console.log(msg),
  errorLog: (msg) => console.error(msg),
};

program
  .command('pull')
  .argument('<url>', 'URL of a TOC node page (e.g. an AWS User Guide page)')
  .option('-o, --out <dir>', 'Output directory', './out')
  .option('--delay <ms>', 'Delay between requests in ms', '500')
  .option('-i, --interactive', 'Open interactive TOC browser to select subtrees')
  .option('--dry-run', 'Preview file tree and download plan without writing files')
  .action(
    async (
      url: string,
      opts: { out: string; delay: string; interactive?: boolean; dryRun?: boolean }
    ) => {
      const delayMs = Number.parseInt(opts.delay, 10);
      if (Number.isNaN(delayMs) || delayMs < 0) {
        throw new Error(`--delay must be a non-negative integer, got: ${opts.delay}`);
      }

      if (opts.interactive) {
        if (!process.stdout.isTTY) {
          throw new Error('--interactive requires a TTY. Remove the flag or run in a terminal.');
        }

        const parsedUrl = new URL(url);
        const { provider, tree, pageBaseUrl } = await fetchGuideToc(parsedUrl, defaultDeps);
        const startHref = provider.startHref(parsedUrl);
        const selections = await openTocBrowser(tree, { initialHref: startHref });

        if (selections.length === 0) {
          console.log('No selections made. Exiting.');
          return;
        }

        const stats = await walkSelections(selections, {
          provider,
          pageBaseUrl,
          outDir: opts.out,
          delayMs,
          deps: defaultDeps,
          dryRun: opts.dryRun,
        });

        if (opts.dryRun) {
          console.log(`\nDry-run: ${stats.written} files to download`);
        } else {
          console.log(
            `\nDone: ${stats.written} written, ${stats.skipped} skipped, ${stats.failed} failed`
          );
          if (stats.failed > 0) process.exit(1);
        }
      } else {
        const stats = await run({ url, outDir: opts.out, delayMs, dryRun: opts.dryRun });
        if (opts.dryRun) {
          console.log(`\nDry-run: ${stats.written} files to download`);
        } else {
          console.log(
            `\nDone: ${stats.written} written, ${stats.skipped} skipped, ${stats.failed} failed`
          );
          if (stats.failed > 0) process.exit(1);
        }
      }
    }
  );

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
