import { describe, expect, it } from 'vitest';
import { trainingWeeks } from '../src/utils/trainingConsistency';
import {
  completedWorkingSets,
  movementComplete,
  scheduledWorkingSets,
} from '../src/utils/setProgress';
import { preferenceIssue, preferencesEqual } from '../src/utils/trainingPreferences';
import { defaultPreferences } from '../src/composables/useTrainingPreferences';
import { progressionFor } from '../src/utils/trainingProgression';
import { layoutSession } from './fixtures/workoutLayout';

describe('training consistency', () => {
  it('counts distinct local training days, excludes empty/unfinished/warmup/future sessions and crosses year boundaries', () => {
    const session = layoutSession();
    const make = (date: Date) => ({ ...structuredClone(session), completedAt: date.toISOString() });
    const now = new Date(2027, 0, 3, 18);
    const monday = make(new Date(2026, 11, 28, 10));
    const sameDay = make(new Date(2026, 11, 28, 18));
    const wednesday = make(new Date(2026, 11, 30, 10));
    const empty = { ...make(new Date(2027, 0, 1, 10)), exercises: [] };
    const warmup = make(new Date(2027, 0, 2, 10));
    warmup.exercises.forEach((e) =>
      e.sets.forEach((s) => {
        s.setType = 'warmup';
      }),
    );
    const unfinished = { ...make(new Date(2027, 0, 2, 10)), completedAt: null };
    const abandoned = { ...make(new Date(2027, 0, 2, 10)), abandonedAt: '2027-01-02' };
    const future = make(new Date(2027, 0, 4, 10));
    const weeks = trainingWeeks(
      [monday, sameDay, wednesday, empty, warmup, unfinished, abandoned, future],
      now,
    );
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)).toMatchObject({ days: 2, sessions: 3 });
    expect(new Date(weeks.at(-1)!.start).getDay()).toBe(1);
    expect(trainingWeeks([monday], new Date(2027, 0, 4, 10)).at(-1)?.days).toBe(0);
  });
});
describe('working set targets', () => {
  it('does not let completed warmups satisfy working-set targets', () => {
    const exercise = layoutSession().exercises[0]!;
    exercise.plannedSets = 2;
    exercise.sets = Array.from({ length: 3 }, (_, i) => ({
      ...exercise.sets[0]!,
      id: i,
      completed: true,
      setType: 'warmup' as const,
    }));
    expect(completedWorkingSets(exercise)).toBe(0);
    expect(scheduledWorkingSets(exercise)).toBe(2);
    expect(movementComplete(exercise)).toBe(false);
    exercise.sets.push(
      { ...exercise.sets[0]!, id: 4, setType: 'working' },
      { ...exercise.sets[0]!, id: 5, setType: 'working' },
    );
    expect(movementComplete(exercise)).toBe(true);
  });
});
describe('preferences and suggestions', () => {
  it('validates days and rep targets and compares settings without treating day order as an edit', () => {
    expect(preferenceIssue({ ...defaultPreferences, trainingDays: [] })).toContain('training days');
    expect(preferenceIssue({ ...defaultPreferences, repMin: 13, repMax: 8 })).toContain('minimum');
    expect(preferenceIssue(defaultPreferences)).toBe('');
    expect(
      preferencesEqual(defaultPreferences, { ...defaultPreferences, trainingDays: [4, 0, 2] }),
    ).toBe(true);
    expect(preferencesEqual(defaultPreferences, { ...defaultPreferences, repMax: 15 })).toBe(false);
  });
  it('repeats exact prior reps at high effort and never increases load based on mixed loads', () => {
    const workout = layoutSession();
    const exercise = workout.exercises[0]!;
    exercise.plannedSets = 2;
    exercise.sets.forEach((s) => {
      s.completed = true;
      s.reps = 16;
      s.weightKg = 0;
    });
    workout.perceivedEffort = 10;
    expect(progressionFor(exercise, workout, defaultPreferences)).toMatchObject({
      reps: 16,
      weightKg: 0,
    });
    workout.perceivedEffort = 6;
    exercise.sets[0]!.weightKg = 60;
    exercise.sets[1]!.weightKg = 40;
    expect(progressionFor(exercise, workout, defaultPreferences)?.weightKg).toBe(40);
  });
});
