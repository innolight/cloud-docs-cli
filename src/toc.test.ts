import { describe, it, expect, vi } from 'vitest';
import type { TocNode } from './providers/types.ts';
import type { DocProvider } from './providers/types.ts';
import { findSubtree, resolveSubtree, fetchToc } from './toc.ts';

const leaf = (title: string, href: string): TocNode => ({ title, href, children: [] });
const branch = (title: string, href: string | null, children: TocNode[]): TocNode => ({
  title,
  href,
  children,
});

const tree: TocNode[] = [
  branch('UserGuide', null, [
    leaf('Welcome', 'Welcome.html'),
    branch('DB Instances', null, [leaf('Overview', 'CHAP_DBInstance.html')]),
  ]),
];

describe('findSubtree', () => {
  it('finds a top-level node by href', () => {
    const flat: TocNode[] = [leaf('Welcome', 'Welcome.html')];
    expect(findSubtree(flat, 'Welcome.html')).toBe(flat[0]);
  });

  it('finds a deeply nested node', () => {
    const node = findSubtree(tree, 'CHAP_DBInstance.html');
    expect(node?.title).toBe('Overview');
  });

  it('returns null for an unknown href', () => {
    expect(findSubtree(tree, 'missing.html')).toBeNull();
  });
});

describe('resolveSubtree — page URL (startHref provided)', () => {
  it('returns the matching node', () => {
    const { subtree } = resolveSubtree(tree, 'Welcome.html', 'UserGuide');
    expect(subtree.title).toBe('Welcome');
    expect(subtree.href).toBe('Welcome.html');
  });

  it('prefix is 01- for the first sibling', () => {
    const { prefix } = resolveSubtree(tree, 'Welcome.html', 'UserGuide');
    expect(prefix).toBe('01-');
  });

  it('prefix reflects actual sibling position, not always 01-', () => {
    const flat = [leaf('Alpha', 'a.html'), leaf('Beta', 'b.html'), leaf('Gamma', 'c.html')];
    expect(resolveSubtree(flat, 'a.html', 'G').prefix).toBe('01-');
    expect(resolveSubtree(flat, 'b.html', 'G').prefix).toBe('02-');
    expect(resolveSubtree(flat, 'c.html', 'G').prefix).toBe('03-');
  });

  it("prefix is based on the node's own parent's children, not an ancestor's", () => {
    // CHAP_DBInstance.html is the only child of DB Instances → "01-"
    // even though DB Instances is the second child of UserGuide
    const { prefix } = resolveSubtree(tree, 'CHAP_DBInstance.html', 'UserGuide');
    expect(prefix).toBe('01-');
  });

  it('returns a nested match', () => {
    const { subtree } = resolveSubtree(tree, 'CHAP_DBInstance.html', 'UserGuide');
    expect(subtree.title).toBe('Overview');
  });

  it('uses 3-digit prefix when sibling count >= 100', () => {
    const bigTree = Array.from({ length: 100 }, (_, i) =>
      leaf(`Page ${i + 1}`, `page${i + 1}.html`)
    );
    expect(resolveSubtree(bigTree, 'page1.html', 'G').prefix).toBe('001-');
    expect(resolveSubtree(bigTree, 'page100.html', 'G').prefix).toBe('100-');
  });

  it('throws when href is not found in the tree', () => {
    expect(() => resolveSubtree(tree, 'missing.html', 'UserGuide')).toThrow(
      'Could not find TOC node for href "missing.html"'
    );
  });
});

describe('resolveSubtree — ancestors', () => {
  it('returns empty ancestors when node is at top level', () => {
    const flat = [leaf('Welcome', 'Welcome.html')];
    const { ancestors } = resolveSubtree(flat, 'Welcome.html', 'Guide');
    expect(ancestors).toEqual([]);
  });

  it('returns parent ancestor for a directly nested match', () => {
    const nested = [branch('Section', null, [leaf('Page', 'page.html')])];
    const { ancestors } = resolveSubtree(nested, 'page.html', 'Guide');
    expect(ancestors).toHaveLength(1);
    expect(ancestors[0]!.node.title).toBe('Section');
    expect(ancestors[0]!.prefix).toBe('01-');
  });

  it('returns full ancestor chain ordered outer-to-inner for a deeply nested match', () => {
    // tree = [UserGuide → [Welcome, DB Instances → [Overview/CHAP_DBInstance.html]]]
    const { ancestors } = resolveSubtree(tree, 'CHAP_DBInstance.html', 'Guide');
    expect(ancestors).toHaveLength(2);
    expect(ancestors[0]!.node.title).toBe('UserGuide');
    expect(ancestors[0]!.prefix).toBe('01-'); // only top-level item
    expect(ancestors[1]!.node.title).toBe('DB Instances');
    expect(ancestors[1]!.prefix).toBe('02-'); // second child of UserGuide
  });

  it('returns empty ancestors for the trailing-slash (empty startHref) case', () => {
    const { ancestors } = resolveSubtree(tree, '', 'UserGuide');
    expect(ancestors).toEqual([]);
  });
});

