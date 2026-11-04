import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'artifacts/render-deployment');
const excluded = new Set([
  '.git', 'node_modules', '.quasar', 'dist', '.tools', 'backups', 'data',
  '.vscode', '.DS_Store', '.thumbs.db', 'Thumbs.db',
]);
function include(source) {
  const relative = path.relative(root, source).split(path.sep).join('/');
  const parts = relative.split('/');
  if (parts.some((part) => excluded.has(part))) return false;
  const name = parts.at(-1);
  if (name.startsWith('.env') && name !== '.env.example') return false;
  if (/\.(log|sqlite|sqlite-shm|sqlite-wal|jks|keystore)$/i.test(name)) return false;
  if (name.includes('.temporary.compiled')) return false;
  return !['frontend/public/pose', 'frontend/public/workout-guide'].some(
    (prefix) => relative === prefix || relative.startsWith(prefix + '/'),
  );
}

await mkdir(destination, { recursive: true });
for (const item of ['.gitignore', 'package.json', 'render.yaml', 'README.md', 'scripts', 'frontend', 'backend-express']) {
  await cp(path.join(root, item), path.join(destination, item), {
    recursive: true, filter: include, dereference: false,
  });
}
await mkdir(path.join(destination, 'docs'), { recursive: true });
await cp(path.join(root, 'docs/FREE_HOSTING_SETUP.md'), path.join(destination, 'docs/FREE_HOSTING_SETUP.md'));

// A second pass refuses accidental credentials anywhere in the prepared source.
const localEnv = await readFile(path.join(root, 'backend-express/.env'), 'utf8').catch(() => '');
const configuredDatabaseUrl = localEnv.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
let files = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Remove symbolic links from deployment source.');
    if (entry.isDirectory()) await inspect(filename);
    else {
      if (entry.name.startsWith('.env') && entry.name !== '.env.example') {
        throw new Error('An environment file was found in deployment source.');
      }
      const content = await readFile(filename);
      const text = content.toString('utf8');
      const relative = path.relative(destination, filename).split(path.sep).join('/');
      if ((configuredDatabaseUrl && text.includes(configuredDatabaseUrl)) ||
          (!relative.includes('/test/') && /(?:postgres(?:ql)?:\/\/)[^\s"']+@[^\s"']+\.neon\.tech/i.test(text))) {
        throw new Error('A database credential was found in deployment source.');
      }
      files += 1;
    }
  }
}
await inspect(destination);
console.log(`Prepared ${files} source files in artifacts/render-deployment. Environment files, database backups, generated assets and nested Git history are excluded.`);
