const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const NEW_PROGRAM_SPLIT = [
  ['Chest, Triceps & Shoulders', 'Push day', false],
  ['Back & Biceps', 'Pull day', false],
  ['Legs, Core & Forearms', 'Lower body & core', false],
  ['Chest, Triceps & Shoulders', 'Push day', false],
  ['Back & Biceps', 'Pull day', false],
  ['Legs, Core & Forearms', 'Lower body & core', false],
  ['Rest & Recovery', 'Rest day', true],
];

const STARTER_EXERCISES = [
  [
    { exerciseName: 'Barbell Bench Press', targetMuscle: 'Chest', sets: 3, reps: 10, weightKg: 60 },
    { exerciseName: 'Incline Dumbbell Press', targetMuscle: 'Upper Chest', sets: 3, reps: 12, weightKg: 20 },
    { exerciseName: 'Tricep Pushdowns', targetMuscle: 'Triceps', sets: 3, reps: 12, weightKg: 25 },
    { exerciseName: 'Overhead Press', targetMuscle: 'Shoulders', sets: 3, reps: 10, weightKg: 30 },
    { exerciseName: 'Lateral Raises', targetMuscle: 'Side Delts', sets: 3, reps: 15, weightKg: 8 },
  ],
  [
    { exerciseName: 'Lat Pulldowns', targetMuscle: 'Back', sets: 3, reps: 10, weightKg: 50 },
    { exerciseName: 'Barbell Rows', targetMuscle: 'Middle Back', sets: 3, reps: 10, weightKg: 45 },
    { exerciseName: 'Bicep Curls', targetMuscle: 'Biceps', sets: 3, reps: 12, weightKg: 15 },
  ],
  [
    { exerciseName: 'Barbell Squats', targetMuscle: 'Legs', sets: 3, reps: 8, weightKg: 70 },
    { exerciseName: 'Hanging Leg Raises', targetMuscle: 'Lower Abs', sets: 3, reps: 15, weightKg: 0 },
    { exerciseName: 'Plank Hold', targetMuscle: 'Core', sets: 3, reps: 60, weightKg: 0 },
    { exerciseName: 'Wrist Curls', targetMuscle: 'Forearms', sets: 3, reps: 15, weightKg: 12 },
    { exerciseName: 'Standing Calf Raises', targetMuscle: 'Calves', sets: 4, reps: 15, weightKg: 50 },
  ],
];

const DEFAULT_PLAN = {
  key: 'default',
  name: 'Weekly training split',
  days: NEW_PROGRAM_SPLIT.map(([title, focus, isRestDay], dayIndex) => ({
    dayIndex,
    dayName: WEEK_DAYS[dayIndex],
    shortDay: SHORT_DAYS[dayIndex],
    title,
    focus,
    isRestDay,
    exercises: isRestDay
      ? []
      : STARTER_EXERCISES[dayIndex % STARTER_EXERCISES.length].map((exercise) => ({
          ...exercise,
        })),
  })),
};

const planKeyFor = (userId) => userId == null ? DEFAULT_PLAN.key : `user:${userId}`;

async function seedDefaultPlan(database, userId = null) {
  // Once accounts exist, startup must not recreate an unowned shared plan after
  // its original plan has been explicitly assigned to a user.
  if (userId == null && await database.prepare('SELECT id FROM app_users LIMIT 1').get()) return;
  const key = planKeyFor(userId);
  if (await database.prepare('SELECT id FROM workout_plans WHERE plan_key = ?').get(key)) return;
  await database.transaction(async () => {
    const planId = Number((await database.prepare('INSERT INTO workout_plans (plan_key, name, updated_at, user_id) VALUES (?, ?, ?, ?)')
      .run(key, DEFAULT_PLAN.name, new Date().toISOString(), userId)).lastInsertRowid);
    const insertExercise = database.prepare(`
      INSERT INTO planned_exercises (
        plan_day_id, exercise_name, target_muscle, prescribed_sets, prescribed_reps, suggested_weight_kg, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const day of DEFAULT_PLAN.days) {
      const dayId = Number((await database.prepare(`
        INSERT INTO plan_days (plan_id, day_index, day_name, short_day, title, focus, is_rest_day)
        VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
      `).run(planId, day.dayIndex, day.dayName, day.shortDay, day.title, day.focus, Number(day.isRestDay))).lastInsertRowid);
      for (const [index, item] of day.exercises.entries()) {
        await insertExercise.run(dayId, item.exerciseName, item.targetMuscle, item.sets, item.reps, item.weightKg, index);
      }
    }
  });
}

async function readDefaultPlan(database, userId = null) {
  const plan = await database.prepare('SELECT id, plan_key AS key, name, updated_at AS updatedAt FROM workout_plans WHERE plan_key = ?').get(planKeyFor(userId));
  if (!plan) return null;
  const days = await database.prepare(`
    SELECT id, day_index AS dayIndex, day_name AS dayName, short_day AS shortDay, title, focus, is_rest_day AS isRestDay
    FROM plan_days WHERE plan_id = ? ORDER BY day_index
  `).all(plan.id);
  if (!days.length) return { ...plan, days: [] };
  const dayIds = days.map((d) => d.id);
  const placeholders = dayIds.map(() => '?').join(', ');
  const exercises = await database.prepare(`
    SELECT id, plan_day_id AS "planDayId", catalog_exercise_id AS catalogExerciseId, custom_exercise_id AS customExerciseId, exercise_slug AS exerciseSlug,
      exercise_name AS exerciseName, target_muscle AS targetMuscle,
      prescribed_sets AS sets, prescribed_reps AS reps, suggested_weight_kg AS weightKg,
      sort_order AS sortOrder
    FROM planned_exercises WHERE plan_day_id IN (${placeholders}) ORDER BY sort_order, id
  `).all(...dayIds);
  const exercisesByDay = new Map();
  for (const ex of exercises) {
    const list = exercisesByDay.get(ex.planDayId) || [];
    list.push(ex);
    exercisesByDay.set(ex.planDayId, list);
  }
  const daysWithExercises = days.map((day) => ({
    ...day,
    isRestDay: Boolean(day.isRestDay),
    exercises: exercisesByDay.get(day.id) || [],
  }));
  return { ...plan, days: daysWithExercises };
}

module.exports = { DEFAULT_PLAN, NEW_PROGRAM_SPLIT, readDefaultPlan, seedDefaultPlan, planKeyFor };
