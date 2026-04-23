import React from 'react';
import { render } from 'ink';
import type { TocNode } from '../providers/types.ts';
import { TocBrowserApp } from './app.tsx';
import type { ResolvedSelection } from './browser.ts';

export interface TocBrowserOptions {
  initialHref?: string;
}

export async function openTocBrowser(
  tree: TocNode[],
  opts: TocBrowserOptions = {}
): Promise<ResolvedSelection[]> {
  return new Promise((resolve) => {
    const { unmount } = render(
      React.createElement(TocBrowserApp, {
        tree,
        initialHref: opts.initialHref,
        onConfirm: (selections) => {
          unmount();
          resolve(selections);
        },
        onQuit: () => {
          unmount();
          resolve([]);
        },
      })
    );
  });
}
