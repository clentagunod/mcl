import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Compile an in-memory overlay: production web source is never rewritten by this check.
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../../web');
const staged = path.join(here, 'web');
let ts;
try { ts = createRequire(path.join(web, 'functions/package.json'))('typescript'); }
catch { ts = createRequire(path.join(web, 'package.json'))('typescript'); }
if (typeof ts.createProgram !== 'function') throw new Error('A TypeScript compiler with the JavaScript compiler API is required.');
const normalize = p => path.resolve(p).replaceAll('\\', '/').toLowerCase();
const replacements = new Map();
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(source);
    else if (/\.(ts|tsx)$/.test(source)) replacements.set(normalize(path.join(web, path.relative(staged, source))), source);
  }
}
visit(staged);
const configPath = path.join(web, 'tsconfig.app.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, web, { noEmit: true, incremental: false }, configPath);
const options = { ...parsed.options, noEmit: true, incremental: false, composite: false, tsBuildInfoFile: undefined };
const host = ts.createCompilerHost(options);
const read = host.readFile.bind(host);
const exists = host.fileExists.bind(host);
host.readFile = p => read(replacements.get(normalize(p)) ?? p);
host.fileExists = p => replacements.has(normalize(p)) || exists(p);
host.getSourceFile = (p, version) => {
  const content = host.readFile(p);
  return content === undefined ? undefined : ts.createSourceFile(p, content, version, true);
};
const added = [...replacements.values()].map(p => path.join(web, path.relative(staged, p)))
  .filter(p => !parsed.fileNames.some(f => normalize(f) === normalize(p)));
const program = ts.createProgram([...parsed.fileNames, ...added], options, host);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: p => p, getCurrentDirectory: () => web, getNewLine: () => '\n',
}));
if (diagnostics.some(d => d.category === ts.DiagnosticCategory.Error)) process.exitCode = 1;
else console.log(`Web typecheck passed with ${replacements.size} staged source replacements.`);
