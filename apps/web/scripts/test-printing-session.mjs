import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environment = { ...process.env, DEBUG: '', CI: 'true', NO_UPDATE_NOTIFIER: 'true',
  XDG_CONFIG_HOME: path.join(root, '.tmp', 'firebase-config'), FIREBASE_EMULATORS_PATH: path.join(root, '.tmp', 'firebase-emulators') };
const studioJava = 'C:\\Program Files\\Android\\Android Studio\\jbr';
if (!environment.JAVA_HOME && process.platform === 'win32' && existsSync(path.join(studioJava, 'bin', 'java.exe'))) environment.JAVA_HOME = studioJava;
if (environment.JAVA_HOME) {
  const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  environment[pathKey] = `${path.join(environment.JAVA_HOME, 'bin')}${path.delimiter}${environment[pathKey] ?? ''}`;
}
mkdirSync(environment.FIREBASE_EMULATORS_PATH, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4180', '--strictPort'], { cwd: root, env: environment, stdio: 'ignore', windowsHide: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100 && server.exitCode === null; attempt++) {
    try { ready = (await fetch('http://127.0.0.1:4180')).ok; } catch { /* Wait for the owned dev server. */ }
    if (ready) break;
    await setTimeout(100);
  }
  if (!ready) throw new Error('The printing-session test server could not start on port 4180.');
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      'node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:exec', '--project', 'demo-mcl-printing',
      '--config', 'firebase.printing-session.json', '--only', 'auth,firestore',
      'node node_modules/@playwright/test/cli.js test --config playwright.printing-session.config.ts',
    ], { cwd: root, env: environment, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', resolve);
  });
  process.exitCode = code ?? 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { server.kill(); }
