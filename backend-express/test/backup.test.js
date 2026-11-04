const test = require('node:test');
const assert = require('node:assert/strict');
const {
  connectionSettings,
  escapePassfile,
  pgEnvironment,
} = require('../scripts/backup-database');

test('backup converts only Neon pooled endpoints to direct connections and decodes credentials', () => {
  const settings = connectionSettings(
    'postgresql://owner:p%3Ass%5Cword@ep-test-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
  );
  assert.equal(settings.host, 'ep-test.c-6.us-east-2.aws.neon.tech');
  assert.equal(settings.password, 'p:ss\\word');
  assert.equal(
    connectionSettings('postgres://owner:password@another-pooler.example/db')
      .host,
    'another-pooler.example',
  );
  assert.equal(escapePassfile(settings.password), 'p\\:ss\\\\word');
  assert.throws(() =>
    connectionSettings('https://owner:password@example.com/db'),
  );
  assert.throws(() =>
    connectionSettings('postgres://owner:password@example.com/'),
  );
  assert.throws(() =>
    connectionSettings('postgres://owner:p%0Aword@example.com/db'),
  );
});

test('backup child processes get a passfile, verified TLS and no inherited password or connection URL', () => {
  const settings = connectionSettings('postgres://owner:secret@example.com/db');
  const env = pgEnvironment(settings, 'private-passfile', 'trusted-ca.pem', {
    PATH: 'path',
    DATABASE_URL: 'secret-url',
    DIRECT_DATABASE_URL: 'other-secret',
    PGPASSWORD: 'secret',
    PGOPTIONS: 'unsafe options',
    PGSERVICE: 'other-service',
  });
  assert.equal(env.PATH, 'path');
  assert.equal(env.PGPASSWORD, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.DIRECT_DATABASE_URL, undefined);
  assert.equal(env.PGOPTIONS, undefined);
  assert.equal(env.PGSERVICE, undefined);
  assert.equal(env.PGPASSFILE, 'private-passfile');
  assert.equal(env.PGSSLMODE, 'verify-full');
  assert.equal(env.PGCHANNELBINDING, 'require');
  assert.ok(!Object.values(env).includes('secret'));
});
