import type { WeeklyPlan, WorkoutSession } from '../../src/types/workout';

export function layoutSession(): WorkoutSession {
  return {
    id: 9001,
    name: 'Push · Chest, shoulders & triceps',
    startedAt: '2026-10-20T06:00:00Z',
    completedAt: null,
    abandonedAt: null,
    planDayIndex: 0,
    notes: '',
    perceivedEffort: null,
    exercises: [
      {
        id: 101,
        exerciseId: 'incline-bench-press',
        exerciseSlug: 'incline-bench-press',
        exerciseName: 'Incline Bench Press',
        targetMuscle: 'Chest',
        plannedSets: 3,
        sets: [
          {
            id: 501,
            setNumber: 1,
            weightKg: 40,
            reps: 10,
            durationSeconds: null,
            distanceMeters: null,
            setType: 'working',
            completed: true,
          },
          {
            id: 502,
            setNumber: 2,
            weightKg: 40,
            reps: 10,
            durationSeconds: null,
            distanceMeters: null,
            setType: 'working',
            completed: false,
          },
        ],
      },
      {
        id: 102,
        exerciseId: 'shoulder-press',
        exerciseSlug: 'shoulder-press',
        exerciseName: 'Shoulder Press',
        targetMuscle: 'Shoulders',
        plannedSets: 3,
        sets: [],
      },
      {
        id: 103,
        exerciseId: 'tricep-pushdown',
        exerciseSlug: 'tricep-pushdown',
        exerciseName: 'Triceps Pushdown',
        targetMuscle: 'Triceps',
        plannedSets: 3,
        sets: [],
      },
    ],
  };
}

export function layoutHistory(): WorkoutSession[] {
  const previous = layoutSession();
  previous.id = 9000;
  previous.completedAt = '2026-10-17T07:00:00Z';
  previous.exercises[0]!.sets = [{ ...previous.exercises[0]!.sets[0]!, weightKg: 37.5, reps: 12 }];
  return [previous];
}

export function layoutPlan(): WeeklyPlan {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return {
    id: 1,
    key: 'default',
    name: 'Weekly training',
    updatedAt: '',
    days: names.map((dayName, dayIndex) => ({
      id: dayIndex + 1,
      dayIndex,
      dayName,
      shortDay: dayName.slice(0, 3),
      title: dayIndex === 6 ? 'Rest' : 'Push',
      focus: 'Chest, shoulders & triceps',
      isRestDay: dayIndex === 6,
      exercises:
        dayIndex === 6
          ? []
          : layoutSession().exercises.map((item, index) => ({
              id: index + 1,
              catalogExerciseId: item.exerciseId,
              exerciseSlug: item.exerciseSlug,
              exerciseName: item.exerciseName,
              targetMuscle: item.targetMuscle!,
              sets: 3,
              reps: 10,
              weightKg: 40,
              sortOrder: index,
            })),
    })),
  };
}
