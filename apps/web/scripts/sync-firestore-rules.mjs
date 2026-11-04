import { readFile, writeFile } from 'node:fs/promises';
const canonical = new URL('../firestore.rules', import.meta.url);
// Web deployments own these copies. Never rewrite the Android project's rules.
const copies = [new URL('../../../firestore.rules', import.meta.url)];
const source = await readFile(canonical, 'utf8');
for (const copy of copies) {
  if (process.argv.includes('--check')) {
    if (await readFile(copy, 'utf8') !== source) throw new Error(`Firestore rules drift: ${copy.pathname}. Run npm run sync:rules from apps/web.`);
  } else await writeFile(copy, source);
}
