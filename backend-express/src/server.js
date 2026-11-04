const express = require('express');
const { AsyncLocalStorage } = require('node:async_hooks');
const { exercises, searchExercises } = require('@bryllim/workout-guide');
const { openDatabase, newTestSchema } = require('./database');
const { NEW_PROGRAM_SPLIT, readDefaultPlan: readPlan, planKeyFor } = require('./plans');
const { configureAuth } = require('./auth');
const { badgeHistory, historyCsv } = require('./history');
const { configureCameraSets } = require('./camera-sets');
const { configureTrainingFeatures, readSettings } = require('./training-features');
const { hostingOptions, validateFrontend, serveFrontend } = require('./hosting');

const requestUser = new AsyncLocalStorage();
const userId = () => {
  const id = requestUser.getStore();
  if (!id) throw new Error('Authenticated request context required.');
  return id;
};
const planKey = () => planKeyFor(userId());
const readDefaultPlan = (database) => readPlan(database, userId());

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function parseExerciseImage(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string') return false;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/);
  if (!match) return false;
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > 2 * 1024 * 1024) return false;
  const valid = match[1] === 'image/png'
    ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === 'image/jpeg'
      ? data[0] === 255 && data[1] === 216 && data.at(-2) === 255 && data.at(-1) === 217
      : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  return valid ? { data, mime: match[1] } : false;
}

async function insertImportedPlan(database, plan) {
  const currentPlan = await database.prepare('SELECT id FROM workout_plans WHERE plan_key = ?').get(planKey());
  await database.prepare('UPDATE workout_plans SET name = ?, updated_at = ? WHERE id = ?').run(plan.name, new Date().toISOString(), currentPlan.id);
  await database.prepare('DELETE FROM plan_days WHERE plan_id = ?').run(currentPlan.id);
  const insertExercise = database.prepare(`
    INSERT INTO planned_exercises (
      plan_day_id, catalog_exercise_id, custom_exercise_id, exercise_slug, exercise_name,
      target_muscle, prescribed_sets, prescribed_reps, suggested_weight_kg, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const day of plan.days) {
    const dayId = Number((await database.prepare(`
      INSERT INTO plan_days (plan_id, day_index, day_name, short_day, title, focus, is_rest_day)
      VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).run(currentPlan.id, day.dayIndex, day.dayName, day.shortDay, day.title, day.focus, Number(day.isRestDay))).lastInsertRowid);
    for (const [index, item] of day.exercises.entries()) {
      await insertExercise.run(dayId, item.catalogExerciseId, item.customExerciseId, item.exerciseSlug, item.exerciseName, item.targetMuscle, item.sets, item.reps, item.weightKg, index);
    }
  }
}

async function validateImportedPlan(body, database) {
  const input = body?.formatVersion === 1 ? body.plan : null;
  if (!input || typeof input !== 'object' || !Array.isArray(input.days) || input.days.length !== 7) {
    return { error: 'Import must be a version 1 plan containing all seven days.' };
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 80) return { error: 'Plan name must contain 1 to 80 characters.' };
  const days = [...input.days].sort((a, b) => Number(a.dayIndex) - Number(b.dayIndex));
  const normalizedDays = [];
  for (let index = 0; index < 7; index += 1) {
    const day = days[index];
    if (!day || day.dayIndex !== index || day.dayName !== WEEK_DAYS[index] || !Array.isArray(day.exercises)) {
      return { error: 'Plan days must include Monday through Sunday exactly once in order.' };
    }
    const title = typeof day.title === 'string' ? day.title.trim() : '';
    const focus = typeof day.focus === 'string' ? day.focus.trim() : '';
    if (!title || title.length > 80 || !focus || focus.length > 120 || typeof day.isRestDay !== 'boolean') {
      return { error: `${WEEK_DAYS[index]} needs a title, focus, and rest-day setting.` };
    }
    if (day.isRestDay && day.exercises.length) return { error: `${WEEK_DAYS[index]} is a rest day and cannot contain exercises.` };
    const seen = new Set();
    const normalizedExercises = [];
    for (const item of day.exercises) {
      const exerciseName = typeof item?.exerciseName === 'string' ? item.exerciseName.trim() : '';
      const targetMuscle = typeof item?.targetMuscle === 'string' ? item.targetMuscle.trim() : '';
      const { sets, reps, weightKg } = item ?? {};
      if (!exerciseName || exerciseName.length > 100 || !targetMuscle || targetMuscle.length > 80 ||
          !Number.isInteger(sets) || sets < 1 || sets > 20 || !Number.isInteger(reps) || reps < 1 || reps > 1000 ||
          typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000) {
        return { error: `An exercise on ${WEEK_DAYS[index]} has invalid name, target, sets, reps, or suggested weight.` };
      }
      const key = (item.catalogExerciseId || exerciseName).toLowerCase();
      if (seen.has(key)) return { error: `${exerciseName} appears more than once on ${WEEK_DAYS[index]}.` };
      seen.add(key);
      if (item.catalogExerciseId !== null && item.catalogExerciseId !== undefined &&
          (typeof item.catalogExerciseId !== 'string' || !exercises.some((exercise) => exercise.id === item.catalogExerciseId))) {
        return { error: `${exerciseName} references an exercise that is not in the catalog.` };
      }
      const customExerciseId = item.customExerciseId ?? null;
      if (customExerciseId !== null && (!Number.isInteger(customExerciseId) || !await (database.prepare('SELECT id FROM custom_exercises WHERE id = ? AND user_id = ?').get(customExerciseId, userId())))) {
        return { error: `${exerciseName} references a custom exercise that is not in this library.` };
      }
      if (customExerciseId !== null && item.catalogExerciseId) return { error: `${exerciseName} cannot reference both a catalog and custom exercise.` };
      normalizedExercises.push({
        catalogExerciseId: item.catalogExerciseId ?? null,
        customExerciseId,
        exerciseSlug: item.exerciseSlug ?? null,
        exerciseName,
        targetMuscle,
        sets,
        reps,
        weightKg,
      });
    }
    normalizedDays.push({
      dayIndex: index,
      dayName: WEEK_DAYS[index],
      shortDay: WEEK_DAYS[index].slice(0, 3),
      title,
      focus,
      isRestDay: day.isRestDay,
      exercises: normalizedExercises,
    });
  }
  return { plan: { name, days: normalizedDays } };
}

