const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { canonical, validateBackup } = require('../scripts/migrate-database');
const { targetFingerprint } = require('../scripts/backup-database');

test('migration fingerprints bind the database/schema but allow password rotation', () => {
  const settings = {
    host: 'example.com',
    port: '5432',
    database: 'gym',
    user: 'owner',
    password: 'one',
  };
  const fingerprint = targetFingerprint(settings, 'public');
  assert.equal(
    fingerprint,
    targetFingerprint({ ...settings, password: 'two' }, 'public'),
  );
  for (const key of ['host', 'database', 'user', 'port']) {
    assert.notEqual(
      fingerprint,
      targetFingerprint({ ...settings, [key]: 'different' }, 'public'),
    );
  }
  assert.notEqual(fingerprint, targetFingerprint(settings, 'other_schema'));
  assert.deepEqual(canonical({ z: [{ b: 1, a: 2 }], a: null }), {
    a: null,
    z: [{ a: 2, b: 1 }],
  });
});

test('migration rejects wrong targets, expired/unverified backups and altered dump files', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'liftup-guard-test-'),
  );
  const archive = path.join(directory, 'test.dump');
  const content = Buffer.from('PGDMP-test-fixture');
  fs.writeFileSync(archive, content, { flag: 'wx' });
  const settings = {
    host: 'example.com',
    port: '5432',
    database: 'gym',
    user: 'owner',
    password: 'secret',
  };
  const now = Date.now();
  const metadata = {
    schema: 'public',
    targetFingerprint: targetFingerprint(settings, 'public'),
    file: 'test.dump',
    bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
    createdAt: new Date(now).toISOString(),
    archiveReadVerified: true,
  };
  try {
    await validateBackup(archive, metadata, settings, 'public', now);
    await assert.rejects(
      validateBackup(archive, metadata, settings, 'other', now),
      /does not match/,
    );
    await assert.rejects(
      validateBackup(
        archive,
        { ...metadata, createdAt: 'invalid' },
        settings,
        'public',
        now,
      ),
      /last hour/,
    );
    await assert.rejects(
      validateBackup(archive, metadata, settings, 'public', now + 3600001),
      /last hour/,
    );
    await assert.rejects(
      validateBackup(
        archive,
        { ...metadata, archiveReadVerified: false },
        settings,
        'public',
        now,
      ),
      /last hour/,
    );
    await assert.rejects(
      validateBackup(
        archive,
        { ...metadata, bytes: 0 },
        settings,
        'public',
        now,
      ),
      /size/,
    );
    await assert.rejects(
      validateBackup(
        archive,
        { ...metadata, sha256: '0'.repeat(64) },
        settings,
        'public',
        now,
      ),
      /checksum/,
    );
  } finally {
    fs.unlinkSync(archive);
    fs.rmdirSync(directory);
  }
});
