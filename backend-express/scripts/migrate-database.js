const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { PostgresDatabase, runMigrations } = require('../src/database');
const { connectionSettings, targetFingerprint } = require('./backup-database');

const legacyTables = [
  'workout_plans',
  'plan_days',
  'planned_exercises',
  'workout_sessions',
  'workout_exercises',
  'workout_sets',
  'custom_exercises',
  'plan_templates',
];
const ownerTables = [
  'workout_plans',
  'workout_sessions',
  'custom_exercises',
  'plan_templates',
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

async function validateBackup(
  archive,
  metadata,
  settings,
  schema,
  now = Date.now(),
) {
  if (
    metadata.schema !== schema ||
    metadata.targetFingerprint !== targetFingerprint(settings, schema)
  ) {
    throw new Error(
      'Backup does not match this database/schema. Run db:backup again.',
    );
  }
  const age = now - Date.parse(metadata.createdAt);
  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age > 60 * 60 * 1000 ||
    metadata.archiveReadVerified !== true
  ) {
    throw new Error(
      'A read-verified backup created within the last hour is required.',
    );
  }
  if (
    path.basename(archive) !== metadata.file ||
    fs.statSync(archive).size !== metadata.bytes
  ) {
    throw new Error('Backup filename or size does not match its manifest.');
  }
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== metadata.sha256)
    throw new Error('Backup checksum does not match.');
}

async function snapshot(database) {
  const result = {};
  for (const table of legacyTables) {
    const rows = await database
      .prepare(
        `SELECT to_jsonb(t) - 'user_id' AS row FROM ${table} t ORDER BY id`,
      )
      .all();
    const hash = createHash('sha256');
    for (const row of rows)
      hash.update(JSON.stringify(canonical(row.row)) + '\n');
    result[table] = { count: rows.length, sha256: hash.digest('hex') };
  }
  return result;
}

async function migrateAccounts(database, metadata) {
  return database.transaction(async () => {
    await database.exec("SET LOCAL lock_timeout = '5s'");
    await database.exec("SET LOCAL statement_timeout = '30s'");
    await database.exec(
      "SELECT pg_advisory_xact_lock(hashtext('liftup-accounts-migration'))",
    );
    await database.exec(
      `LOCK TABLE ${legacyTables.join(', ')}, schema_migrations IN SHARE ROW EXCLUSIVE MODE`,
    );
    const applied = (
      await database
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all()
    ).map((row) => row.version);
    assert.deepEqual(
      applied,
      metadata.sourceReadinessBeforeDump.appliedMigrations,
      'Database version changed since backup.',
    );
    const available = fs
      .readdirSync(path.join(__dirname, '..', 'migrations'))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
      .sort();
    const pending = available.filter((version) => !applied.includes(version));
    if (pending.some((version) => !['010_accounts.sql', '011_camera_sets.sql', '012_training_preferences.sql'].includes(version))) {
      throw new Error(
        'This command only permits the reviewed accounts, camera-set and training-preferences migrations.',
      );
    }
    const before = await snapshot(database);
    await runMigrations(database);
    const after = await snapshot(database);
    assert.deepEqual(
      after,
      before,
      'Existing records changed; migration must roll back.',
    );
    const ownership = {};
    for (const table of ownerTables) {
      ownership[table] = await database
        .prepare(
          `SELECT COUNT(*) AS total, COUNT(user_id) AS assigned FROM ${table}`,
        )
        .get();
      if (pending.includes('010_accounts.sql'))
        assert.equal(
          ownership[table].assigned,
          0,
          'Legacy records must remain unassigned.',
        );
    }
    return {
      applied: pending,
      preservedRows: Object.fromEntries(
        Object.entries(before).map(([table, data]) => [table, data.count]),
      ),
      recordsUnchanged: true,
      ownership,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--backup')
    throw new Error(
      'Usage: npm run db:migrate -- --backup backups/<filename>.dump',
    );
  const directory = fs.realpathSync(path.join(__dirname, '..', 'backups'));
  const archive = fs.realpathSync(
    path.resolve(path.join(__dirname, '..'), args[1]),
  );
  if (path.dirname(archive) !== directory || !archive.endsWith('.dump'))
    throw new Error('Use a completed dump in backend-express/backups.');
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
  console.log(
    'Backup identity, freshness and checksum verified. Applying reviewed migration transactionally.',
  );
  const pool = new Pool({
    ...settings,
    port: Number(settings.port),
    ssl: { rejectUnauthorized: true },
    enableChannelBinding: true,
    connectionTimeoutMillis: 15000,
    max: 1,
  });
  const database = new PostgresDatabase(pool, { schema });
  try {
    const result = await migrateAccounts(database, metadata);
    const report = {
      completedAt: new Date().toISOString(),
      schema,
      backup: path.basename(archive),
      ...result,
    };
    const reportPath = path.join(
      directory,
      `migration-${Date.now()}-${randomUUID().slice(0, 8)}.json`,
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(JSON.stringify(report, null, 2));
    console.log(`Migration receipt: ${reportPath}`);
  } finally {
    await database.close();
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error('Migration stopped:', error.code || error.name);
    process.exitCode = 1;
  });

module.exports = { canonical, validateBackup, migrateAccounts, snapshot };
