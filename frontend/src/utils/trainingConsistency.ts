type TrainingSession = {
  completedAt: string | null;
  abandonedAt?: string | null;
  exercises: Array<{ sets: Array<{ completed: boolean; setType?: string }> }>;
};

export function trainingWeeks(workouts: TrainingSession[], now = new Date(), count = 8) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(monday);
    start.setDate(start.getDate() - (count - index - 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const dates = new Set<string>();
    let sessions = 0;
    for (const workout of workouts) {
      if (!workout.completedAt || workout.abandonedAt) continue;
      const finished = new Date(workout.completedAt);
      if (!(finished >= start && finished < end && finished <= now)) continue;
      if (!workout.exercises.some((e) => e.sets.some((s) => s.completed && s.setType !== 'warmup')))
        continue;
      sessions++;
      dates.add(`${finished.getFullYear()}-${finished.getMonth()}-${finished.getDate()}`);
    }
    return {
      start: start.toISOString(),
      label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(start),
      days: dates.size,
      sessions,
    };
  });
}
