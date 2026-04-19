#!/usr/bin/env -S node --experimental-strip-types
import { Command } from "commander";
import { run } from "./run.ts";

const program = new Command();

program
  .name("cloud-docs")
  .description("Download cloud provider docs into a local Markdown mirror")
  .version("0.1.0");

program
  .command("pull")
  .argument("<url>", "URL of a TOC node page (e.g. an AWS User Guide page)")
  .option("-o, --out <dir>", "Output directory", "./out")
  .option("--delay <ms>", "Delay between requests in ms", "500")
  .action(async (url: string, opts: { out: string; delay: string }) => {
    const delayMs = Number.parseInt(opts.delay, 10);
    if (Number.isNaN(delayMs) || delayMs < 0) {
      throw new Error(`--delay must be a non-negative integer, got: ${opts.delay}`);
    }
    const stats = await run({ url, outDir: opts.out, delayMs });
    console.log(
      `\nDone: ${stats.written} written, ${stats.skipped} skipped, ${stats.failed} failed`,
    );
    if (stats.failed > 0) process.exit(1);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
