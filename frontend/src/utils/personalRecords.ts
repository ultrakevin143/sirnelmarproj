import type { PersonalRecord } from '@/types/workout';

export const recordLabels: Record<PersonalRecord, string> = {
  load: 'Load',
  estimated1rm: 'Est. 1RM',
  bodyweightReps: 'Bodyweight reps',
  duration: 'Duration',
  distance: 'Distance',
};
export const recordDescriptions: Record<PersonalRecord, string> = {
  load: 'New heaviest completed working set at the time',
  estimated1rm: 'New estimated 1RM at the time (1–12 reps)',
  bodyweightReps: 'New most reps in a completed working set with 0 kg external load',
  duration: 'New longest completed working set at the time',
  distance: 'New farthest completed working set at the time',
};