describe('resolveSubtree — folder URL (empty startHref)', () => {
  it('returns a synthetic root wrapping the whole tree', () => {
    const { subtree } = resolveSubtree(tree, '', 'UserGuide');
    expect(subtree.title).toBe('UserGuide');
    expect(subtree.href).toBeNull();
    expect(subtree.children).toBe(tree);
  });

  it('uses the fallbackTitle for the synthetic root', () => {
    const { subtree } = resolveSubtree(tree, '', 'AnotherGuide');
    expect(subtree.title).toBe('AnotherGuide');
  });

  it('synthetic root has no href so buildFileTree will not write a self-page', () => {
    const { subtree } = resolveSubtree(tree, '', 'UserGuide');
    expect(subtree.href).toBeNull();
  });

  it('returns empty prefix for folder URL', () => {
    const { prefix } = resolveSubtree(tree, '', 'UserGuide');
    expect(prefix).toBe('');
  });
});

// ─── fetchToc ────────────────────────────────────────────────────────────────

function makeProvider(tocUrls: string[], tree: TocNode[]): DocProvider {
  return {
    name: 'stub',
    matches: () => true,
    startHref: () => '',
    guideDir: () => 'stub/guide',
    contentSelector: '#main',
    junkSelectors: [],
    async discoverTocUrls(_url, _fetchText) {
      return tocUrls;
    },
    parseToc(_raw: string) {
      return tree;
    },
  };
}

describe('fetchToc', () => {
  const url = new URL('https://docs.aws.amazon.com/stub/latest/Guide/page.html');

  it('calls discoverTocUrls then fetchTextFn for each TOC URL and flattens results', async () => {
    const treeA: TocNode[] = [{ title: 'A', href: 'a.html', children: [] }];
    const treeB: TocNode[] = [{ title: 'B', href: 'b.html', children: [] }];

    const provider: DocProvider = {
      ...makeProvider([], []),
      discoverTocUrls: vi
        .fn()
        .mockResolvedValue(['https://example.com/a.json', 'https://example.com/b.json']),
      parseToc: vi.fn().mockReturnValueOnce(treeA).mockReturnValueOnce(treeB),
    };

    const fetchTextFn = vi.fn().mockResolvedValue('{}');

    const result = await fetchToc(provider, url, fetchTextFn);

    expect(fetchTextFn).toHaveBeenCalledWith('https://example.com/a.json');
    expect(fetchTextFn).toHaveBeenCalledWith('https://example.com/b.json');
    expect(result).toHaveLength(2);
    expect(result[0]!.title).toBe('A');
    expect(result[1]!.title).toBe('B');
  });

  it('passes fetchTextFn to discoverTocUrls', async () => {
    const provider: DocProvider = {
      ...makeProvider([], []),
      discoverTocUrls: vi.fn().mockResolvedValue([]),
    };
    const fetchTextFn = vi.fn().mockResolvedValue('');

    await fetchToc(provider, url, fetchTextFn);

    expect(provider.discoverTocUrls).toHaveBeenCalledWith(url, fetchTextFn);
  });

  it('returns empty array when provider discovers no TOC URLs', async () => {
    const provider = makeProvider([], []);
    const result = await fetchToc(provider, url, vi.fn());
    expect(result).toEqual([]);
  });

  it('returns single flat tree from a single URL', async () => {
    const tree: TocNode[] = [
      { title: 'Welcome', href: 'Welcome.html', children: [] },
      {
        title: 'Guide',
        href: null,
        children: [{ title: 'Step 1', href: 'step1.html', children: [] }],
      },
    ];
    const provider = makeProvider(['https://example.com/toc.json'], tree);
    const fetchTextFn = vi.fn().mockResolvedValue('{}');
    const result = await fetchToc(provider, url, fetchTextFn);
    expect(result).toEqual(tree);
  });
});
