export type MotionLevel = 'full' | 'reduced';

export function resolveMotionLevel(preferences: {
  systemReduced: boolean;
  userReduced: boolean;
}): MotionLevel {
  return preferences.systemReduced || preferences.userReduced ? 'reduced' : 'full';
}
