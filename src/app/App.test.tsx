import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the Mochi Reader application landmark', () => {
    render(<App />);

    expect(screen.getByRole('application', { name: 'Mochi Reader' })).toBeVisible();
  });
});
