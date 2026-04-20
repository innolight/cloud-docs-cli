import { describe, it, expect } from "vitest";
import path from "node:path";
import { buildFileTree } from "./naming.ts";
import type { TocNode } from "./providers/types.ts";

const leaf = (title: string, href: string): TocNode => ({ title, href, children: [] });
const branch = (title: string, href: string | null, children: TocNode[]): TocNode => ({
  title,
  href,
  children,
});

describe("buildFileTree — leaf node", () => {
  it("sets filePath and kind=leaf (no dirPath)", () => {
    const node = buildFileTree(leaf("What is RDS?", "Welcome.html"), "/out");
    expect(node.kind).toBe("leaf");
    expect(node.filePath).toBe(path.join("/out", "What-is-RDS.md"));
  });

  it("uses prefix in file name", () => {
    const node = buildFileTree(leaf("What is RDS?", "Welcome.html"), "/out", "03-");
    expect(node.filePath).toBe(path.join("/out", "03-What-is-RDS.md"));
  });

  it("sets filePath to null when href is null", () => {
    const node = buildFileTree({ title: "Intro", href: null, children: [] }, "/out");
    expect(node.filePath).toBeNull();
  });
});

describe("buildFileTree — branch node", () => {
  it("sets dirPath and null filePath when no href", () => {
    const node = buildFileTree(branch("DB Instances", null, [leaf("Overview", "a.html")]), "/out");
    expect(node.kind).toBe("branch");
    if (node.kind === "branch") {
      expect(node.dirPath).toBe(path.join("/out", "DB-Instances"));
      expect(node.filePath).toBeNull();
    }
  });

  it("sets both dirPath and filePath (00- prefix) when href present", () => {
    const node = buildFileTree(
      branch("DB Instances", "db.html", [leaf("Overview", "a.html")]),
      "/out",
    );
    expect(node.kind).toBe("branch");
    if (node.kind === "branch") {
      expect(node.dirPath).toBe(path.join("/out", "DB-Instances"));
      expect(node.filePath).toBe(path.join("/out", "DB-Instances", "00-DB-Instances.md"));
    }
  });

  it("uses sibling prefix for folder name but 00- for self-page", () => {
    const node = buildFileTree(
      branch("DB Instances", "db.html", [leaf("Overview", "a.html")]),
      "/out",
      "02-",
    );
    expect(node.kind).toBe("branch");
    if (node.kind === "branch") {
      expect(node.dirPath).toBe(path.join("/out", "02-DB-Instances"));
      expect(node.filePath).toBe(path.join("/out", "02-DB-Instances", "00-DB-Instances.md"));
    }
  });
});

describe("buildFileTree — children prefixes", () => {
  it("uses 01-, 02-, … with minimum 2 digits", () => {
    const node = buildFileTree(
      branch("Guide", null, [
        leaf("First", "a.html"),
        leaf("Second", "b.html"),
        leaf("Third", "c.html"),
      ]),
      "/out",
    );
    expect(node.kind).toBe("branch");
    if (node.kind === "branch") {
      expect(node.children[0]!.filePath).toBe(path.join("/out", "Guide", "01-First.md"));
      expect(node.children[1]!.filePath).toBe(path.join("/out", "Guide", "02-Second.md"));
      expect(node.children[2]!.filePath).toBe(path.join("/out", "Guide", "03-Third.md"));
    }
  });

  it("uses 3-digit prefix when sibling count >= 100", () => {
    const children = Array.from({ length: 100 }, (_, i) =>
      leaf(`Page ${i + 1}`, `page${i + 1}.html`),
    );
    const node = buildFileTree(branch("Guide", null, children), "/out");
    expect(node.kind).toBe("branch");
    if (node.kind === "branch") {
      expect(node.children[0]!.filePath).toBe(path.join("/out", "Guide", "001-Page-1.md"));
      expect(node.children[99]!.filePath).toBe(path.join("/out", "Guide", "100-Page-100.md"));
    }
  });
});

describe("buildFileTree — title sanitization", () => {
  it("replaces spaces with dashes", () => {
    const node = buildFileTree(leaf("Hello World", "a.html"), "/out");
    expect(node.filePath).toBe(path.join("/out", "Hello-World.md"));
  });

  it("strips trailing dots and dashes", () => {
    const node = buildFileTree(leaf("Overview.", "a.html"), "/out");
    expect(node.filePath).toBe(path.join("/out", "Overview.md"));
  });

  it("removes commas", () => {
    const node = buildFileTree(leaf("Regions, Availability Zones, and Local Zones", "a.html"), "/out");
    expect(node.filePath).toBe(path.join("/out", "Regions-Availability-Zones-and-Local-Zones.md"));
  });
});
