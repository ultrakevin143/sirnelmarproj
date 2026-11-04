const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../src/server');
const { openDatabase, runMigrations, newTestSchema, PostgresDatabase } = require('../src/database');
const { readdirSync } = require('node:fs');
const path = require('node:path');

const postgres = process.env.LIFTUP_TEST_DATABASE === 'postgres';
const databaseOptions = () => postgres
  ? { memory: false, testSchema: true, schema: newTestSchema() }
  : { memory: true };

async function fixture(t) {
  const service = await createApp(databaseOptions());
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await service.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  function client(cookie = '') {
    return {
      cookie,
      async request(route, method = 'GET', body, extra = {}) {
        const response = await fetch(base + route, { method, headers: {
          'content-type': 'application/json', 'x-liftup-request': '1', cookie: this.cookie, ...extra,
        }, body: body === undefined ? undefined : JSON.stringify(body) });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) this.cookie = setCookie.split(';')[0];
        const text = await response.text();
        const data = response.headers.get('content-type')?.includes('json') && text ? JSON.parse(text) : text;
        return { response, data };
      },
    };
  }
  async function register(email) {
    const user = client();
    const result = await user.request('/api/auth/register', 'POST', {
      name: email.split('@')[0], email, password: 'long-test-password-123', experienceLevel: 'beginner',
    });
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
    return user;
  }
  return { ...service, base, client, register };
}

test('registration, credential verification, session rotation, expiry, logout and CSRF', async (t) => {
  const { client, register, database } = await fixture(t);
  const anonymous = client();
  assert.equal((await anonymous.request('/api/v1/plans/default')).response.status, 401);
  assert.equal((await anonymous.request('/api/auth/register', 'POST', {}, { 'x-liftup-request': '' })).response.status, 403);
  assert.equal((await anonymous.request('/api/auth/register', 'POST', { password: 'short' })).response.status, 422);
  const alice = await register('Alice@example.com');
  const me = await alice.request('/api/auth/me');
  assert.equal(me.data.user.email, 'alice@example.com');
  assert.equal(me.data.user.password_hash, undefined);
  const saved = await database.prepare('SELECT * FROM app_users WHERE email = ?').get('alice@example.com');
  assert.match(saved.password_hash, /^scrypt:/);
  assert.notEqual(saved.password_hash, 'long-test-password-123');
  const session = (await database.prepare('SELECT * FROM auth_sessions').all())[0];
  assert.notEqual(session.token_hash, alice.cookie.split('=')[1]);
  assert.equal((await anonymous.request('/api/auth/register', 'POST', {
    name: 'Duplicate', email: 'ALICE@example.com', password: 'long-test-password-123',
  })).response.status, 409);
  assert.equal((await anonymous.request('/api/auth/login', 'POST', { email: 'alice@example.com', password: 'wrong' })).response.status, 401);
  const oldCookie = alice.cookie;
  const login = await alice.request('/api/auth/login', 'POST', { email: 'ALICE@example.com', password: 'long-test-password-123' });
  assert.equal(login.response.status, 200);
  assert.match(login.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.response.headers.get('set-cookie'), /SameSite=Strict/);
  assert.notEqual(alice.cookie, oldCookie);
  assert.equal((await client(oldCookie).request('/api/auth/me')).response.status, 401);
  const logoutCookie = alice.cookie;
  assert.equal((await alice.request('/api/auth/logout', 'POST')).response.status, 204);
  assert.equal((await client(logoutCookie).request('/api/v1/workouts')).response.status, 401);
  await alice.request('/api/auth/login', 'POST', { email: 'alice@example.com', password: 'long-test-password-123' });
  await database.prepare('UPDATE auth_sessions SET expires_at = ?').run('2000-01-01T00:00:00.000Z');
  assert.equal((await alice.request('/api/auth/me')).response.status, 401);
});

