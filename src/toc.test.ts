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
    const { subtree } = resolveSubtree(tree, "Welcome.html", "UserGuide");
    expect(subtree.title).toBe("Welcome");
    expect(subtree.href).toBe("Welcome.html");
  });

  it("prefix is 01- for the first sibling", () => {
    const { prefix } = resolveSubtree(tree, "Welcome.html", "UserGuide");
    expect(prefix).toBe("01-");
  });

  it("prefix reflects actual sibling position, not always 01-", () => {
    const flat = [leaf("Alpha", "a.html"), leaf("Beta", "b.html"), leaf("Gamma", "c.html")];
    expect(resolveSubtree(flat, "a.html", "G").prefix).toBe("01-");
    expect(resolveSubtree(flat, "b.html", "G").prefix).toBe("02-");
    expect(resolveSubtree(flat, "c.html", "G").prefix).toBe("03-");
  });

  it("prefix is based on the node's own parent's children, not an ancestor's", () => {
    // CHAP_DBInstance.html is the only child of DB Instances → "01-"
    // even though DB Instances is the second child of UserGuide
    const { prefix } = resolveSubtree(tree, "CHAP_DBInstance.html", "UserGuide");
    expect(prefix).toBe("01-");
  });

  it("returns a nested match", () => {
    const { subtree } = resolveSubtree(tree, "CHAP_DBInstance.html", "UserGuide");
    expect(subtree.title).toBe("Overview");
  });

  it("uses 3-digit prefix when sibling count >= 100", () => {
    const bigTree = Array.from({ length: 100 }, (_, i) => leaf(`Page ${i + 1}`, `page${i + 1}.html`));
    expect(resolveSubtree(bigTree, "page1.html", "G").prefix).toBe("001-");
    expect(resolveSubtree(bigTree, "page100.html", "G").prefix).toBe("100-");
  });

  it("throws when href is not found in the tree", () => {
    expect(() => resolveSubtree(tree, "missing.html", "UserGuide")).toThrow(
      'Could not find TOC node for href "missing.html"',
    );
  });
});

describe("resolveSubtree — folder URL (empty startHref)", () => {
  it("returns a synthetic root wrapping the whole tree", () => {
    const { subtree } = resolveSubtree(tree, "", "UserGuide");
    expect(subtree.title).toBe("UserGuide");
    expect(subtree.href).toBeNull();
    expect(subtree.children).toBe(tree);
  });

  it("uses the fallbackTitle for the synthetic root", () => {
    const { subtree } = resolveSubtree(tree, "", "AnotherGuide");
    expect(subtree.title).toBe("AnotherGuide");
  });

  it("synthetic root has no href so buildFileTree will not write a self-page", () => {
    const { subtree } = resolveSubtree(tree, "", "UserGuide");
    expect(subtree.href).toBeNull();
  });

  it("returns empty prefix for folder URL", () => {
    const { prefix } = resolveSubtree(tree, "", "UserGuide");
    expect(prefix).toBe("");
  });
});
