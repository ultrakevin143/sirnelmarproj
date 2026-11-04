import type { ExerciseSuggestion, WorkoutSession } from '@/types/workout';

/** Actual completed working sets only: never present an estimated load as past performance. */
export function buildPreviousPerformances(workouts: WorkoutSession[]) {
  const result: Record<string, ExerciseSuggestion> = {};
  const completed = workouts
    .filter((workout) => workout.completedAt && !workout.abandonedAt)
    .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!));
  for (const workout of completed) {
    for (const exercise of workout.exercises) {
      const key = exercise.exerciseSlug || exercise.exerciseId;
      if (result[key]) continue;
      const set = [...exercise.sets]
        .reverse()
        .find(
          (entry) =>
            entry.completed &&
            entry.setType !== 'warmup' &&
            entry.weightKg !== null &&
            entry.reps !== null,
        );
      if (!set) continue;
      result[key] = {
        exerciseId: exercise.exerciseId,
        suggestion: null,
        last: {
          weightKg: set.weightKg!,
          reps: set.reps!,
          completedAt: workout.completedAt!,
          workoutId: workout.id,
        },
      };
    }
  }
  return result;
}
