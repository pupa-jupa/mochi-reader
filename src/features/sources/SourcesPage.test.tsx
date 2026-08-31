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
});
