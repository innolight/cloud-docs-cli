import type { CheerioAPI, Cheerio } from "cheerio";

export interface TocNode {
  title: string;
  href: string | null;
  children: TocNode[];
}

export type TocNodeFile =
  | { kind: "branch"; title: string; href: string | null; dirPath: string; filePath: string | null; children: TocNodeFile[] }
  | { kind: "leaf";   title: string; href: string | null; filePath: string | null };

export interface DocProvider {
  name: string;
  matches(url: URL): boolean;
  /** Extract the filename key used to locate the entry page in the TOC tree. */
  startHref(url: URL): string;
  parseToc(json: unknown): TocNode[];
  /** Relative output directory for the guide, e.g. `AmazonRDS/UserGuide`. */
  guideDir(url: URL): string;
  contentSelector: string;
  junkSelectors: string[];
  /**
   * Return the list of TOC JSON URLs for this guide.
   * Called with a text-fetcher so the provider can inspect the entry page
   * (e.g. to read a <meta name="tocs"> split-TOC list) without coupling the
   * shared fetch layer to vendor-specific page markup.
   */
  discoverTocUrls(url: URL, fetchText: (u: string) => Promise<string>): Promise<string[]>;
  /**
   * Optional vendor-specific HTML preprocessing.
   * Called on $main after junk selectors are removed, before Turndown runs.
   * The provider receives both the full CheerioAPI (for global queries such as
   * tab-flattening) and the scoped $main element.
   */
  preprocessHtml?($: CheerioAPI, $main: Cheerio<any>): void;
}
