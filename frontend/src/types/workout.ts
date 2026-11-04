import type { Exercise } from '@bryllim/workout-guide';

export type CatalogExercise = Exercise & {
  imageUrl: string;
  source: 'catalog' | 'custom';
  customExerciseId?: number;
  cues?: string;
};

export type PersonalRecord = 'load' | 'estimated1rm' | 'bodyweightReps' | 'duration' | 'distance';

export type LoggedSet = {
  id: number;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  setType?: 'warmup' | 'working';
  completed: boolean;
  personalRecords?: PersonalRecord[];
};

export type ExerciseSuggestion = {
  exerciseId: string;
  last: {
    weightKg: number;
    reps: number;
    completedAt: string;
    workoutId: number;
  } | null;
  suggestion: {
    weightKg: number;
    reps: number;
    message: string;
  } | null;
};

export type PlanTemplate = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  exerciseCount: number;
};

export type PlanTemplatePreview = {
  valid: boolean;
  warning: string;
  exerciseCount: number;
  template: { id: number; name: string };
  plan: { name: string; days: PlanDay[] };
};

export type WorkoutExercise = {
  id: number;
  exerciseId: string;
  exerciseSlug: string;
  exerciseName: string;
  targetMuscle: string | null;
  plannedSets: number | null;
  sets: LoggedSet[];
};

export type WorkoutSession = {
  id: number;
  name: string;
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  planDayIndex: number | null;
  notes: string;
  perceivedEffort: number | null;
  exercises: WorkoutExercise[];
};

export type PlannedExercise = {
  id: number;
  catalogExerciseId: string | null;
  customExerciseId?: number | null;
  exerciseSlug: string | null;
  exerciseName: string;
  targetMuscle: string;
  sets: number;
  reps: number;
  weightKg: number;
  sortOrder: number;
};

export type PlanDay = {
  id: number;
  dayIndex: number;
  dayName: string;
  shortDay: string;
  title: string;
  focus: string;
  isRestDay: boolean;
  exercises: PlannedExercise[];
};

export type WeeklyPlan = {
  id: number;
  key: string;
  name: string;
  updatedAt: string;
  days: PlanDay[];
};

export type PlanImportPreview = {
  valid: boolean;
  warning: string;
  exerciseCount: number;
  plan: { name: string; days: PlanDay[] };
};
