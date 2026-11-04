// Records are derived every time so edits/deletions can move or remove a badge.
function badgeHistory(workouts) {
  const result = structuredClone(workouts);
  const best = new Map();
  const chronological = [...result].filter((workout) => workout.completedAt && !workout.abandonedAt)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.id - b.id);
  for (const workout of result) for (const exercise of workout.exercises) {
    for (const set of exercise.sets) set.personalRecords = [];
  }
  for (const workout of chronological) {
    for (const exercise of [...workout.exercises].sort((a, b) => a.id - b.id)) {
      const key = exercise.exerciseId?.startsWith('custom-plan-')
        ? `planned-name:${exercise.exerciseName.trim().toLowerCase()}` : exercise.exerciseId;
      const previous = best.get(key) || { load: 0, oneRepMax: 0, bodyweightReps: 0, duration: 0, distance: 0 };
      for (const set of [...exercise.sets].sort((a, b) => a.setNumber - b.setNumber || a.id - b.id)) {
        if (!set.completed || set.setType === 'warmup') continue;
        if (set.weightKg === 0 && Number.isInteger(set.reps) && set.reps > previous.bodyweightReps) {
          set.personalRecords.push('bodyweightReps');
          previous.bodyweightReps = set.reps;
        }
        if (Number.isFinite(set.durationSeconds) && set.durationSeconds > previous.duration) {
          set.personalRecords.push('duration');
          previous.duration = set.durationSeconds;
        }
        if (Number.isFinite(set.distanceMeters) && set.distanceMeters > previous.distance) {
          set.personalRecords.push('distance');
          previous.distance = set.distanceMeters;
        }
        if (!(set.weightKg > 0) || !(set.reps >= 1)) continue;
        if (set.weightKg > previous.load) {
          set.personalRecords.push('load');
          previous.load = set.weightKg;
        }
        // Match the existing conservative rep range, using true load for a single rep.
        const estimate = set.reps <= 12 ? (set.reps === 1 ? set.weightKg : set.weightKg * (1 + set.reps / 30)) : 0;
        if (estimate > previous.oneRepMax + 1e-8) {
          set.personalRecords.push('estimated1rm');
          previous.oneRepMax = estimate;
        }
      }
      best.set(key, previous);
    }
  }
  return result;
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  // Quoting alone does not stop spreadsheet formula execution.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function historyCsv(workouts) {
  const rows = [['workout_id', 'workout_name', 'started_at_utc', 'completed_at_utc', 'status',
    'exercise', 'set_number', 'set_type', 'completed', 'weight_kg', 'reps', 'duration_seconds',
    'distance_meters', 'personal_records', 'notes', 'perceived_effort']];
  for (const workout of workouts) {
    const base = [workout.id, workout.name, workout.startedAt, workout.completedAt,
      workout.abandonedAt ? 'unfinished' : workout.completedAt ? 'finished' : 'in_progress'];
    let setRows = 0;
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        rows.push([...base, exercise.exerciseName, set.setNumber, set.setType || 'working',
          Boolean(set.completed), set.weightKg, set.reps, set.durationSeconds, set.distanceMeters,
          (set.personalRecords || []).join(';'), workout.notes, workout.perceivedEffort]);
        setRows++;
      }
      if (!exercise.sets.length) rows.push([...base, exercise.exerciseName, '', '', '', '', '', '', '', '', workout.notes, workout.perceivedEffort]);
    }
    if (!workout.exercises.length && !setRows) rows.push([...base, '', '', '', '', '', '', '', '', '', workout.notes, workout.perceivedEffort]);
  }
  return '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { badgeHistory, historyCsv };
