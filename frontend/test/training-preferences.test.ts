import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultPreferences,
  setTrainingPreferences,
  useTrainingPreferences,
} from '../src/composables/useTrainingPreferences';
import { localDayIndex, progressionFor } from '../src/utils/trainingProgression';
import { readWorkoutDraft, writeWorkoutDraft } from '../src/utils/workoutDraft';
import { layoutSession } from './fixtures/workoutLayout';

afterEach(() => {
  setTrainingPreferences();
  localStorage.clear();
});
describe('training helpers', () => {
  it('selects the local weekday with Monday at index zero', () => {
    expect(localDayIndex(new Date(2026, 9, 20, 12))).toBe(1);
    expect(localDayIndex(new Date(2026, 9, 25, 12))).toBe(6);
    expect(localDayIndex(new Date(2026, 9, 26, 12))).toBe(0);
  });
  it('converts display units without mutating canonical kilogram values', () => {
    setTrainingPreferences({ massUnit: 'lb' });
    const units = useTrainingPreferences();
    expect(units.toDisplay(60)).toBe(132.28);
    expect(units.fromDisplay(132.277357308)).toBeCloseTo(60, 5);
    expect(units.fromDisplay('')).toBeNull();
    expect(units.formatLoad(null)).toBe('—');
    setTrainingPreferences({ massUnit: 'kg' });
    expect(units.formatLoad(60)).toBe('60 kg');
  });
  it('increases load only when all working sets hit the upper target and effort is manageable', () => {
    const workout = layoutSession();
    const exercise = workout.exercises[0]!;
    exercise.plannedSets = 2;
    exercise.sets.forEach((s) => {
      s.completed = true;
      s.reps = 12;
    });
    const target = progressionFor(exercise, workout, defaultPreferences);
    expect(target).toMatchObject({ weightKg: 42.5, reps: 8 });
    exercise.sets[1]!.completed = false;
    expect(progressionFor(exercise, workout, defaultPreferences)?.weightKg).toBe(40);
    exercise.sets[1]!.completed = true;
    workout.perceivedEffort = 10;
    expect(progressionFor(exercise, workout, defaultPreferences)?.weightKg).toBe(40);
    workout.perceivedEffort = 6;
    exercise.sets.forEach((s) => {
      s.weightKg = 0;
      s.reps = 16;
    });
    expect(progressionFor(exercise, workout, defaultPreferences)).toMatchObject({
      weightKg: 0,
      reps: 17,
    });
  });
  it('restores only recent, structurally valid drafts under the requested account key', () => {
    const key = 'liftup-draft:account-a:1';
    expect(
      writeWorkoutDraft(key, { notes: 'Unfinished', effort: 7, sets: {}, edits: {}, meta: {} }),
    ).toBe(true);
    expect(readWorkoutDraft(key)?.notes).toBe('Unfinished');
    expect(readWorkoutDraft('liftup-draft:account-b:1')).toBeNull();
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        savedAt: Date.now() - 8 * 86400000,
        notes: '',
        effort: null,
        sets: {},
        edits: {},
        meta: {},
      }),
    );
    expect(readWorkoutDraft(key)).toBeNull();
    localStorage.setItem(key, '{broken');
    expect(readWorkoutDraft(key)).toBeNull();
  });
});
