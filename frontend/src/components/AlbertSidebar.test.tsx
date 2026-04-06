import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentProps } from 'react';

import { AlbertSidebar } from './AlbertSidebar';

function createProps(overrides: Partial<ComponentProps<typeof AlbertSidebar>> = {}): ComponentProps<typeof AlbertSidebar> {
  return {
    collapsed: false,
    currentThreadId: 'thread-1',
    loading: false,
    onDeleteThread: () => {},
    onNewChat: () => {},
    onSelectThread: () => {},
    onToggleSidebar: () => {},
    open: false,
    threads: [
      {
        id: 'thread-1',
        messageCount: 3,
        preview: 'Preview text',
        title: 'Employment law memo',
        updatedAt: '2026-03-25T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('AlbertSidebar', () => {
  it('renders the expanded desktop sidebar by default', () => {
    const markup = renderToStaticMarkup(<AlbertSidebar {...createProps()} />);

    expect(markup).toContain('data-desktop-state="expanded"');
    expect(markup).toContain('data-mobile-state="closed"');
    expect(markup).toContain('aria-label="Fäll ihop sidopanel"');
    expect(markup).toContain('md:w-80');
  });

  it('renders a compact desktop rail when collapsed', () => {
    const markup = renderToStaticMarkup(<AlbertSidebar {...createProps({ collapsed: true })} />);

    expect(markup).toContain('data-desktop-state="collapsed"');
    expect(markup).toContain('aria-label="Expandera sidopanel"');
    expect(markup).toContain('Senaste konversationer');
    expect(markup).toContain('md:w-[4.75rem]');
  });
});
