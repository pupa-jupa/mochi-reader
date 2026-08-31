import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../app/bridge';
import { RemoteMangaReaderPage } from './RemoteMangaReaderPage';

describe('remote manga reader page', () => {
  it('loads chapter descriptors and streams image bytes through the native bridge', async () => {
    const bridge = {
      getSourcePages: vi.fn().mockResolvedValue([
        { index: 0, label: '001.jpg', url: 'https://panels.example/pages/001.jpg' },
        { index: 1, label: '002.jpg', url: 'https://panels.example/pages/002.jpg' },
      ]),
      getSourcePage: vi.fn().mockImplementation(async (_sourceId, _url, index: number) => ({
        index,
        dataUrl: `data:image/jpeg;base64,AAAA${index}`,
      })),
      addRemoteWorkToLibrary: vi.fn().mockResolvedValue('remote-work-1'),
      getProgress: vi.fn().mockResolvedValue(null),
      saveProgress: vi.fn().mockResolvedValue({}),
      startReadingSession: vi.fn().mockResolvedValue('session-1'),
      endReadingSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;
    const parameters = new URLSearchParams({
      chapterId: 'chapter-1',
      chapterUrl: 'https://panels.example/chapter/1',
      chapterTitle: 'Chapter 1',
      mangaTitle: 'Moon Panels',
      mangaRemoteId: 'moon',
      mangaUrl: 'https://panels.example/manga/moon',
      summary: 'A quiet lunar story.',
      coverUrl: 'https://panels.example/covers/moon.jpg',
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
      'data:image/jpeg;base64,AAAA0',
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
    expect(bridge.addRemoteWorkToLibrary).toHaveBeenCalledWith({
      sourceId: 'source-1',
      remoteId: 'moon',
      title: 'Moon Panels',
      description: 'A quiet lunar story.',
      remoteUrl: 'https://panels.example/manga/moon',
      coverUrl: 'https://panels.example/covers/moon.jpg',
      chapterCount: 0,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => {
      expect(bridge.saveProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          workId: 'remote-work-1',
          locator: { kind: 'manga', chapterId: 'chapter-1', pageIndex: 1 },
        }),
      );
    });
  });
});
