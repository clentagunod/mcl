import { spawn } from 'node:child_process';

for (const args of [
  ['--test', 'tests/firestore-policy.rules.mjs'],
  ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.spark.config.ts'],
]) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (code !== 0) process.exit(code ?? 1);
}
