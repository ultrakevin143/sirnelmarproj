import type { TrainingPreferences } from '@/composables/useTrainingPreferences';
import type { WorkoutExercise, WorkoutSession } from '@/types/workout';

export const localDayIndex = (date = new Date()) => (date.getDay() + 6) % 7;
export function progressionFor(
  exercise: WorkoutExercise,
  workout: WorkoutSession,
  settings: TrainingPreferences,
) {
  const sets = exercise.sets.filter((set) => set.setType !== 'warmup');
  const completed = sets.filter((set) => set.completed && set.reps != null && set.weightKg != null);
  if (!completed.length) return null;
  const last = completed.at(-1)!;
  const allTargets =
    sets.length >= (exercise.plannedSets ?? sets.length) &&
    sets.every((set) => set.completed && (set.reps ?? 0) >= settings.repMax);
  const highEffort = (workout.perceivedEffort ?? 0) >= 9;
  if (highEffort)
    return {
      weightKg: last.weightKg!,
      reps: last.reps!,
      message: 'Last session felt very hard. Repeat the load and focus on controlled reps.',
    };
  const sameLoad = completed.every((set) => set.weightKg === last.weightKg);
  if (allTargets && sameLoad && last.weightKg! > 0)
    return {
      weightKg: Math.min(1000, Math.round((last.weightKg! + settings.incrementKg) * 100) / 100),
      reps: settings.repMin,
      message: `All working sets reached ${settings.repMax} reps. Try your configured load increase and return to ${settings.repMin} reps.`,
    };
  return {
    weightKg: last.weightKg!,
    reps: Math.min(
      1000,
      last.weightKg === 0
        ? last.reps! + 1
        : Math.min(settings.repMax, Math.max(settings.repMin, last.reps! + 1)),
    ),
    message:
      'Keep the load. Aim for one more rep while completing your working sets. Adjust to how you feel.',
  };
}
