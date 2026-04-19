import path from "node:path";
import type { TocNode, TocNodeFile } from "./providers/types.ts";
import { sanitize } from "./fs-util.ts";

export function buildFileTree(node: TocNode, dir: string, prefix = ""): TocNodeFile {
  const bareTitle = sanitize(node.title, slugFromHref(node.href) || "untitled");
  const safeTitle = prefix + bareTitle;

  if (node.children.length > 0) {
    const dirPath = path.join(dir, safeTitle);
    const filePath = node.href ? path.join(dirPath, `00-${bareTitle}.md`) : null;
    const pad = Math.max(2, String(node.children.length).length);
    const children = node.children.map((child, i) =>
      buildFileTree(child, dirPath, String(i + 1).padStart(pad, "0") + "-"),
    );
    return { title: node.title, href: node.href, dirPath, filePath, children };
  }

  return {
    title: node.title,
    href: node.href,
    dirPath: null,
    filePath: node.href ? path.join(dir, `${safeTitle}.md`) : null,
    children: [],
  };
}

function slugFromHref(href: string | null): string {
  if (!href) return "";
  return href.replace(/\.html?$/i, "").split("/").pop() ?? "";
}
