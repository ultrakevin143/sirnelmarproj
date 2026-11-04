import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const frontend = path.join(root, 'frontend');
const android = path.join(frontend, 'src-capacitor/android');
const javaDirectory = path.join(root, '.tools/java');
const localJava = existsSync(javaDirectory)
  ? readdirSync(javaDirectory).find((entry) => existsSync(path.join(javaDirectory, entry, 'bin/java.exe')))
  : undefined;
const javaHome = process.env.JAVA_HOME || (localJava ? path.join(javaDirectory, localJava) : '');
const sdk = process.env.ANDROID_HOME || path.join(root, '.tools/android-sdk');
if (!javaHome || !existsSync(sdk)) {
  throw new Error('Install a compatible JDK and Android SDK; set JAVA_HOME and ANDROID_HOME. See docs/ANDROID_SETUP.md.');
}
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk };
const release = process.argv.includes('--release');
const signingDirectory = path.join(root, '.tools/signing');
const signingFile = path.join(signingDirectory, 'release-signing.json');
if (process.argv.includes('--init-signing')) {
  if (!release) throw new Error('--init-signing requires --release.');
  if (existsSync(signingFile) || existsSync(path.join(signingDirectory, 'LiftUp-release.jks'))) {
    throw new Error('A signing identity already exists. Reuse it; do not replace the key for updates.');
  }
  mkdirSync(signingDirectory, { recursive: true });
  const password = randomBytes(32).toString('base64url');
  const signing = {
    keystorePath: path.join(signingDirectory, 'LiftUp-release.jks'),
    storePassword: password,
    keyAlias: 'liftup-release',
    keyPassword: password,
  };
  const generated = spawnSync(path.join(javaHome, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool'), [
    '-genkeypair', '-keystore', signing.keystorePath, '-storetype', 'JKS',
    '-storepass:env', 'LIFTUP_GENERATED_PASSWORD', '-keypass:env', 'LIFTUP_GENERATED_PASSWORD',
    '-alias', signing.keyAlias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
    '-dname', 'CN=LiftUp, OU=Student Project, O=LiftUp, C=PH',
  ], { env: { ...env, LIFTUP_GENERATED_PASSWORD: password }, stdio: 'inherit' });
  if (generated.error) throw generated.error;
  if (generated.status !== 0) throw new Error('Could not create the release signing key.');
  writeFileSync(signingFile, JSON.stringify(signing, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Created a private release signing identity under .tools/signing. Back up that directory securely.');
}
if (release) {
  if (existsSync(signingFile)) {
    const signing = JSON.parse(readFileSync(signingFile, 'utf8'));
    env.LIFTUP_KEYSTORE_PATH ||= signing.keystorePath;
    env.LIFTUP_KEYSTORE_PASSWORD ||= signing.storePassword;
    env.LIFTUP_KEY_ALIAS ||= signing.keyAlias;
    env.LIFTUP_KEY_PASSWORD ||= signing.keyPassword;
  }
  for (const name of ['LIFTUP_KEYSTORE_PATH', 'LIFTUP_KEYSTORE_PASSWORD', 'LIFTUP_KEY_ALIAS', 'LIFTUP_KEY_PASSWORD']) {
    if (!env[name]) throw new Error(`Missing ${name}. Configure release signing or initialize it once with --release --init-signing.`);
  }
  if (!existsSync(env.LIFTUP_KEYSTORE_PATH)) throw new Error('The release keystore could not be found.');
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, env, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:android:web'], frontend);
writeFileSync(path.join(android, 'local.properties'), `sdk.dir=${sdk.split(path.sep).join('/')}\n`);
const variant = release ? 'release' : 'debug';
run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [release ? ':app:assembleRelease' : ':app:assembleDebug', '--no-daemon', '--max-workers=2'], android);
const destination = path.join(root, 'artifacts/android');
mkdirSync(destination, { recursive: true });
copyFileSync(path.join(android, `app/build/outputs/apk/${variant}/app-${variant}.apk`), path.join(destination, `LiftUp-${variant}.apk`));
console.log(`Installable ${variant} APK: ${path.join(destination, `LiftUp-${variant}.apk`)}`);
