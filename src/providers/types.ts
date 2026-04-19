export interface TocNode {
  title: string;
  href: string | null;
  children: TocNode[];
}

export interface TocNodeFile {
  title: string;
  href: string | null;
  dirPath: string | null;
  filePath: string | null;
  children: TocNodeFile[];
}

export interface DocProvider {
  name: string;
  matches(url: URL): boolean;
  tocUrl(url: URL): string;
  startHref(url: URL): string;
  parseToc(json: unknown): TocNode[];
  guideDir(url: URL): string;
  contentSelector: string;
  junkSelectors: string[];
}
