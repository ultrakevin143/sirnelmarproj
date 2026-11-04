import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const packageDirectory = join(frontendDirectory, 'node_modules', '@bryllim', 'workout-guide');
const publicDirectory = join(frontendDirectory, 'public', 'workout-guide');

mkdirSync(publicDirectory, { recursive: true });
cpSync(join(packageDirectory, 'assets'), join(publicDirectory, 'assets'), { recursive: true, force: true });
for (const document of ['ATTRIBUTION.md', 'LICENSE-ASSETS', 'LICENSES.md']) {
  cpSync(join(packageDirectory, document), join(publicDirectory, document), { force: true });
}

console.log('Workout Guide artwork and license notices are ready in public/workout-guide.');
