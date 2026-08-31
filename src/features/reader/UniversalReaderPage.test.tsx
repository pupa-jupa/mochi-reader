import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../app/bridge';
import type { WorkDetails } from '../../types/library';
import { UniversalReaderPage } from './UniversalReaderPage';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('universal reader routing', () => {
  it('resumes a remote manga from its persisted chapter and page', async () => {
    const work: WorkDetails = {
      id: 'remote-work-1',
      title: 'Moon Panels',
      author: null,
      kind: 'manga',
      format: 'remote_manga',
      coverPath: null,
      status: 'reading',
      favorite: false,
      progressPercent: 50,
      missingFile: false,
      addedAt: '2026-08-31T00:00:00Z',
      lastOpenedAt: '2026-08-31T01:00:00Z',
      originalTitle: null,
      description: 'A quiet lunar story.',
      sourcePath: 'https://panels.example/manga/moon',
      fileSize: 0,
      pageCount: null,
      chapterCount: 3,
      originKind: 'remote',
      sourceId: 'source-1',
      remoteId: 'moon',
      remoteUrl: 'https://panels.example/manga/moon',
      remoteCoverUrl: 'https://panels.example/covers/moon.jpg',
    };
    const bridge = {
      getWork: vi.fn().mockResolvedValue(work),
      getProgress: vi.fn().mockResolvedValue({
        contentIdentity: 'remote:source-1:moon',
        workId: work.id,
        locator: { kind: 'manga', chapterId: 'chapter-1', pageIndex: 1 },
        percent: 0.5,
        readerMode: 'manga',
        updatedAt: '2026-08-31T01:00:00Z',
      }),
      getSourceChapters: vi.fn().mockResolvedValue([
        {
          remoteId: 'chapter-1',
          title: 'Chapter 1',
          url: 'https://panels.example/chapter/1',
          attribution: null,
        },
      ]),
    } as unknown as DesktopBridge;

    render(
      <MemoryRouter initialEntries={['/read/remote-work-1']}>
        <Routes>
          <Route element={<UniversalReaderPage bridge={bridge} />} path="/read/:id" />
          <Route
            element={<><h1>Remote reader</h1><LocationProbe /></>}
            path="/sources/:sourceId/read"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Remote reader' })).toBeVisible();
    await waitFor(() => {
      expect(bridge.getSourceChapters).toHaveBeenCalledWith(
        'source-1',
        'moon',
        'https://panels.example/manga/moon',
      );
    });
    expect(screen.getByTestId('location')).toHaveTextContent('chapterId=chapter-1');
    expect(screen.getByTestId('location')).toHaveTextContent('workId=remote-work-1');
  });
});
