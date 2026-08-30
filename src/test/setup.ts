import '@testing-library/jest-dom/vitest';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-motion');
});
