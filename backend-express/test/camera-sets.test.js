const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { createApp } = require('../src/server');
const { newTestSchema } = require('../src/database');

test('camera sets are owner-scoped, atomic, retry-safe and preserve other sets', async (t) => {
  const postgres = process.env.LIFTUP_TEST_DATABASE === 'postgres';
  const service = await createApp(postgres ? { schema: newTestSchema(), testSchema: true } : { memory: true });
  const server = service.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await service.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() { return { cookie: '', async call(route, method = 'GET', body) {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', 'x-liftup-request': '1', cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0];
    const text = await response.text(); return { status: response.status, data: text ? JSON.parse(text) : null };
  } }; }
  const alice = client(), bob = client();
  for (const [index, user] of [alice, bob].entries()) assert.equal((await user.call('/api/auth/register', 'POST', {
    name: `Camera test ${index}`, email: `camera-${index}@example.test`, password: 'camera-test-password-123',
  })).status, 201);
  const workout = (await alice.call('/api/v1/workouts', 'POST', {})).data.session;
  const other = (await bob.call('/api/v1/workouts', 'POST', {})).data.session;
  const route = `/api/v1/workouts/${workout.id}/camera-pushups`;
  const key = randomUUID(), body = { reps: 12, requestKey: key };
  assert.equal((await client().call(route, 'POST', body)).status, 401);
  assert.equal((await bob.call(route, 'POST', body)).status, 404);
  for (const invalid of [{ ...body, reps: 0 }, { ...body, reps: 1.5 }, { ...body, reps: 1001 }, { ...body, requestKey: 'invalid' }, { ...body, video: 'must-not-be-uploaded' }]) {
    assert.equal((await alice.call(route, 'POST', invalid)).status, 422);
  }
  assert.equal((await service.database.prepare('SELECT COUNT(*) AS count FROM workout_sets').get()).count, 0);
  const first = await alice.call(route, 'POST', body);
  assert.equal(first.status, 201); assert.equal(first.data.session.exercises[0].exerciseSlug, 'push-up');
  assert.equal(first.data.session.exercises[0].sets[0].weightKg, 0);
  assert.equal(first.data.session.exercises[0].sets[0].completed, true);
  assert.equal((await alice.call(route, 'POST', body)).data.setId, first.data.setId);
  assert.equal((await alice.call(route, 'POST', { ...body, reps: 13 })).status, 409);
  const second = await alice.call(route, 'POST', { reps: 8, requestKey: randomUUID() });
  assert.equal(second.status, 201); assert.equal(second.data.session.exercises.length, 1);
  assert.equal(second.data.session.exercises[0].sets.length, 2);
  assert.deepEqual(second.data.session.exercises[0].sets.map((set) => set.reps), [12, 8]);
  assert.equal((await bob.call(`/api/v1/workouts/${other.id}/camera-pushups`, 'POST', body)).status, 201);
  await alice.call(`/api/v1/workouts/${workout.id}/finish`, 'POST', {});
  assert.equal((await alice.call(route, 'POST', body)).status, 200);
  assert.equal((await alice.call(route, 'POST', { reps: 5, requestKey: randomUUID() })).status, 409);
  await alice.call(`/api/v1/workouts/${workout.id}/sets/${first.data.setId}`, 'DELETE');
  assert.equal((await alice.call(route, 'POST', body)).status, 409);
  assert.equal((await service.database.prepare('SELECT COUNT(*) AS count FROM camera_set_imports').get()).count, 3);
});
