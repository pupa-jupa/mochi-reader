import { describe, expect, it } from 'vitest';

import { resolveMotionLevel } from './uiStore';

describe('motion preferences', () => {
  it('reduces spatial motion when either preference requests reduction', () => {
    expect(resolveMotionLevel({ systemReduced: true, userReduced: false })).toBe('reduced');
    expect(resolveMotionLevel({ systemReduced: false, userReduced: true })).toBe('reduced');
    expect(resolveMotionLevel({ systemReduced: false, userReduced: false })).toBe('full');
  });
});
