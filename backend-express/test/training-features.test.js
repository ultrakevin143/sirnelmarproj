const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../src/server');
const { newTestSchema } = require('../src/database');

async function fixture(t) {
  const service = await createApp(process.env.LIFTUP_TEST_DATABASE === 'postgres' ? { testSchema: true, schema: newTestSchema() } : { memory: true });
  const server = service.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await service.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => ({ cookie: '', async request(path, method = 'GET', body) {
    const response = await fetch(base + path, { method, headers: { cookie: this.cookie, 'content-type': 'application/json', 'x-liftup-request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const cookie = response.headers.get('set-cookie'); if (cookie) this.cookie = cookie.split(';')[0];
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  } });
  const register = async email => { const c = client(); assert.equal((await c.request('/api/auth/register', 'POST', { name: 'Lifter', email, password: 'training-test-password-123' })).status, 201); return c; };
  return { ...service, client, register };
}

test('settings, favorites and starter plan belong to each account; applying a plan keeps history', async t => {
  const { register } = await fixture(t); const alice = await register('feature-alice@example.test'); const bob = await register('feature-bob@example.test');
  const originalBob = (await bob.request('/api/v1/plans/default')).data.plan;
  const settings = (await alice.request('/api/v1/training/settings')).data.settings;
  const custom = { ...settings, equipment: 'bodyweight', goal: 'fitness', massUnit: 'lb', trainingDays: [1, 3], sessionMinutes: 30, onboardingComplete: true };
  assert.equal((await alice.request('/api/v1/training/settings', 'PUT', { ...custom, trainingDays: [1, 1] })).status, 422);
  assert.equal((await alice.request('/api/v1/training/settings', 'PUT', custom)).status, 200);
  assert.equal((await bob.request('/api/v1/training/settings')).data.settings.massUnit, 'kg');
  assert.equal((await alice.request('/api/v1/favorites/exercise-push-up', 'PUT', { favorite: true })).status, 200);
  assert.deepEqual((await alice.request('/api/v1/favorites')).data.favorites, ['exercise-push-up']);
  assert.deepEqual((await bob.request('/api/v1/favorites')).data.favorites, []);
  assert.equal((await alice.request('/api/v1/favorites/no-such-exercise', 'PUT', { favorite: true })).status, 404);
  assert.equal((await alice.request('/api/v1/training/starter-plan', 'POST', { confirm: false })).status, 422);
  const plan = await alice.request('/api/v1/training/starter-plan', 'POST', { confirm: true });
  assert.equal(plan.status, 200); assert.equal(plan.data.plan.days.filter(d => !d.isRestDay).length, 2);
  assert.equal(plan.data.plan.days[1].exercises.length, 3);
  assert.ok(plan.data.plan.days[1].exercises.every(e => e.weightKg === 0 && e.sets === 2));
  assert.deepEqual((await bob.request('/api/v1/plans/default')).data.plan, originalBob);
  const active = (await alice.request('/api/v1/workouts', 'POST', { name: 'Starter', planDayIndex: 1 })).data.session;
  assert.equal((await alice.request('/api/v1/training/starter-plan', 'POST', { confirm: true })).status, 409);
  await alice.request(`/api/v1/workouts/${active.id}/finish`, 'POST');
  assert.equal((await alice.request('/api/v1/training/starter-plan', 'POST', { confirm: true })).status, 200);
  assert.ok((await alice.request('/api/v1/workouts')).data.workouts.some(w => w.id === active.id));
});

test('finish saves drafts atomically; bodyweight/timed trends and repeat sessions preserve values and ownership', async t => {
  const { register } = await fixture(t); const alice = await register('progress-alice@example.test'); const bob = await register('progress-bob@example.test');
  let session = (await alice.request('/api/v1/workouts', 'POST', { name: 'Floor training' })).data.session;
  session = (await alice.request(`/api/v1/workouts/${session.id}/exercises`, 'POST', { exerciseId: 'exercise-push-up', exerciseSlug: 'push-up' })).data.session;
  const exercise = session.exercises[0];
  session = (await alice.request(`/api/v1/workouts/${session.id}/sets`, 'POST', { workoutExerciseId: exercise.id, weightKg: 0, reps: 15 })).data.session;
  const set = session.exercises[0].sets[0];
  const bad = await alice.request(`/api/v1/workouts/${session.id}/finish`, 'POST', { notes: 'Must not save', setChanges: [{ id: set.id + 10000, weightKg: 0, reps: 16 }] });
  assert.equal(bad.status, 422);
  let current = (await alice.request('/api/v1/workouts/active')).data.session;
  assert.equal(current.notes, ''); assert.equal(current.completedAt, null);
  const finished = await alice.request(`/api/v1/workouts/${session.id}/finish`, 'POST', { notes: 'Saved together', perceivedEffort: 7, setChanges: [{ id: set.id, weightKg: 0, reps: 18 }] });
  assert.equal(finished.status, 200); assert.equal(finished.data.session.notes, 'Saved together'); assert.equal(finished.data.session.perceivedEffort, 7); assert.equal(finished.data.session.exercises[0].sets[0].reps, 18);
  assert.ok((await alice.request('/api/v1/progress/exercises')).data.exercises.some(e => e.id === 'exercise-push-up'));
  const range = `?from=${new Date(Date.now()-86400000).toISOString()}&to=${new Date(Date.now()+86400000).toISOString()}`;
  const trend = (await alice.request('/api/v1/progress/exercise-push-up' + range)).data.points;
  assert.equal(trend[0].bestReps, 18); assert.equal(trend[0].totalReps, 18); assert.equal(trend[0].estimatedOneRepMaxKg, null);
  const record = (await alice.request('/api/v1/records')).data.records[0]; assert.equal(record.bestReps, 18); assert.equal(record.estimatedOneRepMaxKg, null);
  assert.equal((await bob.request(`/api/v1/workouts/${session.id}/repeat`, 'POST')).status, 404);
  const repeated = await alice.request(`/api/v1/workouts/${session.id}/repeat`, 'POST');
  assert.equal(repeated.status, 201); assert.notEqual(repeated.data.session.id, session.id);
  assert.equal(repeated.data.session.exercises[0].sets[0].completed, false); assert.equal(repeated.data.session.exercises[0].sets[0].reps, 18);
  assert.equal((await alice.request(`/api/v1/workouts/${session.id}/repeat`, 'POST')).status, 409);
  current = repeated.data.session;
  const timed = (await alice.request(`/api/v1/workouts/${current.id}/sets`, 'POST', { workoutExerciseId: current.exercises[0].id, weightKg: null, reps: null, durationSeconds: 75, distanceMeters: 120 })).data.session;
  assert.ok(timed);
  await alice.request(`/api/v1/workouts/${current.id}/finish`, 'POST');
  const points = (await alice.request('/api/v1/progress/exercise-push-up' + range)).data.points;
  assert.equal(points.at(-1).durationSeconds, 75); assert.equal(points.at(-1).distanceMeters, 120);
  assert.deepEqual((await bob.request('/api/v1/progress/exercise-push-up' + range)).data.points, []);
});

test('profile/password updates rotate sessions and deletion removes only the authenticated account', async t => {
  const { register, client } = await fixture(t); const alice = await register('profile-alice@example.test'); const bob = await register('profile-bob@example.test');
  const oldSession = client(); oldSession.cookie = alice.cookie;
  assert.equal((await alice.request('/api/auth/profile', 'PATCH', { name: 'Updated Lifter', experienceLevel: 'advanced' })).data.user.name, 'Updated Lifter');
  assert.equal((await alice.request('/api/auth/change-password', 'POST', { currentPassword: 'wrong', newPassword: 'another-test-password-123' })).status, 403);
  assert.equal((await alice.request('/api/auth/change-password', 'POST', { currentPassword: 'training-test-password-123', newPassword: 'another-test-password-123' })).status, 200);
  assert.equal((await oldSession.request('/api/auth/me')).status, 401); assert.equal((await alice.request('/api/auth/me')).status, 200);
  assert.equal((await alice.request('/api/auth/account', 'DELETE', { password: 'wrong', confirm: 'DELETE' })).status, 403);
  await alice.request('/api/v1/workouts', 'POST', { name: 'Private workout' });
  await alice.request('/api/v1/favorites/exercise-push-up', 'PUT', { favorite: true });
  assert.equal((await alice.request('/api/auth/account', 'DELETE', { password: 'another-test-password-123', confirm: 'DELETE' })).status, 204);
  assert.equal((await alice.request('/api/auth/me')).status, 401);
  assert.equal((await bob.request('/api/auth/me')).status, 200); assert.ok((await bob.request('/api/v1/plans/default')).data.plan);
});
