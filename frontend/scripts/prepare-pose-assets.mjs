import { mkdir, readdir, copyFile, access, writeFile, rename, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'public/pose');
await mkdir(path.join(destination, 'wasm'), { recursive: true });
const runtimeLicense = path.join(destination, 'LICENSE.runtime.txt');
try {
  await access(runtimeLicense);
} catch {
  const response = await fetch('https://www.apache.org/licenses/LICENSE-2.0.txt', {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Runtime license download failed (${response.status}).`);
  const license = await response.text();
  if (!license.includes('Apache License') || !license.includes('Version 2.0'))
    throw new Error('Runtime license response was not the expected Apache 2.0 text.');
  await writeFile(runtimeLicense, license);
}
const wasmSource = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
for (const file of await readdir(wasmSource)) {
  if (/\.(js|wasm)$/.test(file))
    await copyFile(path.join(wasmSource, file), path.join(destination, 'wasm', file));
}
const model = path.join(destination, 'pose_landmarker_lite.task');
try {
  await access(model);
} catch {
  console.log('Downloading the Google Pose Landmarker Lite model once for local hosting.');
  const url =
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Pose model download failed (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    createHash('sha256').update(bytes).digest('hex') !==
    '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'
  )
    throw new Error('Pose model checksum did not match the pinned revision.');
  await writeFile(model + '.partial', bytes);
  await rename(model + '.partial', model);
  console.log(`Pose model SHA-256: ${createHash('sha256').update(bytes).digest('hex')}`);
}
if (
  createHash('sha256')
    .update(await readFile(model))
    .digest('hex') !== '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'
)
  throw new Error('Local pose model is damaged. Restore the pinned revision.');
await writeFile(
  path.join(destination, 'NOTICE.txt'),
  [
    'MediaPipe Tasks Vision 1.1.1 runtime: Apache-2.0; Google MediaPipe contributors.',
    'The full runtime license is included in LICENSE.runtime.txt.',
    'Model: Pose Landmarker Lite, float16 revision 1, downloaded from Google mediapipe-models.',
    'Guide/model information: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker',
    'Runtime: https://www.npmjs.com/package/@mediapipe/tasks-vision',
    'Camera frames are processed locally; this application does not record or upload them.',
  ].join('\n') + '\n',
);
console.log('Local pose model and WASM assets are ready.');
