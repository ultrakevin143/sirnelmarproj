const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectDatabase } = require('../scripts/check-database');

test('database readiness checks use a read-only transaction and never migrate legacy data', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('information_schema.tables'))
        return { rows: [{ table_name: 'workout_plans' }] };
      if (sql.includes('information_schema.columns')) return { rows: [] };
      if (sql.includes('COUNT(*)'))
        return { rows: [{ total: '3', assigned: '0' }] };
      return { rows: [] };
    },
  };
  const report = await inspectDatabase(client, 'public');
  assert.equal(calls[0].sql, 'BEGIN READ ONLY');
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.equal(report.accountsSchemaReady, false);
  assert.ok(report.pendingMigrations.includes('010_accounts.sql'));
  assert.deepEqual(report.ownership.workout_plans, {
    total: 3,
    assigned: 0,
    unassigned: 3,
  });
  for (const { sql } of calls)
    assert.doesNotMatch(
      sql,
      /\b(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i,
    );
});

test('database readiness rejects unsafe identifiers and rolls back query failures', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('information_schema.tables'))
        throw new Error('Query failed');
      return { rows: [] };
    },
  };
  await assert.rejects(
    inspectDatabase(client, 'public; DROP SCHEMA public'),
    /Invalid database schema/,
  );
  assert.equal(calls.length, 0);
  await assert.rejects(inspectDatabase(client, 'public'), /Query failed/);
  assert.equal(calls.at(-1), 'ROLLBACK');
});
