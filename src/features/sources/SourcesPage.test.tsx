import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import type { DesktopBridge } from '../../app/bridge';
import { SourcesPage } from './SourcesPage';

const source = {
  id: 'source-1',
  name: 'Panels',
  baseUrl: 'https://panels.example/',
  adapterKind: 'manifest' as const,
  enabled: true,
  capabilities: { search: true, download: false },
  createdAt: '2026-08-30T00:00:00Z',
  updatedAt: '2026-08-30T00:00:00Z',
};

describe('sources page', () => {
  it('connects MangaDex once and labels the API adapter', async () => {
    const mangaDexSource = {
      ...source,
      id: 'mangadex',
      name: 'MangaDex',
      baseUrl: 'https://api.mangadex.org',
      adapterKind: 'mangadex' as const,
    };
    const bridge = {
      listSources: vi.fn().mockResolvedValue([]),
      addBuiltInSource: vi.fn().mockResolvedValue(mangaDexSource),
      setSourceEnabled: vi.fn(),
      removeSource: vi.fn(),
    } as unknown as DesktopBridge;
    render(<MemoryRouter><SourcesPage bridge={bridge} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Подключить MangaDex' }));

    expect(await screen.findByRole('heading', { name: 'MangaDex' })).toBeVisible();
    expect(screen.getByText('MangaDex API')).toBeVisible();
    expect(screen.getAllByRole('heading', { name: 'MangaDex' })).toHaveLength(1);
    expect(bridge.addBuiltInSource).toHaveBeenCalledWith('mangadex');
  });

  it('adds a manifest source by URL and exposes its capabilities', async () => {
    const bridge = {
      listSources: vi.fn().mockResolvedValue([]),
      addSourceFromUrl: vi.fn().mockResolvedValue(source),
      setSourceEnabled: vi.fn(),
      removeSource: vi.fn(),
    } as unknown as DesktopBridge;
    render(<MemoryRouter><SourcesPage bridge={bridge} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Добавить по URL' }));
    fireEvent.change(screen.getByLabelText('URL источника'), {
      target: { value: 'https://panels.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить и добавить' }));

    expect(await screen.findByText('Panels')).toBeVisible();
    expect(screen.getByText('Manifest adapter')).toBeVisible();
    expect(bridge.addSourceFromUrl).toHaveBeenCalledWith('https://panels.example');
  });

  it('imports a declarative profile and can disable the source', async () => {
    const profileSource = { ...source, adapterKind: 'generic_html' as const };
    const bridge = {
      listSources: vi.fn().mockResolvedValue([profileSource]),
      importSourceProfile: vi.fn().mockResolvedValue(profileSource),
      setSourceEnabled: vi.fn().mockResolvedValue(undefined),
      removeSource: vi.fn(),
    } as unknown as DesktopBridge;
    render(<MemoryRouter><SourcesPage bridge={bridge} /></MemoryRouter>);

    const toggle = await screen.findByRole('checkbox', { name: 'Источник Panels включён' });
    fireEvent.click(toggle);

    await waitFor(() => expect(bridge.setSourceEnabled).toHaveBeenCalledWith('source-1', false));
  });

  it('checks an OPDS catalog before connecting it', async () => {
    const opdsSource = {
      ...source,
      id: 'opds-1',
      name: 'Lunar Library',
      baseUrl: 'https://books.example/opds',
      adapterKind: 'opds' as const,
      capabilities: { search: true, download: true },
    };
    const bridge = {
      listSources: vi.fn().mockResolvedValue([]),
      previewOpdsCatalog: vi.fn().mockResolvedValue({
        name: 'Lunar Library',
        catalogType: 'opds2',
        itemCount: 12,
        url: 'https://books.example/opds',
      }),
      addOpdsSource: vi.fn().mockResolvedValue(opdsSource),
      setSourceEnabled: vi.fn(),
      removeSource: vi.fn(),
    } as unknown as DesktopBridge;
    render(<MemoryRouter><SourcesPage bridge={bridge} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Подключить OPDS' }));
    fireEvent.change(screen.getByLabelText('Название каталога'), {
      target: { value: 'Моя библиотека' },
    });
    fireEvent.change(screen.getByLabelText('URL каталога'), {
      target: { value: 'https://books.example/opds' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить каталог' }));

    expect(await screen.findByRole('heading', { name: 'Lunar Library' })).toBeVisible();
    expect(screen.getByText('OPDS 2.0')).toBeVisible();
    expect(screen.getByText('12 изданий')).toBeVisible();
    expect(bridge.previewOpdsCatalog).toHaveBeenCalledWith(
      'https://books.example/opds',
      'Моя библиотека',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Подключить каталог' }));
    expect(await screen.findByText('OPDS-каталог')).toBeVisible();
    expect(bridge.addOpdsSource).toHaveBeenCalledWith(
      'https://books.example/opds',
      'Моя библиотека',
    );
  });
});
