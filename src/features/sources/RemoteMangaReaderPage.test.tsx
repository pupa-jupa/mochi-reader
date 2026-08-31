import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../app/bridge';
import { RemoteMangaReaderPage } from './RemoteMangaReaderPage';

describe('remote manga reader page', () => {
  it('loads chapter descriptors and streams image bytes through the native bridge', async () => {
    const bridge = {
      getSourcePages: vi.fn().mockResolvedValue([
        { index: 0, label: '001.jpg', url: 'https://panels.example/pages/001.jpg' },
      ]),
      getSourcePage: vi.fn().mockResolvedValue({
        index: 0,
        dataUrl: 'data:image/jpeg;base64,AAAA',
      }),
    } as unknown as DesktopBridge;
    const parameters = new URLSearchParams({
      chapterId: 'chapter-1',
      chapterUrl: 'https://panels.example/chapter/1',
      chapterTitle: 'Chapter 1',
      mangaTitle: 'Moon Panels',
      mangaRemoteId: 'moon',
      mangaUrl: 'https://panels.example/manga/moon',
    });

    render(
      <MemoryRouter initialEntries={[`/sources/source-1/read?${parameters.toString()}`]}>
        <Routes>
          <Route
            element={<RemoteMangaReaderPage bridge={bridge} />}
            path="/sources/:sourceId/read"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('img', { name: 'Страница 1' })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,AAAA',
    );
    expect(bridge.getSourcePages).toHaveBeenCalledWith(
      'source-1',
      'chapter-1',
      'https://panels.example/chapter/1',
    );
    expect(bridge.getSourcePage).toHaveBeenCalledWith(
      'source-1',
      'https://panels.example/pages/001.jpg',
      0,
    );
  });
});
