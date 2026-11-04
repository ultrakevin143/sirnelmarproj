const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { Pool } = require('pg');
const { PostgresDatabase } = require('../src/database');
const { hashPassword } = require('../src/auth');
const { planKeyFor } = require('../src/plans');
const { canonical, validateBackup } = require('./migrate-database');
const { connectionSettings } = require('./backup-database');

const tables = [
  'workout_plans',
  'plan_days',
  'planned_exercises',
  'workout_sessions',
  'workout_exercises',
  'workout_sets',
  'custom_exercises',
  'plan_templates',
];

async function contentSnapshot(database) {
  const snapshot = {};
  for (const table of tables) {
    const rows = await database
      .prepare(`SELECT * FROM ${table} ORDER BY id`)
      .all();
    const hash = createHash('sha256');
    for (const source of rows) {
      const row = { ...source };
      delete row.user_id;
      if (table === 'workout_plans') delete row.plan_key;
      hash.update(JSON.stringify(canonical(row)) + '\n');
    }
    snapshot[table] = { count: rows.length, sha256: hash.digest('hex') };
  }
  return snapshot;
}

async function adoptLegacyForTest(database, { email, name, password }) {
  if (
    email !== 'demo@liftup.test' ||
    name !== 'LiftUp Test' ||
    typeof password !== 'string' ||
    password.length < 12
  ) {
    throw new Error('Only the reserved local test identity is supported.');
  }
  const passwordHash = await hashPassword(password);
  return database.transaction(async () => {
    if (!database.memory) {
      await database.exec("SET LOCAL lock_timeout = '5s'");
      await database.exec(
        `LOCK TABLE app_users, ${tables.join(', ')} IN SHARE ROW EXCLUSIVE MODE`,
      );
    }
    if (await database.prepare('SELECT id FROM app_users LIMIT 1').get()) {
      throw new Error(
        'Accounts already exist; refusing to choose or replace an owner automatically.',
      );
    }
    const plans = await database
      .prepare('SELECT * FROM workout_plans WHERE user_id IS NULL ORDER BY id')
      .all();
    if (plans.length !== 1 || plans[0].plan_key !== 'default')
      throw new Error('Expected exactly one original shared default plan.');
    const workouts = await database
      .prepare(
        'SELECT id, completed_at, abandoned_at FROM workout_sessions WHERE user_id IS NULL ORDER BY id',
      )
      .all();
    if (!workouts.length)
      throw new Error('No unassigned workout history was found.');
    if (
      workouts.filter((item) => !item.completed_at && !item.abandoned_at)
        .length > 1
    ) {
      throw new Error(
        'Multiple active legacy workouts require review; none will be changed automatically.',
      );
    }
    const before = await contentSnapshot(database);
    const userId = (
      await database
        .prepare(
          `INSERT INTO app_users
      (name, email, password_hash, experience_level, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id`,
        )
        .run(name, email, passwordHash, 'beginner', new Date().toISOString())
    ).lastInsertRowid;
    await database
      .prepare(
        'UPDATE workout_plans SET user_id = ?, plan_key = ? WHERE id = ? AND user_id IS NULL',
      )
      .run(userId, planKeyFor(userId), plans[0].id);
    for (const table of [
      'workout_sessions',
      'custom_exercises',
      'plan_templates',
    ]) {
      await database
        .prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`)
        .run(userId);
    }
    assert.deepEqual(
      await contentSnapshot(database),
      before,
      'Original record contents changed; rolling back.',
    );
    return {
      userId,
      email,
      planId: plans[0].id,
      workoutIds: workouts.map((item) => item.id),
      linkedWorkouts: workouts.length,
      originalRecordContentsPreserved: true,
    };
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Test setup is disabled in production.');
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== '--backup' ||
    args[2] !== '--local-test'
  ) {
    throw new Error('Supply --backup backups/<fresh-file>.dump --local-test');
  }
  const directory = fs.realpathSync(path.join(__dirname, '..', 'backups'));
  const archive = fs.realpathSync(
    path.resolve(path.join(__dirname, '..'), args[1]),
  );
  if (path.dirname(archive) !== directory || !archive.endsWith('.dump'))
    throw new Error('Use a completed backup in the private backups folder.');
  const metadata = JSON.parse(
    fs.readFileSync(archive.replace(/\.dump$/, '.json'), 'utf8'),
  );
  const settings = connectionSettings(
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  );
  const schema = process.env.DATABASE_SCHEMA || 'public';
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema))
    throw new Error('Invalid database schema.');
  await validateBackup(archive, metadata, settings, schema);
  const credentials = {
    appUrl: 'http://localhost:9000/#/',
    email: 'demo@liftup.test',
    name: 'LiftUp Test',
    password: randomBytes(18).toString('base64url'),
    status: 'pending',
    note: 'Local test only. Do not publish or reuse these credentials.',
  };
  const credentialsFile = path.join(
    directory,
    `local-test-account-${randomUUID()}.json`,
  );
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify(credentials, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
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
  try {
    const report = await adoptLegacyForTest(database, credentials);
    credentials.status = 'created';
    fs.writeFileSync(
      credentialsFile,
      JSON.stringify(credentials, null, 2) + '\n',
      { mode: 0o600 },
    );
    let cookie = '';
    async function api(route, method = 'GET', body) {
      const response = await fetch('http://localhost:9000' + route, {
        method,
        signal: AbortSignal.timeout(90000),
        headers: {
          'content-type': 'application/json',
          'x-liftup-request': '1',
          cookie,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      assert.ok(response.ok, `${route} returned ${response.status}`);
      return response.status === 204 ? null : response.json();
    }
    try {
      await api('/api/auth/login', 'POST', {
        email: credentials.email,
        password: credentials.password,
      });
      assert.equal((await api('/api/auth/me')).user.id, String(report.userId));
      assert.equal((await api('/api/v1/plans/default')).plan.id, report.planId);
      const history = (await api('/api/v1/workouts')).workouts;
      assert.deepEqual(
        history.map((item) => item.id).sort((a, b) => a - b),
        report.workoutIds,
      );
      report.apiVerified = true;
    } finally {
      if (cookie) await api('/api/auth/logout', 'POST');
    }
    credentials.status = 'ready';
    fs.writeFileSync(
      credentialsFile,
      JSON.stringify(credentials, null, 2) + '\n',
      { mode: 0o600 },
    );
    fs.writeFileSync(
      credentialsFile.replace(/\.json$/, '.receipt.json'),
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          backup: path.basename(archive),
          ...report,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    console.log(JSON.stringify(report, null, 2));
    console.log(`Test credentials saved privately: ${credentialsFile}`);
  } finally {
    await database.close();
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(
      'Local test-account setup stopped:',
      error.code || error.name,
    );
    process.exitCode = 1;
  });

module.exports = { adoptLegacyForTest, contentSnapshot };
