const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase, newTestSchema } = require('../src/database');
const { seedDefaultPlan, readDefaultPlan } = require('../src/plans');
const { verifyPassword } = require('../src/auth');
const {
  adoptLegacyForTest,
  contentSnapshot,
} = require('../scripts/setup-test-account');

const identity = {
  name: 'LiftUp Test',
  email: 'demo@liftup.test',
  password: 'only-a-unit-test-password-123',
};
const postgres = process.env.LIFTUP_TEST_DATABASE === 'postgres';
const fixture = () =>
  openDatabase(
    postgres ? { schema: newTestSchema(), testSchema: true } : { memory: true },
  );
const closeFixture = (db) =>
  db.close({ dropSchema: postgres ? db.schema : undefined });

async function addWorkout(db) {
  return (
    await db
      .prepare(
        'INSERT INTO workout_sessions (name, started_at, completed_at) VALUES (?, ?, ?)',
      )
      .run(
        'Original workout',
        '2026-10-01T10:00:00.000Z',
        '2026-10-01T11:00:00.000Z',
      )
  ).lastInsertRowid;
}

test('local test setup preserves original IDs/content and assigns history plus the existing plan', async () => {
  const db = await fixture();
  try {
    const workoutId = await addWorkout(db);
    const originalPlan = await readDefaultPlan(db);
    const before = await contentSnapshot(db);
    const result = await adoptLegacyForTest(db, identity);
    assert.equal(result.planId, originalPlan.id);
    assert.deepEqual(result.workoutIds, [workoutId]);
    assert.equal(
      (await readDefaultPlan(db, result.userId)).id,
      originalPlan.id,
    );
    assert.equal(
      (
        await db
          .prepare('SELECT user_id FROM workout_sessions WHERE id = ?')
          .get(workoutId)
      ).user_id,
      result.userId,
    );
    assert.deepEqual(await contentSnapshot(db), before);
    const user = await db
      .prepare('SELECT * FROM app_users WHERE id = ?')
      .get(result.userId);
    assert.notEqual(user.password_hash, identity.password);
    assert.equal(
      await verifyPassword(identity.password, user.password_hash),
      true,
    );
    await seedDefaultPlan(db);
    assert.equal(
      (await db.prepare('SELECT COUNT(*) AS count FROM workout_plans').get())
        .count,
      1,
    );
    await assert.rejects(
      adoptLegacyForTest(db, identity),
      /Accounts already exist/,
    );
    assert.equal(
      (await db.prepare('SELECT COUNT(*) AS count FROM app_users').get()).count,
      1,
    );
  } finally {
    await closeFixture(db);
  }
});

test('local test setup refuses unexpected identities, absent history and ambiguous plans before writing', async () => {
  const db = await fixture();
  try {
    await assert.rejects(
      adoptLegacyForTest(db, { ...identity, email: 'someone@example.com' }),
      /reserved local test/,
    );
    await assert.rejects(
      adoptLegacyForTest(db, identity),
      /No unassigned workout/,
    );
    await addWorkout(db);
    await db
      .prepare(
        'INSERT INTO workout_plans (plan_key, name, updated_at) VALUES (?, ?, ?)',
      )
      .run('unassigned-extra', 'Another plan', new Date().toISOString());
    await assert.rejects(adoptLegacyForTest(db, identity), /exactly one/);
    assert.equal(
      (await db.prepare('SELECT COUNT(*) AS count FROM app_users').get()).count,
      0,
    );
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS count FROM workout_sessions WHERE user_id IS NULL',
          )
          .get()
      ).count,
      1,
    );
  } finally {
    await closeFixture(db);
  }
});
