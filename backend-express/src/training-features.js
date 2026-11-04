const { exercises } = require('@bryllim/workout-guide');

const defaults = { massUnit: 'kg', incrementKg: 2.5, repMin: 8, repMax: 12,
  goal: 'muscle', equipment: 'gym', trainingDays: [0, 2, 4], sessionMinutes: 45, onboardingComplete: false };
function readSettings(user) {
  try { return { ...defaults, ...JSON.parse(user.settings_json || '{}') }; }
  catch { return { ...defaults }; }
}
function validateSettings(body) {
  const s = { ...defaults, ...body };
  if (!['kg', 'lb'].includes(s.massUnit) || !Number.isFinite(s.incrementKg) || s.incrementKg < 0.25 || s.incrementKg > 20 ||
    !Number.isInteger(s.repMin) || !Number.isInteger(s.repMax) || s.repMin < 1 || s.repMax < s.repMin || s.repMax > 100 ||
    !['strength', 'muscle', 'fitness'].includes(s.goal) || !['gym', 'dumbbells', 'bodyweight'].includes(s.equipment) ||
    !Array.isArray(s.trainingDays) || s.trainingDays.length < 1 || s.trainingDays.length > 6 ||
    new Set(s.trainingDays).size !== s.trainingDays.length || s.trainingDays.some(d => !Number.isInteger(d) || d < 0 || d > 6) ||
    !Number.isInteger(s.sessionMinutes) || s.sessionMinutes < 20 || s.sessionMinutes > 120 || typeof s.onboardingComplete !== 'boolean') return null;
  return Object.fromEntries(Object.keys(defaults).map(key => [key, s[key]]));
}

function configureTrainingFeatures(app, database, { userId, serializeWorkout, getActiveWorkout, readPlan, insertPlan }) {
  app.get('/api/v1/training/settings', async (_req, res) => {
    const user = await database.prepare('SELECT * FROM app_users WHERE id = ?').get(userId());
    res.json({ settings: readSettings(user) });
  });
  app.put('/api/v1/training/settings', async (req, res) => {
    const settings = validateSettings(req.body);
    if (!settings) return res.status(422).json({ error: 'Check your units, rep range, load increment and training preferences.' });
    await database.prepare('UPDATE app_users SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), userId());
    res.json({ settings });
  });
  app.get('/api/v1/favorites', async (_req, res) => {
    const rows = await database.prepare('SELECT exercise_key AS key FROM exercise_favorites WHERE user_id = ? ORDER BY created_at DESC').all(userId());
    res.json({ favorites: rows.map(row => row.key) });
  });
  app.put('/api/v1/favorites/:key', async (req, res) => {
    const key = req.params.key;
    const customId = /^custom-(\d+)$/.exec(key)?.[1];
    const exists = exercises.some(e => e.id === key || e.slug === key) || (customId && await database.prepare('SELECT id FROM custom_exercises WHERE id = ? AND user_id = ?').get(Number(customId), userId()));
    if (!exists) return res.status(404).json({ error: 'Exercise not found.' });
    if (typeof req.body?.favorite !== 'boolean') return res.status(422).json({ error: 'Choose whether to favorite this exercise.' });
    await database.transaction(async () => {
      await database.prepare('DELETE FROM exercise_favorites WHERE user_id = ? AND exercise_key = ?').run(userId(), key);
      if (req.body.favorite) await database.prepare('INSERT INTO exercise_favorites (user_id, exercise_key, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id, exercise_key) DO NOTHING RETURNING exercise_key').run(userId(), key, new Date().toISOString());
    });
    res.json({ key, favorite: req.body.favorite });
  });
  app.post('/api/v1/training/starter-plan', async (req, res) => {
    if (req.body?.confirm !== true) return res.status(422).json({ error: 'Confirm replacement of your weekly plan.' });
    if (await getActiveWorkout()) return res.status(409).json({ error: 'Finish your active workout before changing your weekly plan.' });
    const user = await database.prepare('SELECT * FROM app_users WHERE id = ?').get(userId());
    const s = readSettings(user);
    const pools = {
      bodyweight: ['push-up', 'bodyweight-squat', 'forward-lunge', 'glute-bridge', 'reverse-crunch'],
      dumbbells: ['dumbbell-bench-press', 'goblet-squat', 'one-arm-dumbbell-row', 'seated-dumbbell-press', 'dumbbell-glute-bridge'],
      gym: ['bench-press', 'squat', 'lat-pulldown', 'seated-row', 'overhead-press'],
    };
    const candidates = pools[s.equipment].map(slug => exercises.find(e => e.slug === slug)).filter(Boolean);
    if (candidates.length < 3) return res.status(422).json({ error: 'This equipment template is unavailable. Your existing plan was kept.' });
    const old = await readPlan();
    const count = s.sessionMinutes < 40 ? 3 : s.sessionMinutes < 65 ? 4 : 5;
    const plan = { name: `${s.goal === 'strength' ? 'Strength' : s.goal === 'fitness' ? 'Fitness' : 'Muscle'} · ${s.trainingDays.length} days`,
      days: old.days.map(day => ({ ...day, isRestDay: !s.trainingDays.includes(day.dayIndex),
        title: s.trainingDays.includes(day.dayIndex) ? 'Full body' : 'Rest & recovery', focus: s.goal,
        exercises: !s.trainingDays.includes(day.dayIndex) ? [] : candidates.slice(0, count).map(e => ({
          catalogExerciseId: e.id, exerciseSlug: e.slug, exerciseName: e.name, targetMuscle: e.primaryMuscle,
          sets: s.goal === 'fitness' ? 2 : 3, reps: s.repMin, weightKg: 0,
        })) })) };
    await database.transaction(() => insertPlan(plan));
    res.json({ plan: await readPlan() });
  });
  app.post('/api/v1/workouts/:workoutId/repeat', async (req, res) => {
    const source = await serializeWorkout(Number(req.params.workoutId));
    if (!source) return res.status(404).json({ error: 'Workout not found.' });
    if (await getActiveWorkout()) return res.status(409).json({ error: 'Finish the current workout before repeating another.' });
    try {
      const id = await database.transaction(async () => {
        const now = new Date().toISOString();
        const result = await database.prepare('INSERT INTO workout_sessions (name, started_at, user_id) VALUES (?, ?, ?)').run(source.name, now, userId());
        for (const [index, e] of source.exercises.entries()) {
          const added = await database.prepare(`INSERT INTO workout_exercises (workout_id, exercise_id, exercise_slug, exercise_name, target_muscle, planned_sets, sort_order, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(result.lastInsertRowid, e.exerciseId, e.exerciseSlug, e.exerciseName, e.targetMuscle, e.sets.length || e.plannedSets || 1, index, now);
          for (const [setIndex, set] of e.sets.entries()) await database.prepare(`INSERT INTO workout_sets (workout_exercise_id, set_number, weight_kg, reps, duration_seconds, distance_meters, set_type, is_completed, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(added.lastInsertRowid, setIndex + 1, set.weightKg, set.reps, set.durationSeconds, set.distanceMeters, set.setType, now);
        }
        return result.lastInsertRowid;
      });
      res.status(201).json({ session: await serializeWorkout(id) });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'You already have an active workout. Open Workout to continue.' });
      throw error;
    }
  });
}
module.exports = { configureTrainingFeatures, readSettings, validateSettings };
