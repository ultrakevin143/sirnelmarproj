require('dotenv').config({
  path: require('node:path').join(__dirname, '..', '.env'),
});

const { Pool } = require('pg');
const { readdirSync } = require('node:fs');
const path = require('node:path');

async function inspectDatabase(client, schema = 'public') {
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema))
    throw new Error('Invalid database schema name.');
  const quoted = `"${schema}"`;
  await client.query('BEGIN READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout = '15s'");
    const tables = (
      await client.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
        [schema],
      )
    ).rows.map((row) => row.table_name);
    const applied = tables.includes('schema_migrations')
      ? (
          await client.query(
            `SELECT version FROM ${quoted}.schema_migrations ORDER BY version`,
          )
        ).rows.map((row) => row.version)
      : [];
    const available = readdirSync(path.join(__dirname, '..', 'migrations'))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
      .sort();
    const pending = available.filter((file) => !applied.includes(file));
    const columns = (
      await client.query(
        `SELECT table_name FROM information_schema.columns
      WHERE table_schema = $1 AND column_name = 'user_id'`,
        [schema],
      )
    ).rows.map((row) => row.table_name);
    const ownership = {};
    for (const table of [
      'workout_plans',
      'workout_sessions',
      'custom_exercises',
      'plan_templates',
    ]) {
      if (!tables.includes(table)) continue;
      const counts = await client.query(`SELECT COUNT(*) AS total,
        ${columns.includes(table) ? 'COUNT(user_id)' : '0'} AS assigned
        FROM ${quoted}."${table}"`);
      const total = Number(counts.rows[0].total);
      const assigned = Number(counts.rows[0].assigned);
      ownership[table] = { total, assigned, unassigned: total - assigned };
    }
    const report = {
      readOnly: true,
      schema,
      appliedMigrations: applied,
      pendingMigrations: pending,
      accountsSchemaReady:
        pending.length === 0 &&
        tables.includes('app_users') &&
        tables.includes('auth_sessions'),
      ownership,
    };
    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required in backend-express/.env.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    max: 1,
  });
  try {
    const client = await pool.connect();
    try {
      console.log(
        JSON.stringify(
          await inspectDatabase(
            client,
            process.env.DATABASE_SCHEMA || 'public',
          ),
          null,
          2,
        ),
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module)
  main().catch((error) => {
    // Do not print a connection string, query contents or account details on errors.
    console.error('Read-only database check failed:', error.code || error.name);
    process.exitCode = 1;
  });

module.exports = { inspectDatabase };
