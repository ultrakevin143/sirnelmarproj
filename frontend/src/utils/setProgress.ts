import type { WorkoutExercise } from '@/types/workout';

export const workingSets = (exercise: WorkoutExercise) =>
  exercise.sets.filter((set) => set.setType !== 'warmup');
export const completedWorkingSets = (exercise: WorkoutExercise) =>
  workingSets(exercise).filter((set) => set.completed).length;
export const scheduledWorkingSets = (exercise: WorkoutExercise) =>
  Math.max(exercise.plannedSets ?? 0, workingSets(exercise).length, 1);
export const movementComplete = (exercise: WorkoutExercise) =>
  completedWorkingSets(exercise) >= scheduledWorkingSets(exercise);
