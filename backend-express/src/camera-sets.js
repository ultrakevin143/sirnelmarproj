const { exercises } = require('@bryllim/workout-guide');
const pushup = exercises.find((exercise) => exercise.slug === 'push-up');

function configureCameraSets(app, database, userId, serializeWorkout) {
  app.post('/api/v1/workouts/:workoutId/camera-pushups', async (req, res) => {
    const { reps, requestKey } = req.body || {};
    const workoutId = Number(req.params.workoutId);
    if (!Number.isInteger(workoutId) || workoutId < 1 || !Number.isInteger(reps) || reps < 1 || reps > 1000 ||
      typeof requestKey !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestKey) ||
      Object.keys(req.body || {}).some((key) => !['reps', 'requestKey'].includes(key))) {
      return res.status(422).json({ error: 'Send a reviewed rep count of 1–1000 and a valid capture request key only.' });
    }
    const result = await database.transaction(async () => {
      const workout = await database.prepare('SELECT id, completed_at, abandoned_at FROM workout_sessions WHERE id = ? AND user_id = ? FOR UPDATE')
        .get(workoutId, userId());
      if (!workout) return { status: 404, error: 'Workout not found.' };
      const previous = await database.prepare('SELECT * FROM camera_set_imports WHERE user_id = ? AND request_key = ?').get(userId(), requestKey);
      if (previous) {
        if (previous.workout_id !== workoutId || previous.reps !== reps) return { status: 409, error: 'This capture was already saved with different details. Review the workout before starting a new capture.' };
        if (previous.set_id === null) return { status: 409, error: 'The saved set was deleted. Start a new capture instead of retrying this one.' };
        return { status: 200, setId: previous.set_id, replayed: true };
      }
      if (workout.completed_at || workout.abandoned_at) return { status: 409, error: 'Start or select an active workout before saving this set.' };
      if (!pushup) throw new Error('Push-up catalog entry is missing.');
      let exercise = await database.prepare('SELECT id FROM workout_exercises WHERE workout_id = ? AND (exercise_id = ? OR exercise_slug = ?) ORDER BY id LIMIT 1')
        .get(workoutId, pushup.id, pushup.slug);
      if (!exercise) {
        const order = (await database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM workout_exercises WHERE workout_id = ?').get(workoutId)).next;
        const inserted = await database.prepare(`INSERT INTO workout_exercises
          (workout_id, exercise_id, exercise_slug, exercise_name, target_muscle, sort_order, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`)
          .run(workoutId, pushup.id, pushup.slug, pushup.name, pushup.primaryMuscle, order, new Date().toISOString());
        exercise = { id: inserted.lastInsertRowid };
      }
      const number = (await database.prepare('SELECT COALESCE(MAX(set_number), 0) + 1 AS next FROM workout_sets WHERE workout_exercise_id = ?').get(exercise.id)).next;
      const set = await database.prepare(`INSERT INTO workout_sets
        (workout_exercise_id, set_number, weight_kg, reps, logged_at, is_completed, set_type)
        VALUES (?, ?, 0, ?, ?, 1, 'working') RETURNING id`)
        .run(exercise.id, number, reps, new Date().toISOString());
      await database.prepare(`INSERT INTO camera_set_imports (user_id, request_key, workout_id, set_id, reps, created_at)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING request_key`)
        .run(userId(), requestKey, workoutId, set.lastInsertRowid, reps, new Date().toISOString());
      return { status: 201, setId: set.lastInsertRowid, replayed: false };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(result.status).json({ session: await serializeWorkout(workoutId), setId: result.setId, replayed: result.replayed });
  });
}
module.exports = { configureCameraSets };
