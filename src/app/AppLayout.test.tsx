import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppLayout } from './AppLayout';

describe('app layout navigation', () => {
  it('returns the content canvas to the top after changing sections', async () => {
    render(
      <MemoryRouter initialEntries={['/first']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route element={<Link to="/second">Следующий раздел</Link>} path="first" />
            <Route element={<h1>Второй раздел</h1>} path="second" />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const main = screen.getByRole('main');
    main.scrollTop = 420;

    fireEvent.click(screen.getByRole('link', { name: 'Следующий раздел' }));

    expect(await screen.findByRole('heading', { name: 'Второй раздел' })).toBeVisible();
    await waitFor(() => expect(main.scrollTop).toBe(0));
  });
});
