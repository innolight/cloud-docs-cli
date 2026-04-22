import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parse as yamlParse } from 'yaml';
import type { TocNode } from './providers/types.ts';
import type { RunDeps } from './run.ts';

// Mock fetchToc so tests never hit the network.
// resolveSubtree is kept real so tree-navigation logic is still exercised.
vi.mock('./toc.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./toc.ts')>();
  return { ...actual, fetchToc: vi.fn() };
});

import { run } from './run.ts';
import { fetchToc } from './toc.ts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Trailing slash → startHref="" → synthetic root wrapping the whole tree
const RDS_URL = 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/';

const SIMPLE_TREE: TocNode[] = [
  { title: 'Welcome', href: 'Welcome.html', children: [] },
  {
    title: 'DB Instances',
    href: null,
    children: [
      { title: 'Overview', href: 'Overview.html', children: [] },
      { title: 'Classes', href: 'Classes.html', children: [] },
    ],
  },
];

const PAGE_HTML = (title: string) => `
<html><body>
  <div id="main-col-body"><h1>${title}</h1><p>Content for ${title}.</p></div>
</body></html>`;

// ─── Stub helpers ─────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<RunDeps> = {}): RunDeps & {
  written: Map<string, string>;
  dirs: Set<string>;
} {
  const written = new Map<string, string>();
  const dirs = new Set<string>();

  const deps: RunDeps = {
    fetchText: vi.fn(),
    fetchPage: vi.fn().mockImplementation((url: string) => {
      if (url.includes('Welcome.html')) return Promise.resolve(PAGE_HTML('Welcome'));
      if (url.includes('Overview.html')) return Promise.resolve(PAGE_HTML('Overview'));
      if (url.includes('Classes.html')) return Promise.resolve(PAGE_HTML('Classes'));
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    }),
    writeFile: vi.fn().mockImplementation((p: string, data: string) => {
      written.set(p, data);
      return Promise.resolve();
    }),
    exists: vi.fn().mockResolvedValue(false),
    ensureDir: vi.fn().mockImplementation((d: string) => {
      dirs.add(d);
      return Promise.resolve();
    }),
    sleep: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    errorLog: vi.fn(),
    ...overrides,
  };

  return Object.assign(deps, { written, dirs });
}

beforeEach(() => {
  vi.mocked(fetchToc).mockResolvedValue(SIMPLE_TREE);
});

// ─── Basic walk ───────────────────────────────────────────────────────────────

