const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { PostgresDatabase } = require('../src/database');
const { connectionSettings } = require('./backup-database');
const { snapshot } = require('./migrate-database');

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--base-url')
    throw new Error('Supply --base-url http://localhost:9000');
  const url = new URL(args[1]);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.protocol !== 'http:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Smoke checks are restricted to the local development origin.',
    );
  }
  const settings = connectionSettings(
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  );
  const schema = process.env.DATABASE_SCHEMA || 'public';
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema))
    throw new Error('Invalid database schema.');
  const database = new PostgresDatabase(
    new Pool({
      ...settings,
      port: Number(settings.port),
      ssl: { rejectUnauthorized: true },
      enableChannelBinding: true,
      connectionTimeoutMillis: 15000,
      max: 1,
    }),
    { schema },
  );
  const runId = randomUUID();
  const accounts = ['a', 'b'].map((label) => ({
    email: `liftup-smoke-${runId}-${label}@example.invalid`,
    name: `LiftUp verification ${label}`,
    password: randomBytes(24).toString('hex'),
    cookie: '',
  }));
  const checks = [];
  async function request(account, route, method = 'GET', body, expected = 200) {
    const response = await fetch(url.origin + route, {
      method,
      signal: AbortSignal.timeout(90000),
      headers: {
        'content-type': 'application/json',
        'x-liftup-request': '1',
        cookie: account?.cookie || '',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.headers.get('set-cookie') && account)
      account.cookie = response.headers.get('set-cookie').split(';')[0];
    const content = await response.text();
    assert.equal(
      response.status,
      expected,
      `${method} ${route}: unexpected response status`,
    );
    return {
      response,
      data:
        response.headers.get('content-type')?.includes('json') && content
          ? JSON.parse(content)
          : content,
    };
  }
  let before;
  let removed = 0;
  try {
    before = await snapshot(database);
    await request(null, '/api/health');
    await request(null, '/api/v1/plans/default', 'GET', undefined, 401);
    checks.push('Frontend proxy, API health and anonymous protection');
    for (const account of accounts) {
      await request(account, '/api/auth/register', 'POST', account, 201);
      assert.equal(
        (await request(account, '/api/auth/me')).data.user.email,
        account.email,
      );
    }
    checks.push('Two real PostgreSQL accounts register and resolve sessions');
    const [alice, bob] = accounts;
    const planA = (await request(alice, '/api/v1/plans/default')).data.plan;
    const planB = (await request(bob, '/api/v1/plans/default')).data.plan;
    assert.notEqual(planA.id, planB.id);
    assert.equal(planA.days.length, 7);
    assert.equal(planA.days[6].isRestDay, true);
    for (const account of accounts)
      assert.equal(
        (await request(account, '/api/v1/workouts')).data.workouts.length,
        0,
      );
    checks.push(
      'Personal seven-day plans; unassigned legacy history is not exposed',
    );
    const oldCookie = alice.cookie;
    await request(
      alice,
      '/api/auth/login',
      'POST',
      { email: alice.email, password: 'wrong' },
      401,
    );
    await request(alice, '/api/auth/login', 'POST', {
      email: alice.email,
      password: alice.password,
    });
    await request({ cookie: oldCookie }, '/api/auth/me', 'GET', undefined, 401);
    checks.push('Password validation and server-side session rotation');
    const workoutA = (
      await request(
        alice,
        '/api/v1/workouts',
        'POST',
        { name: `Smoke A ${runId}` },
        201,
      )
    ).data.session;
    const workoutB = (
      await request(
        bob,
        '/api/v1/workouts',
        'POST',
        { name: `Smoke B ${runId}` },
        201,
      )
    ).data.session;
    assert.notEqual(workoutA.id, workoutB.id);
    assert.equal(
      (await request(alice, '/api/v1/workouts/active')).data.session.id,
      workoutA.id,
    );
    assert.equal(
      (await request(bob, '/api/v1/workouts/active')).data.session.id,
      workoutB.id,
    );
    await request(
      bob,
      `/api/v1/workouts/${workoutA.id}/finish`,
      'POST',
      {},
      404,
    );
    await request(alice, `/api/v1/workouts/${workoutA.id}/finish`, 'POST', {});
    const historyA = (await request(alice, '/api/v1/workouts')).data.workouts;
    const historyB = (await request(bob, '/api/v1/workouts')).data.workouts;
    assert.ok(historyA.some((workout) => workout.id === workoutA.id));
    assert.ok(!historyB.some((workout) => workout.id === workoutA.id));
    const csvA = await request(alice, '/api/v1/workouts/export.csv');
    const csvB = await request(bob, '/api/v1/workouts/export.csv');
    assert.match(
      csvA.response.headers.get('content-disposition'),
      /attachment/,
    );
    assert.ok(csvA.data.includes(workoutA.name));
    assert.ok(!csvB.data.includes(workoutA.name));
    checks.push(
      'Concurrent active workouts, cross-account denial, finish/history and private CSV export',
    );
    const logoutCookie = alice.cookie;
    await request(alice, '/api/auth/logout', 'POST', undefined, 204);
    await request(
      { cookie: logoutCookie },
      '/api/auth/me',
      'GET',
      undefined,
      401,
    );
    checks.push('Logout revokes the database session');
  } finally {
    try {
      // Remove only this run's random, reserved test identities and their own data.
      await database.transaction(async () => {
        const users = await database
          .prepare(
            'SELECT id, email, name FROM app_users WHERE email IN (?, ?)',
          )
          .all(...accounts.map((account) => account.email));
        for (const user of users)
          assert.ok(
            accounts.some(
              (account) =>
                account.email === user.email && account.name === user.name,
            ),
          );
        if (users.length) {
          const ids = users.map((user) => user.id);
          const placeholders = ids.map(() => '?').join(', ');
          for (const table of [
            'workout_sessions',
            'workout_plans',
            'plan_templates',
            'custom_exercises',
          ]) {
            await database
              .prepare(
                `DELETE FROM ${table} WHERE user_id IN (${placeholders})`,
              )
              .run(...ids);
          }
          await database
            .prepare(`DELETE FROM app_users WHERE id IN (${placeholders})`)
            .run(...ids);
          removed = users.length;
        }
      });
      if (before)
        assert.deepEqual(
          await snapshot(database),
          before,
          'Pre-existing application records changed.',
        );
    } finally {
      await database.close();
    }
  }
  const report = {
    completedAt: new Date().toISOString(),
    origin: url.origin,
    checks,
    temporaryAccountsRemoved: removed,
    existingRecordsUnchanged: true,
  };
  const directory = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `smoke-${Date.now()}-${runId.slice(0, 8)}.json`),
    JSON.stringify(report, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module)
  main().catch((error) => {
    console.error('Live smoke check failed:', error.code || error.name);
    process.exitCode = 1;
  });