async function createApp({ schema, testSchema, memory = false, ...deployment } = {}) {
  const { frontendDirectory, trustProxy } = { ...hostingOptions(), ...deployment };
  validateFrontend(frontendDirectory);
  if (memory) testSchema = false;
  testSchema ??= process.env.NODE_ENV === 'test';
  schema ??= testSchema ? newTestSchema() : (process.env.DATABASE_SCHEMA || 'public');
  const database = await openDatabase({ schema, testSchema, memory });
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(express.json({ limit: '3mb' }));
  const { getUser } = configureAuth(app, database);
  app.use('/api/v1', async (req, res, next) => {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
    requestUser.run(user.id, next);
  });

  async function serializeWorkout(id) {
    const session = await (database.prepare(`
      SELECT id, name, started_at AS startedAt, completed_at AS completedAt,
        abandoned_at AS abandonedAt, plan_day_index AS planDayIndex, notes, perceived_effort AS perceivedEffort
      FROM workout_sessions WHERE id = ? AND user_id = ?
    `).get(id, userId()));
    if (!session) return null;
    const workoutExercises = await (database.prepare(`
      SELECT id, exercise_id AS exerciseId, exercise_slug AS exerciseSlug, exercise_name AS exerciseName,
        target_muscle AS targetMuscle, planned_sets AS plannedSets
      FROM workout_exercises WHERE workout_id = ? ORDER BY sort_order, id
    `).all(id));
    const getSets = database.prepare(`
      SELECT id, set_number AS setNumber, weight_kg AS weightKg, reps,
        duration_seconds AS durationSeconds, distance_meters AS distanceMeters,
        set_type AS setType, is_completed AS completed
      FROM workout_sets WHERE workout_exercise_id = ? ORDER BY set_number
    `);
    const exercisesWithSets = [];
    for (const exercise of workoutExercises) {
      exercisesWithSets.push({
        ...exercise,
        sets: (await getSets.all(exercise.id)).map((set) => ({
          ...set,
          setType: set.setType === 'warmup' ? 'warmup' : 'working',
          completed: Boolean(set.completed),
        })),
      });
    }
    return { ...session, exercises: exercisesWithSets };
  }

  async function getActiveWorkout() {
    const active = await (database.prepare('SELECT id FROM workout_sessions WHERE user_id = ? AND completed_at IS NULL AND abandoned_at IS NULL ORDER BY id DESC LIMIT 1').get(userId()));
    return active ? await (serializeWorkout(active.id)) : null;
  }

  async function activeWorkoutOrRespond(req, res) {
    const workout = await (database.prepare('SELECT id FROM workout_sessions WHERE id = ? AND user_id = ? AND completed_at IS NULL AND abandoned_at IS NULL').get(Number(req.params.workoutId), userId()));
    if (!workout) res.status(404).json({ error: 'Active workout not found.' });
    return workout;
  }

  configureCameraSets(app, database, userId, serializeWorkout);
  configureTrainingFeatures(app, database, { userId, serializeWorkout, getActiveWorkout,
    readPlan: () => readDefaultPlan(database), insertPlan: (plan) => insertImportedPlan(database, plan) });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'gym-tracker-api' }));

  app.get('/api/v1/exercises', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const muscle = typeof req.query.muscle === 'string' ? req.query.muscle.trim() : '';
    const equipment = typeof req.query.equipment === 'string' ? req.query.equipment.trim() : '';
    const results = searchExercises(query, {
      ...(muscle && muscle !== 'All' ? { primaryMuscle: muscle } : {}),
      ...(equipment && equipment !== 'All' ? { equipment } : {}),
    });
    const catalog = results.map(({ id, slug, name, exerciseType, equipment, primaryMuscle, secondaryMuscles, frames }) => ({
      id, slug, name, exerciseType, equipment, primaryMuscle, secondaryMuscles,
      frames: frames.map(({ index }) => ({ index })),
    }));
    const customRows = await database.prepare(`SELECT * FROM custom_exercises WHERE user_id = ? AND archived_at IS NULL ORDER BY name`).all(userId());
    const custom = customRows
      .filter((item) => (!query || `${item.name} ${item.primary_muscle} ${item.equipment} ${item.cues}`.toLowerCase().includes(query.toLowerCase())) &&
        (!muscle || muscle === 'All' || item.primary_muscle.toLowerCase() === muscle.toLowerCase()) &&
        (!equipment || equipment === 'All' || item.equipment.toLowerCase() === equipment.toLowerCase()))
      .map((item) => ({ id: `custom-${item.id}`, customExerciseId: item.id, source: 'custom', slug: `custom-${item.id}`, name: item.name,
        exerciseType: item.exercise_type, equipment: item.equipment, primaryMuscle: item.primary_muscle,
        secondaryMuscles: JSON.parse(item.secondary_muscles), cues: item.cues,
        imageUrl: item.image_data ? `/api/v1/exercises/custom/${item.id}/image` : null, frames: [] }));
    const entries = [...catalog.map((item) => ({ ...item, source: 'catalog' })), ...custom];
    const customCount = (await database.prepare('SELECT COUNT(*) AS count FROM custom_exercises WHERE user_id = ? AND archived_at IS NULL').get(userId())).count;
    res.json({ total: exercises.length + customCount, count: entries.length, exercises: entries });
  });

  app.post('/api/v1/exercises/custom', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const muscle = typeof req.body?.primaryMuscle === 'string' ? req.body.primaryMuscle.trim() : '';
    const equipment = typeof req.body?.equipment === 'string' ? req.body.equipment.trim() : '';
    const cues = typeof req.body?.cues === 'string' ? req.body.cues.trim() : '';
    const secondaryMuscles = Array.isArray(req.body?.secondaryMuscles) ? req.body.secondaryMuscles : [];
    const image = parseExerciseImage(req.body?.imageDataUrl);
    if (image === false) return res.status(422).json({ error: 'Use a PNG, JPEG, or WebP image up to 2 MB.' });
    if (!name || name.length > 100 || !muscle || muscle.length > 80 || !equipment || equipment.length > 80 || cues.length > 2000 || secondaryMuscles.length > 8 || secondaryMuscles.some((value) => typeof value !== 'string' || value.trim().length > 80)) return res.status(422).json({ error: 'Provide a name, primary muscle, equipment, and valid optional cues.' });
    try {
      const now = new Date().toISOString();
      const result = await (database.prepare('INSERT INTO custom_exercises (name, primary_muscle, equipment, secondary_muscles, cues, image_data, image_mime, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
        .run(name, muscle, equipment, JSON.stringify(secondaryMuscles.map((value) => value.trim()).filter(Boolean)), cues, image?.data ?? null, image?.mime ?? null, now, now, userId()));
      res.status(201).json({ customExerciseId: Number(result.lastInsertRowid) });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An active custom exercise already uses that name.' });
      throw error;
    }
  });

  app.patch('/api/v1/exercises/custom/:id', async (req, res) => {
    const id = Number(req.params.id);
    const existing = await (database.prepare('SELECT * FROM custom_exercises WHERE id = ? AND user_id = ? AND archived_at IS NULL').get(id, userId()));
    if (!existing) return res.status(404).json({ error: 'Active custom exercise not found.' });
    const body = req.body ?? {};
    const image = body.imageDataUrl === undefined ? null : parseExerciseImage(body.imageDataUrl);
    if (image === false) return res.status(422).json({ error: 'Use a PNG, JPEG, or WebP image up to 2 MB.' });
    const values = { name: body.name ?? existing.name, primaryMuscle: body.primaryMuscle ?? existing.primary_muscle, equipment: body.equipment ?? existing.equipment, cues: body.cues ?? existing.cues };
    if (Object.values(values).some((value) => typeof value !== 'string') || !values.name.trim() || !values.primaryMuscle.trim() || !values.equipment.trim() || values.name.trim().length > 100 || values.primaryMuscle.trim().length > 80 || values.equipment.trim().length > 80 || values.cues.length > 2000) return res.status(422).json({ error: 'Custom exercise fields are invalid.' });
    try {
      await (database.prepare(`UPDATE custom_exercises SET name = ?, primary_muscle = ?, equipment = ?, cues = ?,
        image_data = CASE WHEN ? = 1 THEN ? ELSE image_data END,
        image_mime = CASE WHEN ? = 1 THEN ? ELSE image_mime END, updated_at = ? WHERE id = ?`)
        .run(values.name.trim(), values.primaryMuscle.trim(), values.equipment.trim(), values.cues.trim(), Number(body.imageDataUrl !== undefined), image?.data ?? null, Number(body.imageDataUrl !== undefined), image?.mime ?? null, new Date().toISOString(), id));
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An active custom exercise already uses that name.' });
      throw error;
    }
    res.json({ customExerciseId: id });
  });

  app.get('/api/v1/exercises/custom/:id/image', async (req, res) => {
    const row = await (database.prepare('SELECT image_data, image_mime FROM custom_exercises WHERE id = ? AND user_id = ?').get(Number(req.params.id), userId()));
    if (!row?.image_data) return res.status(404).json({ error: 'Custom exercise image not found.' });
    res.type(row.image_mime).send(row.image_data);
  });

  app.post('/api/v1/exercises/custom/:id/archive', async (req, res) => {
    const result = await (database.prepare('UPDATE custom_exercises SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND archived_at IS NULL').run(new Date().toISOString(), new Date().toISOString(), Number(req.params.id), userId()));
    if (!result.changes) return res.status(404).json({ error: 'Active custom exercise not found.' });
    res.json({ archived: true });
  });

  app.post('/api/v1/exercises/custom/:id/restore', async (req, res) => {
    try {
      const result = await (database.prepare('UPDATE custom_exercises SET archived_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND archived_at IS NOT NULL').run(new Date().toISOString(), Number(req.params.id), userId()));
      if (!result.changes) return res.status(404).json({ error: 'Archived custom exercise not found.' });
      res.json({ restored: true });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An active custom exercise already uses that name.' });
      throw error;
    }
  });

  app.get('/api/v1/plans/default', async (_req, res) => res.json({ plan: await (readDefaultPlan(database)) }));

  app.post('/api/v1/plans/default/reset', async (req, res) => {
    if (req.body?.confirm !== true) return res.status(409).json({ error: 'Confirm clearing the weekly plan by setting confirm to true.' });
    await database.transaction(async () => {
      const currentPlan = await database.prepare('SELECT id FROM workout_plans WHERE plan_key = ?').get(planKey());
      if (!currentPlan) return;
      await database.prepare(`
        DELETE FROM planned_exercises WHERE plan_day_id IN
          (SELECT id FROM plan_days WHERE plan_id = ?)
      `).run(currentPlan.id);
      const updateDay = database.prepare('UPDATE plan_days SET title = ?, focus = ?, is_rest_day = ? WHERE plan_id = ? AND day_index = ?');
      for (const [dayIndex, [title, focus, isRestDay]] of NEW_PROGRAM_SPLIT.entries()) {
        await updateDay.run(title, focus, Number(isRestDay), currentPlan.id, dayIndex);
      }
      await database.prepare('UPDATE workout_plans SET name = ?, updated_at = ? WHERE id = ?')
        .run('New training program', new Date().toISOString(), currentPlan.id);
    });
    res.json({ plan: await readDefaultPlan(database) });
  });

  app.patch('/api/v1/plans/default/days/:dayIndex', async (req, res) => {
    const dayIndex = Number(req.params.dayIndex);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return res.status(404).json({ error: 'Plan day not found.' });
    const current = await (database.prepare('SELECT * FROM plan_days WHERE plan_id = (SELECT id FROM workout_plans WHERE plan_key = ?) AND day_index = ?').get(planKey(), dayIndex));
    if (!current) return res.status(404).json({ error: 'Plan day not found.' });
    const patch = req.body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length ||
        Object.keys(patch).some((key) => !['title', 'focus', 'isRestDay'].includes(key))) {
      return res.status(422).json({ error: 'Update title, focus, or isRestDay with valid values.' });
    }
    const title = patch.title ?? current.title;
    const focus = patch.focus ?? current.focus;
    const isRestDay = patch.isRestDay ?? Boolean(current.is_rest_day);
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 80 || typeof focus !== 'string' || !focus.trim() || focus.trim().length > 120 || typeof isRestDay !== 'boolean') {
      return res.status(422).json({ error: 'Day title (1–80 chars), focus (1–120 chars), and rest-day setting are required.' });
    }
    if (isRestDay && !current.is_rest_day && await (database.prepare('SELECT 1 FROM planned_exercises WHERE plan_day_id = ?').get(current.id))) {
      return res.status(409).json({ error: 'Remove the day’s planned exercises before marking it as a rest day.' });
    }
    await (database.prepare('UPDATE plan_days SET title = ?, focus = ?, is_rest_day = ? WHERE id = ?').run(title.trim(), focus.trim(), Number(isRestDay), current.id));
    await (database.prepare('UPDATE workout_plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), current.plan_id));
    res.json({ plan: await (readDefaultPlan(database)) });
  });

  app.post('/api/v1/plans/default/days/:dayIndex/exercises', async (req, res) => {
    const dayIndex = Number(req.params.dayIndex);
    const day = await (database.prepare('SELECT id, is_rest_day FROM plan_days WHERE plan_id = (SELECT id FROM workout_plans WHERE plan_key = ?) AND day_index = ?').get(planKey(), dayIndex));
    if (!day) return res.status(404).json({ error: 'Plan day not found.' });
    if (day.is_rest_day) return res.status(409).json({ error: 'Sunday is a rest day. Change its day setting before adding exercises.' });
    const customExerciseId = Number.isInteger(req.body?.customExerciseId) ? req.body.customExerciseId : null;
    const customExercise = customExerciseId ? await (database.prepare('SELECT * FROM custom_exercises WHERE id = ? AND user_id = ? AND archived_at IS NULL').get(customExerciseId, userId())) : null;
    if (customExerciseId && !customExercise) return res.status(422).json({ error: 'Choose an active custom exercise from the library.' });
    const catalogExerciseId = typeof req.body?.catalogExerciseId === 'string' ? req.body.catalogExerciseId : null;
    const guideExercise = catalogExerciseId ? exercises.find((item) => item.id === catalogExerciseId) : null;
    if (catalogExerciseId && !guideExercise) return res.status(422).json({ error: 'Choose an exercise from the guide catalog or omit catalogExerciseId for a custom exercise.' });
    const exerciseName = (guideExercise?.name ?? customExercise?.name ?? (typeof req.body?.exerciseName === 'string' ? req.body.exerciseName : '')).trim();
    const targetMuscle = (guideExercise?.primaryMuscle ?? customExercise?.primary_muscle ?? (typeof req.body?.targetMuscle === 'string' ? req.body.targetMuscle : '')).trim();
    const sets = req.body?.sets;
    const reps = req.body?.reps;
    const weightKg = req.body?.weightKg;
    if (!exerciseName || exerciseName.length > 100 || !targetMuscle || targetMuscle.length > 80 ||
        !Number.isInteger(sets) || sets < 1 || sets > 20 || !Number.isInteger(reps) || reps < 1 || reps > 1000 ||
        typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000) {
      return res.status(422).json({ error: 'Provide an exercise name, target muscle, 1–20 sets, 1–1000 reps, and 0–1000 kg.' });
    }
    if (await (database.prepare('SELECT 1 FROM planned_exercises WHERE plan_day_id = ? AND (catalog_exercise_id = ? OR custom_exercise_id = ? OR LOWER(exercise_name) = LOWER(?))').get(day.id, catalogExerciseId, customExerciseId, exerciseName))) {
      return res.status(409).json({ error: 'This exercise is already planned for the selected day.' });
    }
    const sortOrder = (await database.prepare('SELECT COUNT(*) AS count FROM planned_exercises WHERE plan_day_id = ?').get(day.id)).count;
    await (database.prepare(`
      INSERT INTO planned_exercises (
        plan_day_id, catalog_exercise_id, custom_exercise_id, exercise_slug, exercise_name,
        target_muscle, prescribed_sets, prescribed_reps, suggested_weight_kg, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(day.id, guideExercise?.id ?? null, customExerciseId, guideExercise?.slug ?? (customExercise ? `custom-${customExerciseId}` : null), exerciseName, targetMuscle, sets, reps, weightKg, sortOrder));
    await (database.prepare('UPDATE workout_plans SET updated_at = ? WHERE plan_key = ?').run(new Date().toISOString(), planKey()));
    res.status(201).json({ plan: await (readDefaultPlan(database)) });
  });

  app.patch('/api/v1/plans/default/exercises/:exerciseId', async (req, res) => {
    const exerciseId = Number(req.params.exerciseId);
    const item = await (database.prepare('SELECT p.*, d.plan_id FROM planned_exercises p JOIN plan_days d ON d.id = p.plan_day_id WHERE p.id = ? AND d.plan_id = (SELECT id FROM workout_plans WHERE plan_key = ?)').get(exerciseId, planKey()));
    if (!item) return res.status(404).json({ error: 'Planned exercise not found.' });
    const patch = req.body;
    const fields = { sets: 'prescribed_sets', reps: 'prescribed_reps', weightKg: 'suggested_weight_kg' };
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some((key) => !fields[key])) {
      return res.status(422).json({ error: 'Update sets, reps, or weightKg.' });
    }
    const values = { sets: item.prescribed_sets, reps: item.prescribed_reps, weightKg: item.suggested_weight_kg, ...patch };
    if (!Number.isInteger(values.sets) || values.sets < 1 || values.sets > 20 || !Number.isInteger(values.reps) || values.reps < 1 || values.reps > 1000 || typeof values.weightKg !== 'number' || !Number.isFinite(values.weightKg) || values.weightKg < 0 || values.weightKg > 1000) {
      return res.status(422).json({ error: 'Sets must be 1–20, reps 1–1000, and weight 0–1000 kg.' });
    }
    await (database.prepare('UPDATE planned_exercises SET prescribed_sets = ?, prescribed_reps = ?, suggested_weight_kg = ? WHERE id = ?').run(values.sets, values.reps, values.weightKg, exerciseId));
    await (database.prepare('UPDATE workout_plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), item.plan_id));
    res.json({ plan: await (readDefaultPlan(database)) });
  });

  app.put('/api/v1/plans/default/days/:dayIndex/exercises/order', async (req, res) => {
    const dayIndex = Number(req.params.dayIndex);
    const day = await (database.prepare('SELECT id, is_rest_day, plan_id FROM plan_days WHERE plan_id = (SELECT id FROM workout_plans WHERE plan_key = ?) AND day_index = ?').get(planKey(), dayIndex));
    if (!day) return res.status(404).json({ error: 'Plan day not found.' });
    if (!Array.isArray(req.body?.exerciseIds) || !req.body.exerciseIds.every((id) => Number.isInteger(id))) return res.status(422).json({ error: 'exerciseIds must be an ordered array of exercise ids.' });
    const existingRows = await database.prepare('SELECT id FROM planned_exercises WHERE plan_day_id = ? ORDER BY sort_order, id').all(day.id);
    const existing = existingRows.map(({ id }) => id);
    const requested = req.body.exerciseIds;
    if (requested.length !== existing.length || new Set(requested).size !== existing.length || requested.some((id) => !existing.includes(id))) {
      return res.status(422).json({ error: 'Reordering must include each exercise on this day exactly once.' });
    }
    await database.transaction(async () => {
      const update = database.prepare('UPDATE planned_exercises SET sort_order = ? WHERE id = ? AND plan_day_id = ?');
      for (const [index, id] of requested.entries()) await update.run(index, id, day.id);
      await database.prepare('UPDATE workout_plans SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), day.plan_id);
    });
    res.json({ plan: await readDefaultPlan(database) });
  });

  app.delete('/api/v1/plans/default/exercises/:exerciseId', async (req, res) => {
    const result = await (database.prepare(`
      DELETE FROM planned_exercises WHERE id = ? AND plan_day_id IN
        (SELECT id FROM plan_days WHERE plan_id = (SELECT id FROM workout_plans WHERE plan_key = ?))
    `).run(Number(req.params.exerciseId), planKey()));
    if (!result.changes) return res.status(404).json({ error: 'Planned exercise not found.' });
    await (database.prepare('UPDATE workout_plans SET updated_at = ? WHERE plan_key = ?').run(new Date().toISOString(), planKey()));
    res.json({ plan: await (readDefaultPlan(database)) });
  });

  app.get('/api/v1/plans/default/export', async (_req, res) => {
    const plan = await (readDefaultPlan(database));
    res.attachment('gym-tracker-weekly-plan.json');
    res.json({ formatVersion: 1, exportedAt: new Date().toISOString(), plan: { name: plan.name, days: plan.days } });
  });

  app.post('/api/v1/plans/default/import/preview', async (req, res) => {
    const result = await (validateImportedPlan(req.body, database));
    if (result.error) return res.status(422).json({ error: result.error });
    res.json({
      valid: true,
      warning: 'Importing this plan will replace all seven current plan days. Existing workout history will not change.',
      exerciseCount: result.plan.days.reduce((sum, day) => sum + day.exercises.length, 0),
      plan: result.plan,
    });
  });

  app.post('/api/v1/plans/default/import', async (req, res) => {
    if (req.body?.replace !== true) return res.status(409).json({ error: 'Preview the import and confirm replacement by setting replace to true.' });
    const result = await (validateImportedPlan(req.body, database));
    if (result.error) return res.status(422).json({ error: result.error });
    await database.transaction(async () => await (insertImportedPlan(database, result.plan)));
    res.json({ plan: await readDefaultPlan(database) });
  });

  app.get('/api/v1/plans/templates', async (_req, res) => {
    const rows = await database.prepare(`
      SELECT id, name, created_at AS createdAt, updated_at AS updatedAt, plan_json AS planJson
      FROM plan_templates WHERE user_id = ? ORDER BY name
    `).all(userId());
    const templates = rows.map((row) => {
      let exerciseCount = 0;
      try {
        const parsed = JSON.parse(row.planJson);
        exerciseCount = parsed.plan?.days?.reduce((sum, d) => sum + (d.exercises?.length || 0), 0) ?? 0;
      } catch {
        // ignore
      }
      return {
        id: row.id,
        name: row.name,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        exerciseCount,
      };
    });
    res.json({ templates });
  });

  app.post('/api/v1/plans/templates', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 80) {
      return res.status(422).json({ error: 'Template name must be 1 to 80 characters.' });
    }
    const existing = await database.prepare('SELECT id FROM plan_templates WHERE LOWER(name) = LOWER(?) AND user_id = ?').get(name, userId());
    if (existing) {
      return res.status(409).json({ error: 'A template with this name already exists.' });
    }
    const currentPlan = await readDefaultPlan(database);
    const planPayload = {
      formatVersion: 1,
      plan: {
        name,
        days: currentPlan.days.map((day) => ({
          dayIndex: day.dayIndex,
          dayName: day.dayName,
          title: day.title,
          focus: day.focus,
          isRestDay: day.isRestDay,
          exercises: day.exercises.map((e) => ({
            catalogExerciseId: e.catalogExerciseId,
            customExerciseId: e.customExerciseId,
            exerciseSlug: e.exerciseSlug,
            exerciseName: e.exerciseName,
            targetMuscle: e.targetMuscle,
            sets: e.sets,
            reps: e.reps,
            weightKg: e.weightKg,
          })),
        })),
      },
    };
    const now = new Date().toISOString();
    const result = await database.prepare(`
      INSERT INTO plan_templates (name, plan_json, created_at, updated_at, user_id)
      VALUES (?, ?, ?, ?, ?) RETURNING id
    `).run(name, JSON.stringify(planPayload), now, now, userId());
    res.status(201).json({
      template: {
        id: Number(result.lastInsertRowid),
        name,
        createdAt: now,
        updatedAt: now,
        exerciseCount: currentPlan.days.reduce((sum, d) => sum + d.exercises.length, 0),
      },
    });
  });

  app.get('/api/v1/plans/templates/:templateId/preview', async (req, res) => {
    const template = await database.prepare('SELECT * FROM plan_templates WHERE id = ? AND user_id = ?').get(Number(req.params.templateId), userId());
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    let doc;
    try {
      doc = JSON.parse(template.plan_json);
    } catch {
      return res.status(500).json({ error: 'Corrupt template data.' });
    }
    const result = await validateImportedPlan(doc, database);
    if (result.error) return res.status(422).json({ error: result.error });
    res.json({
      valid: true,
      warning: 'Applying this template will replace all seven current plan days. Existing workout history will not change.',
      exerciseCount: result.plan.days.reduce((sum, day) => sum + day.exercises.length, 0),
      template: { id: template.id, name: template.name },
      plan: result.plan,
    });
  });

  app.post('/api/v1/plans/templates/:templateId/apply', async (req, res) => {
    if (req.body?.confirm !== true) {
      return res.status(409).json({ error: 'Confirm template replacement by setting confirm to true.' });
    }
    const template = await database.prepare('SELECT * FROM plan_templates WHERE id = ? AND user_id = ?').get(Number(req.params.templateId), userId());
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    let doc;
    try {
      doc = JSON.parse(template.plan_json);
    } catch {
      return res.status(500).json({ error: 'Corrupt template data.' });
    }
    const result = await validateImportedPlan(doc, database);
    if (result.error) return res.status(422).json({ error: result.error });
    await database.transaction(async () => await insertImportedPlan(database, result.plan));
    res.json({ plan: await readDefaultPlan(database) });
  });

  app.delete('/api/v1/plans/templates/:templateId', async (req, res) => {
    const result = await database.prepare('DELETE FROM plan_templates WHERE id = ? AND user_id = ?').run(Number(req.params.templateId), userId());
    if (!result.changes) return res.status(404).json({ error: 'Template not found.' });
    res.json({ success: true });
  });

  app.post('/api/v1/workouts/weekly-rollover', async (req, res) => {
    let abandonedSession = null;
    const rawWeekStart = typeof req.body?.weekStartsAt === 'string' ? req.body.weekStartsAt : '';
    const weekStartTimestamp = Date.parse(rawWeekStart);
    if (!Number.isFinite(weekStartTimestamp) || new Date(weekStartTimestamp).toISOString() !== rawWeekStart) {
      return res.status(422).json({ error: 'weekStartsAt must be a valid ISO timestamp.' });
    }
    const stale = await database.prepare(`
      SELECT id FROM workout_sessions
      WHERE completed_at IS NULL AND abandoned_at IS NULL AND started_at < ? AND user_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(rawWeekStart, userId());
    if (stale) {
      const result = await database.prepare(`
        UPDATE workout_sessions SET abandoned_at = ?
        WHERE id = ? AND completed_at IS NULL AND abandoned_at IS NULL
      `).run(new Date().toISOString(), stale.id);
      if (result.changes) abandonedSession = await serializeWorkout(stale.id);
    }
    res.json({ session: await getActiveWorkout(), ...(abandonedSession ? { abandonedSession } : {}) });
  });

  app.get('/api/v1/workouts/active', async (_req, res) => res.json({ session: await getActiveWorkout() }));

  app.get('/api/v1/workouts', async (_req, res) => {
    const sessions = await (database.prepare('SELECT id FROM workout_sessions WHERE user_id = ? ORDER BY started_at DESC, id DESC').all(userId()));
    const workouts = [];
    for (const session of sessions) workouts.push(await serializeWorkout(session.id));
    res.json({ workouts: badgeHistory(workouts) });
  });

  app.get('/api/v1/workouts/export.csv', async (_req, res) => {
    const sessions = await database.prepare('SELECT id FROM workout_sessions WHERE user_id = ? ORDER BY started_at, id').all(userId());
    const workouts = [];
    for (const session of sessions) workouts.push(await serializeWorkout(session.id));
    res.attachment('liftup-workout-history.csv').type('text/csv; charset=utf-8')
      .send(historyCsv(badgeHistory(workouts)));
  });

  app.patch('/api/v1/workouts/:workoutId/notes', async (req, res) => {
    const id = Number(req.params.workoutId);
    const workout = await (database.prepare('SELECT id FROM workout_sessions WHERE id = ? AND user_id = ?').get(id, userId()));
    if (!workout) return res.status(404).json({ error: 'Workout not found.' });
    const notes = req.body?.notes;
    if (typeof notes !== 'string' || notes.length > 5000) return res.status(422).json({ error: 'Notes must be text up to 5,000 characters.' });
    await (database.prepare('UPDATE workout_sessions SET notes = ? WHERE id = ?').run(notes.trim(), id));
    res.json({ session: await (serializeWorkout(id)) });
  });

  app.patch('/api/v1/workouts/:workoutId/effort', async (req, res) => {
    const id = Number(req.params.workoutId);
    const workout = await (database.prepare('SELECT id FROM workout_sessions WHERE id = ? AND user_id = ?').get(id, userId()));
    if (!workout) return res.status(404).json({ error: 'Workout not found.' });
    const effort = req.body?.perceivedEffort;
    if (effort !== null && (!Number.isInteger(effort) || effort < 1 || effort > 10)) {
      return res.status(422).json({ error: 'Perceived effort must be an integer from 1 to 10, or null.' });
    }
    await (database.prepare('UPDATE workout_sessions SET perceived_effort = ? WHERE id = ?').run(effort, id));
    res.json({ session: await (serializeWorkout(id)) });
  });

  function readDateRange(query) {
    const from = typeof query.from === 'string' ? Date.parse(query.from) : NaN;
    const to = typeof query.to === 'string' ? Date.parse(query.to) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 366 * 86400000) return null;
    return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  }

  app.get('/api/v1/analytics/summary', async (req, res) => {
    const range = readDateRange(req.query);
    if (!range) return res.status(422).json({ error: 'Provide a valid from/to ISO date range no longer than 366 days.' });
    const sessions = await (database.prepare(`SELECT id FROM workout_sessions
      WHERE completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ? AND user_id = ?`)
      .all(range.from, range.to, userId()));
    const sessionIds = sessions.map((item) => item.id);
    if (!sessionIds.length) return res.json({ from: range.from, to: range.to, sessions: 0, completedSets: 0, volumeKg: 0, muscleGroups: [] });
    const placeholders = sessionIds.map(() => '?').join(',');
    const aggregates = await (database.prepare(`SELECT COALESCE(e.target_muscle, 'Unspecified') AS muscle,
      COUNT(s.id) AS sets, SUM(CASE WHEN s.weight_kg IS NOT NULL AND s.reps IS NOT NULL THEN s.weight_kg * s.reps ELSE 0 END) AS volumeKg
      FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id
      WHERE s.is_completed = 1 AND (s.set_type = 'working' OR s.set_type IS NULL) AND e.workout_id IN (${placeholders})
      GROUP BY COALESCE(e.target_muscle, 'Unspecified') ORDER BY sets DESC, muscle`).all(...sessionIds));
    const completedSets = aggregates.reduce((sum, item) => sum + item.sets, 0);
    const volumeKg = aggregates.reduce((sum, item) => sum + (item.volumeKg ?? 0), 0);
    res.json({ from: range.from, to: range.to, sessions: sessions.length, completedSets,
      volumeKg: Math.round(volumeKg * 10) / 10,
      muscleGroups: aggregates.map((item) => ({ muscle: item.muscle, sets: item.sets, volumeKg: Math.round((item.volumeKg ?? 0) * 10) / 10 })) });
  });

  app.get('/api/v1/records', async (_req, res) => {
    const rows = await (database.prepare(`SELECT e.exercise_id AS exerciseId, e.exercise_name AS exerciseName,
      e.target_muscle AS targetMuscle, s.weight_kg AS weightKg, s.reps, s.duration_seconds AS durationSeconds, s.distance_meters AS distanceMeters, w.completed_at AS completedAt, w.id AS workoutId
      FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id
      JOIN workout_sessions w ON w.id = e.workout_id
      WHERE w.user_id = ? AND w.completed_at IS NOT NULL AND s.is_completed = 1 AND (s.set_type = 'working' OR s.set_type IS NULL)
        AND (s.reps >= 1 OR s.duration_seconds > 0 OR s.distance_meters > 0)
      ORDER BY w.completed_at`).all(userId()));
    const records = new Map();
    for (const row of rows) {
      const current = records.get(row.exerciseId) ?? { exerciseId: row.exerciseId, exerciseName: row.exerciseName,
        targetMuscle: row.targetMuscle, heaviestLoadKg: 0, estimatedOneRepMaxKg: null, bestReps: 0, longestSeconds: 0, farthestMeters: 0,
        workouts: new Set(), validRepWorkouts: new Set() };
      current.heaviestLoadKg = Math.max(current.heaviestLoadKg, row.weightKg);
      current.bestReps = Math.max(current.bestReps, row.reps || 0);
      current.longestSeconds = Math.max(current.longestSeconds, row.durationSeconds || 0);
      current.farthestMeters = Math.max(current.farthestMeters, row.distanceMeters || 0);
      current.workouts.add(row.workoutId);
      if (row.weightKg > 0 && row.reps >= 1 && row.reps <= 12) {
        const estimate = row.reps === 1 ? row.weightKg : row.weightKg * (1 + row.reps / 30);
        current.estimatedOneRepMaxKg = Math.max(current.estimatedOneRepMaxKg ?? 0, estimate);
        current.validRepWorkouts.add(row.workoutId);
      }
      records.set(row.exerciseId, current);
    }
    res.json({ rules: { heaviestLoad: 'Heaviest completed working set with a positive load.', estimatedOneRepMax: 'Epley estimate from completed working sets of 1–12 reps; a single rep uses the actual load.' },
      records: [...records.values()].map(({ workouts, validRepWorkouts, ...record }) => ({ ...record,
        estimatedOneRepMaxKg: validRepWorkouts.size ? Math.round(record.estimatedOneRepMaxKg * 10) / 10 : null,
        workouts: workouts.size })).sort((a, b) => b.heaviestLoadKg - a.heaviestLoadKg) });
  });

  app.get('/api/v1/progress/exercises', async (_req, res) => {
    const rows = await (database.prepare(`SELECT DISTINCT e.exercise_id AS id, e.exercise_name AS name,
      e.target_muscle AS targetMuscle FROM workout_exercises e JOIN workout_sets s ON s.workout_exercise_id = e.id
      JOIN workout_sessions w ON w.id = e.workout_id
      WHERE w.user_id = ? AND w.completed_at IS NOT NULL AND s.is_completed = 1 AND (s.set_type = 'working' OR s.set_type IS NULL)
        AND (s.reps > 0 OR s.duration_seconds > 0 OR s.distance_meters > 0)
      ORDER BY e.exercise_name`).all(userId()));
    res.json({ exercises: rows });
  });

  app.get('/api/v1/progress/:exerciseId/suggestion', async (req, res) => {
    const row = await (database.prepare(`
      SELECT s.weight_kg AS weightKg, s.reps, w.completed_at AS completedAt, w.id AS workoutId
      FROM workout_sets s
      JOIN workout_exercises e ON e.id = s.workout_exercise_id
      JOIN workout_sessions w ON w.id = e.workout_id
      WHERE e.exercise_id = ? AND w.user_id = ? AND w.completed_at IS NOT NULL AND s.is_completed = 1
        AND (s.set_type = 'working' OR s.set_type IS NULL)
        AND s.weight_kg > 0 AND s.reps IS NOT NULL
      ORDER BY w.completed_at DESC, s.set_number DESC, s.id DESC
      LIMIT 1
    `).get(req.params.exerciseId, userId()));
    if (!row) {
      return res.json({ exerciseId: req.params.exerciseId, last: null, suggestion: null });
    }
    const last = {
      weightKg: row.weightKg,
      reps: row.reps,
      completedAt: row.completedAt,
      workoutId: row.workoutId,
    };
    const settings = readSettings(await database.prepare('SELECT * FROM app_users WHERE id = ?').get(userId()));
    const session = await serializeWorkout(last.workoutId);
    const exercise = session.exercises.find(e => e.exerciseId === req.params.exerciseId);
    const working = exercise.sets.filter(s => s.setType !== 'warmup');
    const reached = working.length >= (exercise.plannedSets ?? working.length) && working.every(s => s.completed && s.reps >= settings.repMax && s.weightKg === last.weightKg);
    const highEffort = (session.perceivedEffort ?? 0) >= 9;
    const suggestion = highEffort ? { weightKg: last.weightKg, reps: last.reps, message: 'Last session felt very hard. Repeat the load and focus on controlled reps.' }
      : reached ? { weightKg: Math.min(1000, Math.round((last.weightKg + settings.incrementKg) * 100) / 100), reps: settings.repMin, message: `All working sets reached ${settings.repMax} reps. Try your configured load increase.` }
      : { weightKg: last.weightKg, reps: Math.min(settings.repMax, Math.max(settings.repMin, last.reps + 1)), message: 'Keep the load and aim for one more rep while completing your working sets.' };
    res.json({ exerciseId: req.params.exerciseId, last, suggestion });
  });

  app.get('/api/v1/progress/:exerciseId', async (req, res) => {
    const range = readDateRange(req.query);
    if (!range) return res.status(422).json({ error: 'Provide a valid from/to ISO date range no longer than 366 days.' });
    const rows = await (database.prepare(`SELECT w.id AS workoutId, w.completed_at AS completedAt, e.exercise_name AS exerciseName,
      s.weight_kg AS weightKg, s.reps, s.duration_seconds AS durationSeconds, s.distance_meters AS distanceMeters FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id
      JOIN workout_sessions w ON w.id = e.workout_id
      WHERE e.exercise_id = ? AND w.completed_at >= ? AND w.completed_at < ? AND w.user_id = ?
        AND w.completed_at IS NOT NULL AND s.is_completed = 1 AND (s.set_type = 'working' OR s.set_type IS NULL)
        AND (s.reps > 0 OR s.duration_seconds > 0 OR s.distance_meters > 0)
      ORDER BY w.completed_at, s.set_number`).all(req.params.exerciseId, range.from, range.to, userId()));
    const sessions = new Map();
    for (const row of rows) {
      const point = sessions.get(row.workoutId) ?? { workoutId: row.workoutId, date: row.completedAt,
        exerciseName: row.exerciseName, topLoadKg: 0, volumeKg: 0, estimatedOneRepMaxKg: 0, bestReps: 0, totalReps: 0, durationSeconds: 0, distanceMeters: 0 };
      point.topLoadKg = Math.max(point.topLoadKg, row.weightKg);
      point.volumeKg += row.weightKg * row.reps;
      point.bestReps = Math.max(point.bestReps, row.reps || 0);
      point.totalReps += row.reps || 0;
      point.durationSeconds += row.durationSeconds || 0;
      point.distanceMeters += row.distanceMeters || 0;
      if (row.weightKg > 0 && row.reps >= 1 && row.reps <= 12) point.estimatedOneRepMaxKg = Math.max(point.estimatedOneRepMaxKg, row.reps === 1 ? row.weightKg : row.weightKg * (1 + row.reps / 30));
      sessions.set(row.workoutId, point);
    }
    res.json({ exerciseId: req.params.exerciseId, points: [...sessions.values()].map((point) => ({ ...point,
      volumeKg: Math.round(point.volumeKg * 10) / 10,
      estimatedOneRepMaxKg: point.estimatedOneRepMaxKg ? Math.round(point.estimatedOneRepMaxKg * 10) / 10 : null })) });
  });

  app.post('/api/v1/workouts', async (req, res) => {
    if (await (getActiveWorkout())) return res.status(409).json({ error: 'Finish your active workout before starting another.' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
    const hasPlanDay = req.body?.planDayIndex !== undefined && req.body?.planDayIndex !== null;
    const planDayIndex = hasPlanDay ? Number(req.body.planDayIndex) : null;
    if (hasPlanDay && (!Number.isInteger(planDayIndex) || planDayIndex < 0 || planDayIndex > 6)) {
      return res.status(422).json({ error: 'Choose a valid day from the weekly plan.' });
    }
    const day = hasPlanDay ? await (database.prepare(`
      SELECT d.id, d.is_rest_day AS isRestDay, d.day_name AS dayName
      FROM plan_days d JOIN workout_plans p ON p.id = d.plan_id
      WHERE p.plan_key = ? AND d.day_index = ?
    `).get(planKey(), planDayIndex)) : null;
    if (hasPlanDay && !day) return res.status(404).json({ error: 'Plan day not found.' });
    if (day?.isRestDay) return res.status(409).json({ error: `${day.dayName} is a rest day. Choose a training day to start a planned workout.` });

    const workoutId = await database.transaction(async () => {
      const result = await (database.prepare('INSERT INTO workout_sessions (name, started_at, plan_day_index, user_id) VALUES (?, ?, ?, ?) RETURNING id')
        .run(name || (day?.dayName ? `${day.dayName} workout` : 'Strength session'), new Date().toISOString(), planDayIndex, userId()));
      const workoutId = Number(result.lastInsertRowid);
      if (day) {
        const planned = await (database.prepare(`
          SELECT id, catalog_exercise_id AS catalogExerciseId, custom_exercise_id AS customExerciseId, exercise_slug AS exerciseSlug,
            exercise_name AS exerciseName, target_muscle AS targetMuscle,
            prescribed_sets AS sets, prescribed_reps AS reps, suggested_weight_kg AS weightKg
          FROM planned_exercises WHERE plan_day_id = ? ORDER BY sort_order, id
        `).all(day.id));
        const insertExercise = database.prepare(`
          INSERT INTO workout_exercises (
            workout_id, exercise_id, exercise_slug, exercise_name, sort_order, added_at,
            planned_exercise_id, target_muscle, planned_sets, prescribed_reps, suggested_weight_kg, custom_exercise_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
        `);
        const insertSet = database.prepare(`
          INSERT INTO workout_sets (
            workout_exercise_id, set_number, weight_kg, reps, logged_at, is_completed
          ) VALUES (?, ?, ?, ?, ?, 0)
        `);
        for (const [index, item] of planned.entries()) {
          const guideExercise = item.catalogExerciseId ? exercises.find((exercise) => exercise.id === item.catalogExerciseId) : null;
          const exerciseId = guideExercise?.id ?? (item.customExerciseId ? `custom-${item.customExerciseId}` : `custom-plan-${item.id}`);
          const exerciseSlug = guideExercise?.slug ?? (item.customExerciseId ? `custom-${item.customExerciseId}` : `custom-plan-${item.id}`);
          const workoutExerciseId = Number((await insertExercise.run(
            workoutId, exerciseId, exerciseSlug, item.exerciseName, index, new Date().toISOString(),
            item.id, item.targetMuscle, item.sets, item.reps, item.weightKg, item.customExerciseId ?? null,
          )).lastInsertRowid);
          for (let setNumber = 1; setNumber <= item.sets; setNumber += 1) {
            await insertSet.run(workoutExerciseId, setNumber, item.weightKg, item.reps, new Date().toISOString());
          }
        }
      }
      return workoutId;
    });
    res.status(201).json({ session: await serializeWorkout(workoutId) });
  });

  app.post('/api/v1/workouts/:workoutId/finish', async (req, res) => {
    const workout = await (activeWorkoutOrRespond(req, res));
    if (!workout) return;
    const body = req.body || {};
    if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 5000)) return res.status(422).json({ error: 'Notes must contain at most 5000 characters.' });
    if (body.perceivedEffort !== undefined && body.perceivedEffort !== null && (!Number.isInteger(body.perceivedEffort) || body.perceivedEffort < 1 || body.perceivedEffort > 10)) return res.status(422).json({ error: 'Choose effort from 1 to 10, or leave it blank.' });
    const changes = body.setChanges ?? [];
    if (!Array.isArray(changes) || changes.length > 1000 || changes.some(s => !s || !Number.isInteger(s.id) || (s.weightKg !== null && (!Number.isFinite(s.weightKg) || s.weightKg < 0 || s.weightKg > 1000)) || (s.reps !== null && (!Number.isInteger(s.reps) || s.reps < 1 || s.reps > 1000)))) return res.status(422).json({ error: 'Check the weight and reps in your edited sets before finishing.' });
    const session = await serializeWorkout(workout.id);
    const sets = session.exercises.flatMap(e => e.sets);
    if (changes.some(s => !sets.some(existing => existing.id === s.id))) return res.status(422).json({ error: 'An edited set is no longer in this workout. Reload and review your session.' });
    if (changes.some(s => sets.find(existing => existing.id === s.id)?.completed && s.reps === null && !sets.find(existing => existing.id === s.id)?.durationSeconds && !sets.find(existing => existing.id === s.id)?.distanceMeters)) return res.status(422).json({ error: 'A completed set needs reps, duration or distance.' });
    await database.transaction(async () => {
      for (const set of changes) await database.prepare('UPDATE workout_sets SET weight_kg = ?, reps = ? WHERE id = ?').run(set.weightKg, set.reps, set.id);
      await database.prepare('UPDATE workout_sessions SET notes = ?, perceived_effort = ?, completed_at = ? WHERE id = ? AND user_id = ?').run(body.notes ?? session.notes, body.perceivedEffort === undefined ? session.perceivedEffort : body.perceivedEffort, new Date().toISOString(), workout.id, userId());
    });
    res.json({ session: await (serializeWorkout(Number(req.params.workoutId))) });
  });

  app.post('/api/v1/workouts/:workoutId/exercises', async (req, res) => {
    const workout = await (activeWorkoutOrRespond(req, res));
    if (!workout) return;
    const exerciseId = typeof req.body?.exerciseId === 'string' ? req.body.exerciseId : '';
    const exerciseSlug = typeof req.body?.exerciseSlug === 'string' ? req.body.exerciseSlug : '';
    const customExerciseId = Number.isInteger(req.body?.customExerciseId) ? req.body.customExerciseId : null;
    const customExercise = customExerciseId ? await (database.prepare('SELECT * FROM custom_exercises WHERE id = ? AND user_id = ? AND archived_at IS NULL').get(customExerciseId, userId())) : null;
    const exercise = exercises.find((item) => item.id === exerciseId || item.slug === exerciseSlug);
    if (customExerciseId && !customExercise) return res.status(422).json({ error: 'Choose an active custom exercise from your library.' });
    if (!exercise && !customExercise) return res.status(422).json({ error: 'Choose an active exercise from the library.' });
    const resolvedId = exercise?.id ?? `custom-${customExerciseId}`;
    if (await (database.prepare('SELECT id FROM workout_exercises WHERE workout_id = ? AND exercise_id = ?').get(workout.id, resolvedId))) {
      return res.status(409).json({ error: 'This movement is already in your workout.' });
    }
    const sortOrder = (await database.prepare('SELECT COUNT(*) AS count FROM workout_exercises WHERE workout_id = ?').get(workout.id)).count;
    await (database.prepare(`
      INSERT INTO workout_exercises (workout_id, exercise_id, exercise_slug, exercise_name, sort_order, added_at, custom_exercise_id, target_muscle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(workout.id, resolvedId, exercise?.slug ?? `custom-${customExerciseId}`, exercise?.name ?? customExercise.name, sortOrder, new Date().toISOString(), customExerciseId, exercise?.primaryMuscle ?? customExercise.primary_muscle));
    res.status(201).json({ session: await (serializeWorkout(workout.id)) });
  });

  app.delete('/api/v1/workouts/:workoutId/exercises/:exerciseId', async (req, res) => {
    const workout = await (activeWorkoutOrRespond(req, res));
    if (!workout) return;
    const result = await (database.prepare('DELETE FROM workout_exercises WHERE id = ? AND workout_id = ?').run(Number(req.params.exerciseId), workout.id));
    if (!result.changes) return res.status(404).json({ error: 'Workout movement not found.' });
    res.json({ session: await (serializeWorkout(workout.id)) });
  });

  app.post('/api/v1/workouts/:workoutId/sets', async (req, res) => {
    const workout = await (activeWorkoutOrRespond(req, res));
    if (!workout) return;
    const workoutExerciseId = Number(req.body?.workoutExerciseId);
    const item = await (database.prepare('SELECT id FROM workout_exercises WHERE id = ? AND workout_id = ?').get(workoutExerciseId, workout.id));
    if (!item) return res.status(404).json({ error: 'Add this movement to your workout before logging a set.' });
    const optionalNumber = (value) => value == null || value === '' ? null : Number(value);
    const weightKg = optionalNumber(req.body?.weightKg);
    const reps = optionalNumber(req.body?.reps);
    const durationSeconds = optionalNumber(req.body?.durationSeconds);
    const distanceMeters = optionalNumber(req.body?.distanceMeters);
    const setType = req.body?.setType === 'warmup' ? 'warmup' : 'working';
    if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000)) return res.status(422).json({ error: 'Weight must be between 0 and 1000 kg.' });
    if (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 1000)) return res.status(422).json({ error: 'Repetitions must be a whole number between 1 and 1000.' });
    if (durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86400)) return res.status(422).json({ error: 'Duration must be between 1 second and 24 hours.' });
    if (distanceMeters !== null && (!Number.isFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > 100000)) return res.status(422).json({ error: 'Distance must be between 0 and 100000 meters.' });
    if (reps === null && durationSeconds === null && distanceMeters === null) return res.status(422).json({ error: 'Enter reps, duration, or distance for this set.' });
    const setNumber = (await database.prepare('SELECT COALESCE(MAX(set_number), 0) + 1 AS next FROM workout_sets WHERE workout_exercise_id = ?').get(workoutExerciseId)).next;
    await (database.prepare(`
      INSERT INTO workout_sets (workout_exercise_id, set_number, weight_kg, reps, duration_seconds, distance_meters, logged_at, is_completed, set_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(workoutExerciseId, setNumber, weightKg, reps, durationSeconds, distanceMeters, new Date().toISOString(), setType));
    res.status(201).json({ session: await (serializeWorkout(workout.id)) });
  });

  app.delete('/api/v1/workouts/:workoutId/sets/:setId', async (req, res) => {
    const workout = await (database.prepare('SELECT id FROM workout_sessions WHERE id = ? AND user_id = ?').get(Number(req.params.workoutId), userId()));
    if (!workout) return res.status(404).json({ error: 'Workout not found.' });
    const existing = await (database.prepare(`
      SELECT s.id, s.workout_exercise_id AS workoutExerciseId
      FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id
      WHERE s.id = ? AND e.workout_id = ?
    `).get(Number(req.params.setId), workout.id));
    if (!existing) return res.status(404).json({ error: 'Workout set not found.' });
    const result = await (database.prepare(`
      DELETE FROM workout_sets WHERE id = ? AND workout_exercise_id IN
        (SELECT id FROM workout_exercises WHERE workout_id = ?)
    `).run(existing.id, workout.id));
    if (!result.changes) return res.status(404).json({ error: 'Workout set not found.' });
    const remaining = await (database.prepare('SELECT id FROM workout_sets WHERE workout_exercise_id = ? ORDER BY set_number, id').all(existing.workoutExerciseId));
    const renumber = database.prepare('UPDATE workout_sets SET set_number = ? WHERE id = ?');
    for (const [index, set] of remaining.entries()) await renumber.run(index + 1, set.id);
    res.json({ session: await (serializeWorkout(workout.id)) });
  });

  app.patch('/api/v1/workouts/:workoutId/sets/:setId', async (req, res) => {
    const workout = await (database.prepare('SELECT id FROM workout_sessions WHERE id = ? AND user_id = ?').get(Number(req.params.workoutId), userId()));
    if (!workout) return res.status(404).json({ error: 'Workout not found.' });
    const set = await (database.prepare(`
      SELECT s.* FROM workout_sets s JOIN workout_exercises e ON e.id = s.workout_exercise_id
      WHERE s.id = ? AND e.workout_id = ?
    `).get(Number(req.params.setId), workout.id));
    if (!set) return res.status(404).json({ error: 'Workout set not found.' });
    const patch = req.body;
    const allowed = ['weightKg', 'reps', 'completed', 'setType', 'durationSeconds', 'distanceMeters'];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some((key) => !allowed.includes(key))) {
      return res.status(422).json({ error: 'Update weightKg, reps, completed, setType, durationSeconds, or distanceMeters for this set.' });
    }
    const optionalNumber = (value) => value === null || value === '' ? null : Number(value);
    const weightKg = patch.weightKg === undefined ? set.weight_kg : optionalNumber(patch.weightKg);
    const reps = patch.reps === undefined ? set.reps : optionalNumber(patch.reps);
    const durationSeconds = patch.durationSeconds === undefined ? set.duration_seconds : optionalNumber(patch.durationSeconds);
    const distanceMeters = patch.distanceMeters === undefined ? set.distance_meters : optionalNumber(patch.distanceMeters);
    const setType = patch.setType === undefined ? (set.set_type || 'working') : patch.setType;
    const completed = patch.completed === undefined ? Boolean(set.is_completed) : patch.completed;
    if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000)) return res.status(422).json({ error: 'Weight must be between 0 and 1000 kg.' });
    if (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 1000)) return res.status(422).json({ error: 'Repetitions must be a whole number between 1 and 1000.' });
    if (durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86400)) return res.status(422).json({ error: 'Duration must be between 1 second and 24 hours.' });
    if (distanceMeters !== null && (!Number.isFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > 100000)) return res.status(422).json({ error: 'Distance must be between 0 and 100000 meters.' });
    if (patch.setType !== undefined && patch.setType !== 'warmup' && patch.setType !== 'working') return res.status(422).json({ error: 'setType must be warmup or working.' });
    if (typeof completed !== 'boolean') return res.status(422).json({ error: 'completed must be true or false.' });
    if (completed && reps === null && durationSeconds === null && distanceMeters === null) return res.status(422).json({ error: 'Enter reps, duration, or distance before completing this set.' });
    await (database.prepare('UPDATE workout_sets SET weight_kg = ?, reps = ?, is_completed = ?, set_type = ?, duration_seconds = ?, distance_meters = ? WHERE id = ?')
      .run(weightKg, reps, Number(completed), setType, durationSeconds, distanceMeters, set.id));
    res.json({ session: await (serializeWorkout(workout.id)) });
  });

  serveFrontend(app, frontendDirectory);

  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Request body must be valid JSON.' });
    if (error.status === 404 || error.status === 403) {
      return res.status(404).json({ error: 'Resource not found.' });
    }
    console.error('Request failed:', error.code || error.name || 'UnknownError');
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return {
    app,
    database,
    close: ({ preserveSchema = false, dropSchema } = {}) => {
      if (preserveSchema && database.memory) database.preserveMemory = true;
      return database.close({
        dropSchema: dropSchema ?? (database.testSchema && !database.memory && !preserveSchema ? database.schema : undefined),
      });
    },
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3031);
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  createApp().then(({ app }) => {
    app.listen(port, host, () => console.log(`LiftUp listening on ${host}:${port}`));
  }).catch((error) => {
    console.error('Unable to start Gym Tracker API:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
