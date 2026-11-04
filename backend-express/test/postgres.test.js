const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Pool } = require('pg');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const {
  openDatabase,
  newTestSchema,
  PostgresDatabase,
  runMigrations,
} = require('../src/database');
const { createApp } = require('../src/server');
const { inspectDatabase } = require('../scripts/check-database');
const { migrateAccounts } = require('../scripts/migrate-database');

const enabled = process.env.LIFTUP_TEST_DATABASE === 'postgres';

test(
  'real PostgreSQL keeps transactions, constraints and cleanup inside the test schema',
  { skip: !enabled },
  async () => {
    const schema = newTestSchema();
    const database = await openDatabase({ schema, testSchema: true });
    try {
      assert.equal(
        (await database.prepare('SELECT current_schema() AS name').get()).name,
        schema,
      );
      const before = await database
        .prepare('SELECT COUNT(*) AS count FROM workout_plans')
        .get();
      await assert.rejects(
        database.transaction(async () => {
          await database
            .prepare(
              'INSERT INTO workout_plans (plan_key, name, updated_at) VALUES (?, ?, ?)',
            )
            .run('rollback-check', 'Temporary', new Date().toISOString());
          throw new Error('Deliberate rollback');
        }),
        /Deliberate rollback/,
      );
      assert.equal(
        (
          await database
            .prepare('SELECT COUNT(*) AS count FROM workout_plans')
            .get()
        ).count,
        before.count,
      );
      await assert.rejects(
        database
          .prepare(
            'INSERT INTO workout_plans (plan_key, name, updated_at) VALUES (?, ?, ?)',
          )
          .run('default', 'Duplicate', new Date().toISOString()),
        { code: '23505' },
      );
      // A failed statement must not leave a pooled connection in a broken transaction.
      assert.equal(
        (await database.prepare('SELECT current_schema() AS name').get()).name,
        schema,
      );
      await assert.rejects(
        database.close({ dropSchema: 'public' }),
        /generated test schema/,
      );
    } finally {
      await database.close({ dropSchema: schema });
    }
    const observer = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    });
    try {
      const result = await observer.query(
        'SELECT 1 FROM information_schema.schemata WHERE schema_name = $1',
        [schema],
      );
      assert.equal(
        result.rowCount,
        0,
        'Temporary schema must be removed after verification',
      );
    } finally {
      await observer.end();
    }
  },
);

