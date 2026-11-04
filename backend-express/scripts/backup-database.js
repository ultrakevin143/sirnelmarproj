require('dotenv').config({
  path: require('node:path').join(__dirname, '..', '.env'),
  quiet: true,
});

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const tls = require('node:tls');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Pool } = require('pg');
const { inspectDatabase } = require('./check-database');
const execute = promisify(execFile);

function connectionSettings(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('A PostgreSQL connection is required.');
  // Neon documents the -pooler suffix; dump/restore must use the direct endpoint.
  const hostname = url.hostname.endsWith('.neon.tech')
    ? url.hostname.replace(/-pooler(?=\.)/, '')
    : url.hostname;
  const settings = {
    host: hostname,
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
  if (Object.values(settings).some((item) => !item || /[\r\n]/.test(item))) {
    throw new Error('Database connection fields are missing or invalid.');
  }
  return settings;
}

const escapePassfile = (value) =>
  value.replaceAll('\\', '\\\\').replaceAll(':', '\\:');

function targetFingerprint(settings, schema) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        settings.host.toLowerCase(),
        Number(settings.port),
        settings.database,
        settings.user,
        schema,
      ]),
    )
    .digest('hex');
}
function pgEnvironment(
  settings,
  passfile,
  certificateFile,
  inherited = process.env,
) {
  const env = Object.fromEntries(
    Object.entries(inherited).filter(
      ([key]) =>
        !/^PG/i.test(key) &&
        !['DATABASE_URL', 'DIRECT_DATABASE_URL'].includes(key.toUpperCase()),
    ),
  );
  return {
    ...env,
    PGHOST: settings.host,
    PGPORT: settings.port,
    PGDATABASE: settings.database,
    PGUSER: settings.user,
    PGPASSFILE: passfile,
    PGCONNECT_TIMEOUT: '15',
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: certificateFile,
    PGCHANNELBINDING: 'require',
  };
}

async function main() {
  const settings = connectionSettings(
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  );
  const schema = process.env.DATABASE_SCHEMA || 'public';
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema))
    throw new Error('Invalid database schema.');
  const extension = process.platform === 'win32' ? '.exe' : '';
  const portable = path.join(
    __dirname,
    '..',
    '.tools',
    'postgresql-18.6',
    'bin',
  );
  const dumpTool =
    process.env.PG_DUMP_PATH ||
    (fs.existsSync(path.join(portable, `pg_dump${extension}`))
      ? path.join(portable, `pg_dump${extension}`)
      : `pg_dump${extension}`);
  const restoreTool =
    process.env.PG_RESTORE_PATH ||
    (fs.existsSync(path.join(portable, `pg_restore${extension}`))
      ? path.join(portable, `pg_restore${extension}`)
      : `pg_restore${extension}`);
  const version = (
    await execute(dumpTool, ['--version'], { windowsHide: true })
  ).stdout.trim();
  const outputDirectory = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const stem = `liftup-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const partial = path.join(outputDirectory, `${stem}.dump.partial`);
  const destination = path.join(outputDirectory, `${stem}.dump`);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'liftup-backup-'));
  const passfile = path.join(temporary, 'pgpass.conf');
  const certificates = path.join(temporary, 'root-certificates.pem');
  try {
    fs.writeFileSync(
      passfile,
      Object.values(settings).map(escapePassfile).join(':') + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    fs.writeFileSync(certificates, tls.rootCertificates.join('\n'), {
      mode: 0o600,
      flag: 'wx',
    });
    const environment = pgEnvironment(settings, passfile, certificates);
    // Obtain aggregate readiness information only. No migrations or seeding.
    const pool = new Pool({
      ...settings,
      port: Number(settings.port),
      ssl: { rejectUnauthorized: true },
      enableChannelBinding: true,
      connectionTimeoutMillis: 15000,
      max: 1,
    });
    let before;
    try {
      const client = await pool.connect();
      try {
        before = await inspectDatabase(client, schema);
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
    fs.closeSync(fs.openSync(partial, 'wx', 0o600));
    console.log(
      'Creating a read-only, custom-format application-schema backup.',
    );
    const options = {
      env: environment,
      windowsHide: true,
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    };
    await execute(
      dumpTool,
      [
        '--no-password',
        '--format=custom',
        '--no-acl',
        `--schema=${schema}`,
        `--file=${partial}`,
      ],
      options,
    );
    const listing = await execute(restoreTool, ['--list', partial], options);
    for (const table of [
      'schema_migrations',
      'workout_plans',
      'workout_sessions',
      'workout_exercises',
      'workout_sets',
    ]) {
      if (!listing.stdout.includes(`TABLE DATA ${schema} ${table} `))
        throw new Error('Backup is missing a required table.');
    }
    // Read/decompress the entire archive without connecting pg_restore to ANY database.
    await execute(
      restoreTool,
      [
        '--no-owner',
        '--no-acl',
        '--file',
        process.platform === 'win32' ? 'NUL' : '/dev/null',
        partial,
      ],
      options,
    );
    const digest = createHash('sha256');
    for await (const chunk of fs.createReadStream(partial))
      digest.update(chunk);
    const metadata = {
      createdAt: new Date().toISOString(),
      schema,
      targetFingerprint: targetFingerprint(settings, schema),
      tool: version,
      file: path.basename(destination),
      bytes: fs.statSync(partial).size,
      sha256: digest.digest('hex'),
      archiveReadVerified: true,
      testRestorePerformed: false,
      sourceReadinessBeforeDump: before,
    };
    fs.renameSync(partial, destination);
    fs.writeFileSync(
      path.join(outputDirectory, `${stem}.json`),
      JSON.stringify(metadata, null, 2) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    console.log(`Backup saved: ${destination}`);
    console.log(`Archive read check passed; SHA-256: ${metadata.sha256}`);
    console.log(
      'No live database migrations or restore operations were performed.',
    );
  } catch (error) {
    // Keep diagnostics private; never print credentials or archive contents.
    const detail = String(
      error.stderr || error.message || error.code || 'Backup failed',
    )
      .replaceAll(settings.password, '[redacted]')
      .replaceAll(process.env.DATABASE_URL || '\0', '[redacted]');
    fs.writeFileSync(path.join(outputDirectory, `${stem}.error.log`), detail, {
      mode: 0o600,
      flag: 'wx',
    });
    throw new Error(
      'Backup failed; inspect the private error log in backend-express/backups.',
    );
  } finally {
    // Exact files created above only; no recursive directory deletion.
    for (const file of [passfile, certificates])
      if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(temporary);
  }
}

if (require.main === module)
  main().catch(() => {
    console.error(
      'Backup did not complete. Check PostgreSQL tools, connectivity, and private backup diagnostics.',
    );
    process.exitCode = 1;
  });

module.exports = {
  connectionSettings,
  escapePassfile,
  pgEnvironment,
  targetFingerprint,
};
