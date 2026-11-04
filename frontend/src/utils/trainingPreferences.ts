import type { TrainingPreferences } from '@/composables/useTrainingPreferences';

export function preferenceIssue(value: TrainingPreferences) {
  if (
    !Array.isArray(value.trainingDays) ||
    value.trainingDays.length < 1 ||
    value.trainingDays.length > 6 ||
    new Set(value.trainingDays).size !== value.trainingDays.length ||
    value.trainingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    return 'Choose between 1 and 6 different training days.';
  if (
    !Number.isInteger(value.sessionMinutes) ||
    value.sessionMinutes < 20 ||
    value.sessionMinutes > 120
  )
    return 'Session length must be 20–120 whole minutes.';
  if (
    !Number.isInteger(value.repMin) ||
    !Number.isInteger(value.repMax) ||
    value.repMin < 1 ||
    value.repMax > 100 ||
    value.repMin > value.repMax
  )
    return 'Use whole-number rep targets from 1–100. The minimum must not exceed the maximum.';
  if (!Number.isFinite(value.incrementKg) || value.incrementKg < 0.25 || value.incrementKg > 20)
    return 'Choose a load increase from 0.25 to 20 kg.';
  return '';
}
export function preferencesEqual(a: TrainingPreferences, b: TrainingPreferences) {
  const keys = [
    'massUnit',
    'incrementKg',
    'repMin',
    'repMax',
    'goal',
    'equipment',
    'sessionMinutes',
    'onboardingComplete',
  ] as const;
  return (
    keys.every((key) => a[key] === b[key]) &&
    [...a.trainingDays].sort((x, y) => x - y).join(',') ===
      [...b.trainingDays].sort((x, y) => x - y).join(',')
  );
}
