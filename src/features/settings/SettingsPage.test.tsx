import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../app/bridge';
import { defaultSettings, useSettingsStore } from '../../stores/settingsStore';
import { SettingsPage } from './SettingsPage';

describe('settings page', () => {
  beforeEach(() => {
    useSettingsStore.setState({ ...defaultSettings, settingsReady: true });
  });

  it('configures the disk cache and clears only transient pages by default', async () => {
    const bridge = {
      getCacheStats: vi.fn().mockResolvedValue({
        totalBytes: 128 * 1024 * 1024,
        pinnedBytes: 32 * 1024 * 1024,
        entryCount: 24,
      }),
      clearCache: vi.fn().mockResolvedValue({
        totalBytes: 32 * 1024 * 1024,
        pinnedBytes: 32 * 1024 * 1024,
        entryCount: 4,
      }),
    } as unknown as DesktopBridge;

    render(<SettingsPage bridge={bridge} />);

    expect(await screen.findByText('128 МБ занято')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Размер кэша'), { target: { value: '2048' } });
    expect(useSettingsStore.getState().cacheLimitMb).toBe(2_048);
    fireEvent.click(screen.getByRole('button', { name: 'Очистить временный кэш' }));

    await waitFor(() => expect(bridge.clearCache).toHaveBeenCalledWith(false));
    expect(await screen.findByText('32 МБ занято')).toBeVisible();
  });

  it('opens logs and copies bounded diagnostic information', async () => {
    const bridge = {
      getCacheStats: vi.fn().mockResolvedValue({ totalBytes: 0, pinnedBytes: 0, entryCount: 0 }),
      openLogDirectory: vi.fn().mockResolvedValue(undefined),
      copyDiagnosticInformation: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;

    render(<SettingsPage bridge={bridge} />);

    fireEvent.click(screen.getByRole('button', { name: 'Открыть папку логов' }));
    await waitFor(() => expect(bridge.openLogDirectory).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Скопировать диагностическую информацию' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать диагностическую информацию' }));
    expect(bridge.copyDiagnosticInformation).toHaveBeenCalledOnce();
    expect(await screen.findByText('Диагностическая информация скопирована.')).toBeVisible();
  });
});