describe('run — basic walk', () => {
  it('writes all three leaf pages', async () => {
    const deps = makeDeps();
    const stats = await run({ url: RDS_URL, outDir: '/virtual', delayMs: 0, deps });

    expect(stats.written).toBe(3);
    expect(stats.skipped).toBe(0);
    expect(stats.failed).toBe(0);
  });

  it('writes a content.yaml at each branch directory', async () => {
    const deps = makeDeps();
    await run({ url: RDS_URL, outDir: '/virtual', delayMs: 0, deps });

    const yamls = [...deps.written.keys()].filter((k) => k.endsWith('content.yaml'));
    expect(yamls.length).toBeGreaterThanOrEqual(1);
  });

  it('prefixes page markdown with # title and source comment', async () => {
    const deps = makeDeps();
    await run({ url: RDS_URL, outDir: '/virtual', delayMs: 0, deps });

    const mdEntries = [...deps.written.entries()].filter(([k]) => k.endsWith('.md'));
    expect(mdEntries.length).toBe(3);

    for (const [, content] of mdEntries) {
      expect(content).toMatch(/^# /);
      expect(content).toContain('<!-- source:');
    }
  });
});

// ─── Resume ───────────────────────────────────────────────────────────────────

describe('run — resume (skip existing files)', () => {
  it('skips pages when output file exists', async () => {
    const deps = makeDeps({ exists: vi.fn().mockResolvedValue(true) });
    const stats = await run({ url: RDS_URL, outDir: '/virtual', delayMs: 0, deps });

    expect(stats.skipped).toBe(3);
    expect(stats.written).toBe(0);
    expect(deps.fetchPage).not.toHaveBeenCalled();
  });
});

// ─── Error resilience ────────────────────────────────────────────────────────

describe('run — error resilience', () => {
  it('continues walking siblings when one page fetch throws', async () => {
    const deps = makeDeps({
      fetchPage: vi.fn().mockImplementation((url: string) => {
        if (url.includes('Overview.html')) return Promise.reject(new Error('HTTP 503 Unavailable'));
        if (url.includes('Welcome.html')) return Promise.resolve(PAGE_HTML('Welcome'));
        if (url.includes('Classes.html')) return Promise.resolve(PAGE_HTML('Classes'));
        return Promise.reject(new Error(`Unexpected: ${url}`));
      }),
    });

    const stats = await run({ url: RDS_URL, outDir: '/virtual', delayMs: 0, deps });

    expect(stats.failed).toBe(1);
    expect(stats.written).toBe(2);
    expect(deps.errorLog).toHaveBeenCalledWith(expect.stringContaining('fail'));
  });
});

// ─── Sleep / delay ────────────────────────────────────────────────────────────

describe('run — delay behaviour', () => {
  it('calls sleep with the configured delayMs after each page attempt', async () => {
    const deps = makeDeps();
    await run({ url: RDS_URL, outDir: '/virtual', delayMs: 50, deps });

    // 3 pages → 3 sleeps
    expect(deps.sleep).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenCalledWith(50);
  });

  it('does NOT call sleep for skipped pages', async () => {
    const deps = makeDeps({ exists: vi.fn().mockResolvedValue(true) });
    await run({ url: RDS_URL, outDir: '/virtual', delayMs: 50, deps });

    expect(deps.sleep).not.toHaveBeenCalled();
  });
});

// ─── Ancestor directory threading ────────────────────────────────────────────

describe('run — nested leaf gets correct subdirectory path', () => {
  it('places a leaf page inside its ancestor section directory', async () => {
    const NESTED_TREE: TocNode[] = [
      { title: 'Intro', href: 'Intro.html', children: [] },
      {
        title: 'Networking',
        href: null,
        children: [{ title: 'Concepts', href: 'Concepts.html', children: [] }],
      },
    ];
    vi.mocked(fetchToc).mockResolvedValue(NESTED_TREE);

    const deps = makeDeps({
      fetchPage: vi.fn().mockImplementation((url: string) => {
        if (url.includes('Concepts.html')) return Promise.resolve(PAGE_HTML('Concepts'));
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      }),
    });

    const CONCEPTS_URL = 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.html';
    await run({ url: CONCEPTS_URL, outDir: '/virtual', delayMs: 0, deps });

    const mdPaths = [...deps.written.keys()].filter((k) => k.endsWith('.md'));
    // Must be nested inside 02-Networking directory (Networking is 2nd top-level item)
    expect(mdPaths.some((p) => p.match(/02-Networking[/\\]01-Concepts\.md$/))).toBe(true);
    // Must NOT be at the guide root
    expect(mdPaths.some((p) => p.match(/UserGuide[/\\]01-Concepts\.md$/))).toBe(false);
  });
});

// ─── content.yaml shape ───────────────────────────────────────────────────────

describe('run — content.yaml serialisation', () => {
  it('content.yaml is valid YAML with title and optional contents', async () => {
    const deps = makeDeps();
    await run({ url: RDS_URL, outDir: '/virtual', delayMs: 0, deps });

    const yamlEntries = [...deps.written.entries()].filter(([k]) => k.endsWith('content.yaml'));
    for (const [, yaml] of yamlEntries) {
      const obj = yamlParse(yaml);
      expect(obj).toMatchObject({ title: expect.any(String) });
    }
  });

  it('nested branch produces contents array in YAML', async () => {
    const deps = makeDeps();
    await run({ url: RDS_URL, outDir: '/virtual', delayMs: 0, deps });

    // The DB-Instances branch should have contents
    const yamlEntries = [...deps.written.entries()].filter(([k]) => k.endsWith('content.yaml'));
    const dbInstancesYaml = yamlEntries.find(([k]) => k.includes('DB-Instances'));
    expect(dbInstancesYaml).toBeDefined();

    const obj = yamlParse(dbInstancesYaml![1]);
    expect(obj.title).toBe('DB Instances');
    expect(obj.contents).toHaveLength(2);
  });
});
