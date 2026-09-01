import { describe, expect, it, vi } from 'vitest';

import { createDesktopBridge } from './bridge';

describe('desktop bridge', () => {
  it('maps a library query to the native command contract', async () => {
    const invoke = vi.fn().mockResolvedValue({ items: [], total: 0 });

    await createDesktopBridge(invoke).listWorks({
      query: 'sakura',
      offset: 0,
      limit: 40,
    });

    expect(invoke).toHaveBeenCalledWith('list_works', {
      request: { query: 'sakura', offset: 0, limit: 40 },
    });
  });

  it('keeps import options inside the request payload', async () => {
    const invoke = vi.fn().mockResolvedValue({ items: [], imported: 0, failed: 0 });

    await createDesktopBridge(invoke).importPaths(['C:\\Books\\Moon.epub']);

    expect(invoke).toHaveBeenCalledWith('import_paths', {
      request: {
        paths: ['C:\\Books\\Moon.epub'],
        options: { copyIntoLibrary: false },
      },
    });
  });

  it('opens a reader document by stable work id', async () => {
    const invoke = vi.fn().mockResolvedValue({ chapters: [] });

    await createDesktopBridge(invoke).getReaderDocument('work-7');

    expect(invoke).toHaveBeenCalledWith('get_reader_document', { workId: 'work-7' });
  });

  it('requests a validated manga page by index', async () => {
    const invoke = vi.fn().mockResolvedValue({ index: 3, dataUrl: 'data:image/png;base64,' });

    await createDesktopBridge(invoke).getMangaPage('manga-2', 3);

    expect(invoke).toHaveBeenCalledWith('get_manga_page', { workId: 'manga-2', index: 3 });
  });

  it('normalizes a raw PDF response to Uint8Array', async () => {
    const buffer = new Uint8Array([37, 80, 68, 70]).buffer;
    const invoke = vi.fn().mockResolvedValue(buffer);

    const bytes = await createDesktopBridge(invoke).getPdfBytes('pdf-1');

    expect(invoke).toHaveBeenCalledWith('get_pdf_bytes', { workId: 'pdf-1' });
    expect([...bytes]).toEqual([37, 80, 68, 70]);
  });

  it('maps persistent reading state to explicit native commands', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    const bridge = createDesktopBridge(invoke);

    await bridge.getProgress('work-2');
    await bridge.saveProgress({
      workId: 'work-2',
      locator: { kind: 'book', chapterId: 'chapter-3', charOffset: 42 },
      percent: 0.5,
    });

    expect(invoke).toHaveBeenNthCalledWith(1, 'get_progress', { workId: 'work-2' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'save_progress', {
      update: expect.objectContaining({
        workId: 'work-2',
        locator: { kind: 'book', chapterId: 'chapter-3', charOffset: 42 },
        percent: 0.5,
      }),
    });
  });

  it('maps typed reading sessions and individual history removal', async () => {
    const invoke = vi.fn().mockResolvedValue('session-1');
    const bridge = createDesktopBridge(invoke);
    const start = { kind: 'manga' as const, chapterId: 'chapter-7', pageIndex: 2 };
    const end = { kind: 'manga' as const, chapterId: 'chapter-7', pageIndex: 9 };

    await bridge.startReadingSession('work-2', start);
    await bridge.endReadingSession('session-1', end);
    await bridge.deleteHistoryEntry('session-1');

    expect(invoke).toHaveBeenNthCalledWith(1, 'start_reading_session', {
      workId: 'work-2',
      locator: start,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'end_reading_session', {
      id: 'session-1',
      locator: end,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'delete_history_entry', {
      id: 'session-1',
    });
  });

  it('keeps source profile JSON inside a typed native command', async () => {
    const invoke = vi.fn().mockResolvedValue({ id: 'source-1' });
    const profileJson = '{"schemaVersion":1}';

    await createDesktopBridge(invoke).importSourceProfile(profileJson);

    expect(invoke).toHaveBeenCalledWith('import_source_profile', { profileJson });
  });

  it('connects the built-in MangaDex source', async () => {
    const invoke = vi.fn().mockResolvedValue({ id: 'mangadex' });

    await createDesktopBridge(invoke).addBuiltInSource('mangadex');

    expect(invoke).toHaveBeenCalledWith('add_builtin_source', { kind: 'mangadex' });
  });

  it('maps source catalog search to its native command contract', async () => {
    const invoke = vi.fn().mockResolvedValue({ items: [], hasNextPage: false });

    await createDesktopBridge(invoke).searchSource('source-1', 'moon', 2);

    expect(invoke).toHaveBeenCalledWith('search_source', {
      sourceId: 'source-1',
      query: 'moon',
      page: 2,
    });
  });

  it('previews and connects OPDS catalogs through explicit native commands', async () => {
    const invoke = vi.fn().mockResolvedValue({ name: 'Lunar Library' });
    const bridge = createDesktopBridge(invoke);

    await bridge.previewOpdsCatalog('https://books.example/opds', 'My books');
    await bridge.addOpdsSource('https://books.example/opds', 'My books');

    expect(invoke).toHaveBeenNthCalledWith(1, 'preview_opds_catalog', {
      url: 'https://books.example/opds',
      name: 'My books',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'add_opds_source', {
      url: 'https://books.example/opds',
      name: 'My books',
    });
  });

  it('imports an OPDS acquisition through its source boundary', async () => {
    const invoke = vi.fn().mockResolvedValue('work-1');

    await createDesktopBridge(invoke).importOpdsBook(
      'opds-1',
      'https://books.example/moon.epub',
      'Moon Letters',
    );

    expect(invoke).toHaveBeenCalledWith('import_opds_book', {
      sourceId: 'opds-1',
      acquisitionUrl: 'https://books.example/moon.epub',
      title: 'Moon Letters',
    });
  });

  it('persists and finds a remote work through its source identity', async () => {
    const invoke = vi.fn().mockResolvedValue('remote-work-1');
    const bridge = createDesktopBridge(invoke);
    const draft = {
      sourceId: 'source-1',
      remoteId: 'moon',
      title: 'Moon Panels',
      description: null,
      remoteUrl: 'https://panels.example/manga/moon',
      coverUrl: null,
      chapterCount: 3,
    };

    await bridge.addRemoteWorkToLibrary(draft);
    await bridge.findRemoteWork('source-1', 'moon');

    expect(invoke).toHaveBeenNthCalledWith(1, 'add_remote_work_to_library', { draft });
    expect(invoke).toHaveBeenNthCalledWith(2, 'find_remote_work', {
      sourceId: 'source-1',
      remoteId: 'moon',
    });
  });

  it('maps remote chapters, pages, and image loading to explicit source commands', async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    const bridge = createDesktopBridge(invoke);

    await bridge.getSourceChapters('source-1', 'moon', 'https://panels.example/manga/moon');
    await bridge.getSourcePages('source-1', 'chapter-1', 'https://panels.example/chapter/1');
    await bridge.getSourcePage('source-1', 'https://panels.example/pages/1.jpg', 0);

    expect(invoke).toHaveBeenNthCalledWith(1, 'get_source_chapters', {
      sourceId: 'source-1',
      remoteId: 'moon',
      mangaUrl: 'https://panels.example/manga/moon',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'get_source_pages', {
      sourceId: 'source-1',
      chapterId: 'chapter-1',
      chapterUrl: 'https://panels.example/chapter/1',
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'get_source_page', {
      sourceId: 'source-1',
      pageUrl: 'https://panels.example/pages/1.jpg',
      index: 0,
    });
  });

  it('maps cache inspection and clearing without deleting offline downloads by default', async () => {
    const invoke = vi.fn().mockResolvedValue({ totalBytes: 0, pinnedBytes: 0, entryCount: 0 });
    const bridge = createDesktopBridge(invoke);

    await bridge.getCacheStats();
    await bridge.clearCache(false);

    expect(invoke).toHaveBeenNthCalledWith(1, 'get_cache_stats');
    expect(invoke).toHaveBeenNthCalledWith(2, 'clear_cache', { includeDownloads: false });
  });

  it('requests an offline chapter only through the source capability command', async () => {
    const invoke = vi.fn().mockResolvedValue({ totalPages: 12, cachedPages: 12 });

    await createDesktopBridge(invoke).downloadSourceChapter(
      'source-1',
      'chapter-1',
      'https://panels.example/chapter/1',
    );

    expect(invoke).toHaveBeenCalledWith('download_source_chapter', {
      sourceId: 'source-1',
      chapterId: 'chapter-1',
      chapterUrl: 'https://panels.example/chapter/1',
    });
  });

  it('reveals a work only through its library id', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);

    await createDesktopBridge(invoke).revealWorkSource('work-1');

    expect(invoke).toHaveBeenCalledWith('reveal_work_source', { id: 'work-1' });
  });

  it('maps metadata editing and source relinking to validated library commands', async () => {
    const invoke = vi.fn().mockResolvedValue({ id: 'work-1' });
    const bridge = createDesktopBridge(invoke);

    await bridge.updateWorkMetadata('work-1', {
      title: 'Moon',
      author: 'Mochi',
      originalTitle: null,
      description: 'Quiet story',
    });
    await bridge.relinkWorkSource('work-1', 'C:\\Books\\Moon.epub');

    expect(invoke).toHaveBeenNthCalledWith(1, 'update_work_metadata', {
      id: 'work-1',
      metadata: {
        title: 'Moon',
        author: 'Mochi',
        originalTitle: null,
        description: 'Quiet story',
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'relink_work_source', {
      id: 'work-1',
      newPath: 'C:\\Books\\Moon.epub',
    });
  });

  it('uses native commands for diagnostic actions', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const bridge = createDesktopBridge(invoke);

    await bridge.openLogDirectory();
    await bridge.copyDiagnosticInformation();

    expect(invoke).toHaveBeenNthCalledWith(1, 'open_log_directory');
    expect(invoke).toHaveBeenNthCalledWith(2, 'copy_diagnostic_information');
  });

  it('maps annotation CRUD, clipboard, and export to native commands', async () => {
    const invoke = vi.fn().mockResolvedValue({ id: 'annotation-1' });
    const bridge = createDesktopBridge(invoke);
    const locator = {
      kind: 'book' as const,
      chapterId: 'chapter-1',
      startOffset: 10,
      endOffset: 20,
      quote: { exact: 'quiet moon', prefix: '', suffix: '' },
      domRange: null,
    };
    const draft = {
      workId: 'work-1',
      kind: 'highlight' as const,
      quote: 'quiet moon',
      note: null,
      locator,
      color: 'sakura' as const,
    };

    await bridge.listAnnotations({ workId: 'work-1', kind: 'highlight' });
    await bridge.createAnnotation(draft);
    await bridge.updateAnnotation('annotation-1', { note: 'Remember', color: 'lavender' });
    await bridge.deleteAnnotation('annotation-1');
    await bridge.copyText('quiet moon');
    await bridge.exportAnnotations({ workId: 'work-1' }, 'markdown');

    expect(invoke).toHaveBeenNthCalledWith(1, 'list_annotations', {
      query: { workId: 'work-1', kind: 'highlight' },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'create_annotation', { draft });
    expect(invoke).toHaveBeenNthCalledWith(3, 'update_annotation', {
      id: 'annotation-1',
      update: { note: 'Remember', color: 'lavender' },
    });
    expect(invoke).toHaveBeenNthCalledWith(4, 'delete_annotation', { id: 'annotation-1' });
    expect(invoke).toHaveBeenNthCalledWith(5, 'copy_text', { text: 'quiet moon' });
    expect(invoke).toHaveBeenNthCalledWith(6, 'export_annotations', {
      query: { workId: 'work-1' },
      format: 'markdown',
    });
  });
});
