import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { libraryStore } from '../../stores/libraryStore';
import { DashboardPage } from './DashboardPage';

describe('today reading journal', () => {
  it('presents the current book as the primary journal entry', () => {
    libraryStore.setState({
      status: 'ready',
      total: 1,
      items: [
        {
          id: 'work-moon',
          title: 'Лунные письма',
          author: 'Моти Сакура',
          kind: 'book',
          format: 'epub',
          coverPath: null,
          status: 'reading',
          favorite: true,
          progressPercent: 42,
          missingFile: false,
          addedAt: '2026-09-01T00:00:00Z',
          lastOpenedAt: '2026-09-01T09:00:00Z',
        },
      ],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const journal = screen.getByRole('region', { name: 'Страница читательского дневника' });
    expect(within(journal).getByRole('heading', { name: 'Лунные письма' })).toBeVisible();
    expect(within(journal).getByRole('link', { name: 'Продолжить чтение' })).toHaveAttribute(
      'href',
      '/read/work-moon',
    );
  });
});