test('two accounts have isolated plans, sessions, custom movements, templates, history and exports', async (t) => {
  const { register, database } = await fixture(t);
  const alice = await register('alice@example.com');
  const bob = await register('bob@example.com');
  const planA = (await alice.request('/api/v1/plans/default')).data.plan;
  const planB = (await bob.request('/api/v1/plans/default')).data.plan;
  assert.notEqual(planA.id, planB.id);
  const concurrent = await Promise.all(Array.from({ length: 6 }, (_, index) =>
    (index % 2 ? bob : alice).request('/api/v1/plans/default')));
  concurrent.forEach((result, index) => assert.equal(result.data.plan.id, index % 2 ? planB.id : planA.id));
  const target = planA.days[0].exercises[0];
  assert.equal((await bob.request(`/api/v1/plans/default/exercises/${target.id}`, 'PATCH', { reps: 20 })).response.status, 404);
  assert.equal((await bob.request(`/api/v1/plans/default/exercises/${target.id}`, 'DELETE')).response.status, 404);
  const workout = (await alice.request('/api/v1/workouts', 'POST', { planDayIndex: 0, name: 'ALICE PRIVATE SESSION' })).data.session;
  assert.ok(workout?.id);
  const ownBob = await bob.request('/api/v1/workouts', 'POST', { name: 'BOB PRIVATE SESSION' });
  assert.equal(ownBob.response.status, 201);
  assert.equal((await bob.request('/api/v1/workouts/active')).data.session.name, 'BOB PRIVATE SESSION');
  const set = workout.exercises[0].sets[0];
  for (const [route, method, body] of [
    [`/api/v1/workouts/${workout.id}/notes`, 'PATCH', { notes: 'steal' }],
    [`/api/v1/workouts/${workout.id}/effort`, 'PATCH', { perceivedEffort: 5 }],
    [`/api/v1/workouts/${workout.id}/finish`, 'POST', {}],
    [`/api/v1/workouts/${workout.id}/sets/${set.id}`, 'PATCH', { completed: true }],
    [`/api/v1/workouts/${workout.id}/sets/${set.id}`, 'DELETE'],
    [`/api/v1/workouts/${ownBob.data.session.id}/sets/${set.id}`, 'PATCH', { completed: true }],
  ]) assert.equal((await bob.request(route, method, body)).response.status, 404, route);
  const custom = await alice.request('/api/v1/exercises/custom', 'POST', { name: 'Private movement', primaryMuscle: 'Chest', equipment: 'Barbell' });
  const customId = custom.data.customExerciseId;
  assert.ok(customId);
  assert.equal((await bob.request('/api/v1/exercises?q=Private')).data.count, 0);
  assert.equal((await bob.request(`/api/v1/exercises/custom/${customId}`, 'PATCH', { name: 'stolen' })).response.status, 404);
  assert.equal((await bob.request(`/api/v1/exercises/custom/${customId}/archive`, 'POST')).response.status, 404);
  assert.equal((await bob.request(`/api/v1/exercises/custom/${customId}/image`)).response.status, 404);
  assert.equal((await bob.request('/api/v1/plans/default/days/0/exercises', 'POST', { customExerciseId: customId })).response.status, 422);
  const guide = (await bob.request('/api/v1/exercises?q=bench')).data.exercises.find((item) => item.source === 'catalog');
  assert.equal((await bob.request(`/api/v1/workouts/${ownBob.data.session.id}/exercises`, 'POST', {
    exerciseSlug: guide.slug, customExerciseId: customId,
  })).response.status, 422);
  const stolenImport = (await alice.request('/api/v1/plans/default/export')).data;
  stolenImport.plan.days[0].exercises[0].customExerciseId = customId;
  assert.equal((await bob.request('/api/v1/plans/default/import/preview', 'POST', stolenImport)).response.status, 422);
  assert.equal((await bob.request('/api/v1/exercises/custom', 'POST', { name: 'Private movement', primaryMuscle: 'Back', equipment: 'Cable' })).response.status, 201);
  const template = (await alice.request('/api/v1/plans/templates', 'POST', { name: 'My split' })).data.template;
  assert.ok(template?.id);
  assert.equal((await bob.request('/api/v1/plans/templates')).data.templates.length, 0);
  assert.equal((await bob.request(`/api/v1/plans/templates/${template.id}/preview`)).response.status, 404);
  assert.equal((await bob.request(`/api/v1/plans/templates/${template.id}/apply`, 'POST', { confirm: true })).response.status, 404);
  assert.equal((await bob.request(`/api/v1/plans/templates/${template.id}`, 'DELETE')).response.status, 404);
  await alice.request(`/api/v1/workouts/${workout.id}/sets/${set.id}`, 'PATCH', { weightKg: 80, reps: 5, completed: true });
  await alice.request(`/api/v1/workouts/${workout.id}/finish`, 'POST');
  const history = (await alice.request('/api/v1/workouts')).data.workouts;
  assert.deepEqual(history[0].exercises[0].sets[0].personalRecords, ['load', 'estimated1rm']);
  assert.equal((await bob.request('/api/v1/records')).data.records.length, 0);
  assert.equal((await bob.request('/api/v1/progress/exercises')).data.exercises.length, 0);
  const range = `?from=${new Date(Date.now() - 86400000).toISOString()}&to=${new Date(Date.now() + 86400000).toISOString()}`;
  assert.equal((await bob.request('/api/v1/analytics/summary' + range)).data.sessions, 0);
  assert.equal((await bob.request(`/api/v1/progress/${workout.exercises[0].exerciseId}/suggestion`)).data.last, null);
  assert.deepEqual((await bob.request(`/api/v1/progress/${workout.exercises[0].exerciseId}` + range)).data.points, []);
  const csvA = await alice.request('/api/v1/workouts/export.csv');
  const csvB = await bob.request('/api/v1/workouts/export.csv');
  assert.match(csvA.response.headers.get('content-disposition'), /attachment/);
  assert.match(csvA.data, /ALICE PRIVATE SESSION/);
  assert.doesNotMatch(csvB.data, /ALICE PRIVATE SESSION/);
  assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM workout_plans WHERE user_id IS NULL').get()).count, 1);
});

test('all migration files apply once and protected schema cleanup cannot target public', async () => {
  const database = await openDatabase(databaseOptions());
  try {
    const expected = readdirSync(path.join(__dirname, '../migrations')).filter((file) => /^\d+.*\.sql$/.test(file)).length;
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).count, expected);
    await runMigrations(database);
    assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).count, expected);
    await assert.rejects(database.close({ dropSchema: 'public' }), /generated test schema/);
  } finally { await database.close({ dropSchema: postgres ? database.schema : undefined }); }
});

test('PostgreSQL query sets its schema inside a transaction and rolls back failures', async () => {
  const calls = [];
  const client = { async query(sql) { calls.push(sql); if (sql === 'FAIL') throw new Error('failure'); return { rows: [] }; }, release() { calls.push('release'); } };
  const db = new PostgresDatabase({ connect: async () => client }, { schema: 'isolated' });
  await db.query('SELECT 1');
  assert.deepEqual(calls, ['BEGIN', 'SET LOCAL search_path TO "isolated"', 'SELECT 1', 'COMMIT', 'release']);
  calls.length = 0;
  await assert.rejects(db.query('FAIL'));
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
});
