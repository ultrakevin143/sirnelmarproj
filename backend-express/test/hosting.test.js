const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/server');
const { hostingOptions } = require('../src/hosting');

test('hosting configuration requires an explicit proxy and bundled website', () => {
  assert.equal(hostingOptions({}).trustProxy, false);
  assert.equal(hostingOptions({ TRUST_PROXY: '1' }).trustProxy, 1);
  assert.throws(() => hostingOptions({ TRUST_PROXY: 'true' }));
  assert.ok(hostingOptions({ SERVE_FRONTEND: 'true' }).frontendDirectory.endsWith(path.join('dist', 'spa')));
});

test('production serves only compiled public files and keeps account APIs protected', async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'liftup-hosting-'));
  const website = path.join(parent, 'public');
  await require('node:fs/promises').mkdir(website);
  await writeFile(path.join(website, 'index.html'), '<!doctype html><title>LiftUp fixture</title>');
  await writeFile(path.join(website, 'app.js'), 'console.log("fixture");');
  await writeFile(path.join(website, '.env'), 'PRIVATE_FIXTURE_VALUE');
  await writeFile(path.join(parent, 'secret.txt'), 'PRIVATE_PARENT_FIXTURE');
  const service = await createApp({ memory: true, frontendDirectory: website, trustProxy: 1 });
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    await rm(parent, { recursive: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /LiftUp fixture/);
  assert.equal(home.headers.get('cache-control'), 'no-cache');
  assert.equal((await fetch(base + '/app.js')).status, 200);
  const health = await fetch(base + '/api/health');
  assert.equal((await health.json()).service, 'gym-tracker-api');
  assert.equal((await fetch(base + '/api/v1/workouts')).status, 401);
  const missing = await fetch(base + '/api/missing');
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'API route not found.' });
  for (const route of ['/.env', '/secret.txt', '/%2e%2e/secret.txt', '/src/server.js']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
    assert.doesNotMatch(await response.text(), /PRIVATE_/);
  }
});

test('missing frontend fails before opening the database', async () => {
  await assert.rejects(createApp({ memory: true, frontendDirectory: path.join(os.tmpdir(), 'liftup-not-built-absent') }), /Built frontend is missing/);
});
