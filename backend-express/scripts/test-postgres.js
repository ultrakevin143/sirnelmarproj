const { spawn } = require('node:child_process');
const path = require('node:path');

// Opt-in only: the default npm test continues to use pg-mem.
// Each database fixture generates and cleans up its own restricted test schema.
console.log('Testing real PostgreSQL in isolated gymtracker_test_* schemas.');
console.log('Existing application schemas will not be migrated or seeded.');

const child = spawn(
  process.execPath,
  [
    '--test',
    '--test-concurrency=1',
    'test/accounts.test.js',
    'test/postgres.test.js',
    'test/test-account.test.js',
    'test/camera-sets.test.js',
    'test/training-features.test.js',
  ],
  {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LIFTUP_TEST_DATABASE: 'postgres', NODE_ENV: 'test' },
    stdio: 'inherit',
  },
);

child.on('error', (error) => {
  console.error('Could not start PostgreSQL tests:', error.code || error.name);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