test(
  'account and session persist across a real PostgreSQL API restart',
  { skip: !enabled },
  async () => {
    const schema = newTestSchema();
    let service;
    let server;
    async function start(testSchema) {
      service = await createApp({ schema, testSchema });
      server = service.app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      return `http://127.0.0.1:${server.address().port}`;
    }
    async function stop(preserveSchema) {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
        server = null;
      }
      if (service) {
        await service.close(
          preserveSchema ? { preserveSchema: true } : { dropSchema: schema },
        );
        service = null;
      }
    }
    try {
      const first = await start(true);
      const registration = await fetch(`${first}/api/auth/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-liftup-request': '1',
        },
        body: JSON.stringify({
          name: 'Persistence check',
          email: 'restart@example.test',
          password: 'postgres-test-password-123',
        }),
      });
      assert.equal(registration.status, 201);
      const registered = await registration.json();
      const cookie = registration.headers.get('set-cookie').split(';')[0];
      await stop(true);
      const restarted = await start(false);
      const me = await fetch(`${restarted}/api/auth/me`, {
        headers: { cookie },
      });
      assert.equal(me.status, 200);
      assert.equal((await me.json()).user.id, registered.user.id);
      const plan = await fetch(`${restarted}/api/v1/plans/default`, {
        headers: { cookie },
      });
      assert.equal(plan.status, 200);
      assert.equal((await plan.json()).plan.days.length, 7);
    } finally {
      if (service) await stop(false);
      else {
        // Reopening can fail after the first service has closed. Still clean up
        // only the generated schema owned by this test.
        await new PostgresDatabase(
          new Pool({ connectionString: process.env.DATABASE_URL }),
          { schema },
        ).close({ dropSchema: schema });
      }
    }
  },
);

test(
  'accounts migration preserves pre-account records without claiming their ownership',
  { skip: !enabled },
  async () => {
    const schema = newTestSchema();
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    });
    const database = new PostgresDatabase(pool, { schema });
    try {
      // The identifier is generated locally, not supplied by a user or environment.
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await database.exec(
        'CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
      );
      const directory = path.join(__dirname, '..', 'migrations');
      const legacy = readdirSync(directory)
        .filter((file) => /^00\d_.*\.sql$/.test(file))
        .sort();
      for (const version of legacy) {
        await database.transaction(async () => {
          await database.exec(
            readFileSync(path.join(directory, version), 'utf8'),
          );
          await database
            .prepare(
              'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
            )
            .run(version, new Date().toISOString());
        });
      }
      const timestamp = new Date().toISOString();
      const planId = (
        await database
          .prepare(
            'INSERT INTO workout_plans (plan_key, name, updated_at) VALUES (?, ?, ?)',
          )
          .run('default', 'Legacy weekly plan', timestamp)
      ).lastInsertRowid;
      const workoutId = (
        await database
          .prepare(
            'INSERT INTO workout_sessions (name, started_at, notes) VALUES (?, ?, ?)',
          )
          .run('Legacy workout', timestamp, 'Keep this note')
      ).lastInsertRowid;
      const exerciseId = (
        await database
          .prepare(
            `INSERT INTO workout_exercises
      (workout_id, exercise_id, exercise_slug, exercise_name, added_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(workoutId, 'legacy-bench', 'bench', 'Bench press', timestamp)
      ).lastInsertRowid;
      await database
        .prepare(
          `INSERT INTO workout_sets
      (workout_exercise_id, set_number, weight_kg, reps, logged_at, is_completed) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(exerciseId, 1, 60, 10, timestamp, 1);
      const before = {};
      for (const table of [
        'workout_plans',
        'workout_sessions',
        'workout_exercises',
        'workout_sets',
      ]) {
        before[table] = await database
          .prepare(`SELECT * FROM ${table} ORDER BY id`)
          .all();
      }
      const upgrade = await migrateAccounts(database, {
        sourceReadinessBeforeDump: { appliedMigrations: legacy },
      });
      assert.deepEqual(upgrade.applied, ['010_accounts.sql', '011_camera_sets.sql', '012_training_preferences.sql']);
      assert.equal(upgrade.recordsUnchanged, true);
      await assert.rejects(
        migrateAccounts(database, {
          sourceReadinessBeforeDump: { appliedMigrations: legacy },
        }),
        /version changed/,
      );
      await runMigrations(database);
      for (const [table, rows] of Object.entries(before)) {
        const after = await database
          .prepare(`SELECT * FROM ${table} ORDER BY id`)
          .all();
        assert.deepEqual(
          after,
          rows.map((row) =>
            ['workout_plans', 'workout_sessions'].includes(table)
              ? { ...row, user_id: null }
              : row,
          ),
        );
      }
      assert.equal(
        (
          await database
            .prepare('SELECT * FROM workout_plans WHERE id = ?')
            .get(planId)
        ).user_id,
        null,
      );
      assert.equal(
        (
          await database
            .prepare('SELECT COUNT(*) AS count FROM app_users')
            .get()
        ).count,
        0,
      );
      const client = await pool.connect();
      try {
        const readiness = await inspectDatabase(client, schema);
        assert.equal(readiness.accountsSchemaReady, true);
        assert.equal(readiness.ownership.workout_sessions.unassigned, 1);
      } finally {
        client.release();
      }
    } finally {
      await database.close({ dropSchema: schema });
    }
  },
);
