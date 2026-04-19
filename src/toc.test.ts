import { describe, it, expect } from "vitest";
import type { TocNode } from "./providers/types.ts";
import { findSubtree, resolveSubtree } from "./toc.ts";

const leaf = (title: string, href: string): TocNode => ({ title, href, children: [] });
const branch = (title: string, href: string | null, children: TocNode[]): TocNode => ({
  title,
  href,
  children,
});

const tree: TocNode[] = [
  branch("UserGuide", null, [
    leaf("Welcome", "Welcome.html"),
    branch("DB Instances", null, [
      leaf("Overview", "CHAP_DBInstance.html"),
    ]),
  ]),
];

describe("findSubtree", () => {
  it("finds a top-level node by href", () => {
    const flat: TocNode[] = [leaf("Welcome", "Welcome.html")];
    expect(findSubtree(flat, "Welcome.html")).toBe(flat[0]);
  });

  it("finds a deeply nested node", () => {
    const node = findSubtree(tree, "CHAP_DBInstance.html");
    expect(node?.title).toBe("Overview");
  });

  it("returns null for an unknown href", () => {
    expect(findSubtree(tree, "missing.html")).toBeNull();
  });
});

describe("resolveSubtree — page URL (startHref provided)", () => {
  it("returns the matching node", () => {
    const node = resolveSubtree(tree, "Welcome.html", "UserGuide");
    expect(node.title).toBe("Welcome");
    expect(node.href).toBe("Welcome.html");
  });

  it("returns a nested match", () => {
    const node = resolveSubtree(tree, "CHAP_DBInstance.html", "UserGuide");
    expect(node.title).toBe("Overview");
  });

  it("throws when href is not found in the tree", () => {
    expect(() => resolveSubtree(tree, "missing.html", "UserGuide")).toThrow(
      'Could not find TOC node for href "missing.html"',
    );
  });
});

describe("resolveSubtree — folder URL (empty startHref)", () => {
  it("returns a synthetic root wrapping the whole tree", () => {
    const node = resolveSubtree(tree, "", "UserGuide");
    expect(node.title).toBe("UserGuide");
    expect(node.href).toBeNull();
    expect(node.children).toBe(tree);
  });

  it("uses the fallbackTitle for the synthetic root", () => {
    const node = resolveSubtree(tree, "", "AnotherGuide");
    expect(node.title).toBe("AnotherGuide");
  });

  it("synthetic root has no href so buildFileTree will not write a self-page", () => {
    const node = resolveSubtree(tree, "", "UserGuide");
    expect(node.href).toBeNull();
  });
});
