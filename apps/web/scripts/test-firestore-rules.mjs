import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environment = { ...process.env, CI: 'true', NO_UPDATE_NOTIFIER: 'true', FIREBASE_EMULATORS_PATH: path.join(root, '.tmp', 'firebase-emulators') };
// Android Studio includes a JDK; using it does not modify the Android project.
const studioJava = 'C:\\Program Files\\Android\\Android Studio\\jbr';
if (!environment.JAVA_HOME && process.platform === 'win32' && existsSync(path.join(studioJava, 'bin', 'java.exe'))) environment.JAVA_HOME = studioJava;
if (environment.JAVA_HOME) {
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  environment[pathKey] = `${path.join(environment.JAVA_HOME, 'bin')}${path.delimiter}${environment[pathKey] ?? ''}`;
}
mkdirSync(environment.FIREBASE_EMULATORS_PATH, { recursive: true });
const child = spawn(process.execPath, [
  path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js'),
  'emulators:exec', '--project', 'demo-mcl-policy', '--config', 'firebase.emulator.json', '--only', 'firestore',
  'node --test tests/firestore-policy.rules.mjs',
], { cwd: root, env: environment, stdio: 'inherit', windowsHide: true });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
