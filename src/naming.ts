import path from 'node:path';
import type { TocNode, TocNodeFile } from './providers/types.ts';
import { sanitize } from './fs-util.ts';

export function buildFileTree(node: TocNode, dir: string, prefix = ''): TocNodeFile {
  const bareTitle = sanitize(node.title, slugFromHref(node.href) || 'untitled');
  const safeTitle = prefix + bareTitle;

  if (node.children.length > 0) {
    const dirPath = path.join(dir, safeTitle);
    const filePath = node.href ? path.join(dirPath, `00-${bareTitle}.md`) : null;
    const pad = Math.max(2, String(node.children.length).length);
    const children = node.children.map((child, i) =>
      buildFileTree(child, dirPath, String(i + 1).padStart(pad, '0') + '-')
    );
    return { kind: 'branch', title: node.title, href: node.href, dirPath, filePath, children };
  }

  return {
    kind: 'leaf',
    title: node.title,
    href: node.href,
    filePath: node.href ? path.join(dir, `${safeTitle}.md`) : null,
  };
}

function slugFromHref(href: string | null): string {
  if (!href) return '';
  return (
    href
      .replace(/\.html?$/i, '')
      .split('/')
      .pop() ?? ''
  );
}

export interface TocSerial {
  title: string;
  href?: string;
  filePath?: string;
  contents?: TocSerial[];
}

export function fileNodeToSerial(node: TocNodeFile, base: string): TocSerial {
  const obj: TocSerial = { title: node.title };
  if (node.href !== null) obj.href = node.href;
  if (node.filePath !== null) obj.filePath = './' + path.relative(base, node.filePath);
  if (node.kind === 'branch' && node.children.length > 0) {
    obj.contents = node.children.map((c) => fileNodeToSerial(c, base));
  }
  return obj;
}
