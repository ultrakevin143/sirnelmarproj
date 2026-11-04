import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
function npm(directory, args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: path.join(root, directory), stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// A local verification can reuse installed dependencies. Hosted builds always install locks.
if (!process.argv.includes('--skip-install')) {
  npm('backend-express', ['ci', '--omit=dev']);
  npm('frontend', ['ci', '--include=dev']);
}
npm('frontend', ['run', 'build']);
