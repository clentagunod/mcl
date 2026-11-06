import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const web=path.resolve(here,'../../web');
const requireWeb=createRequire(path.join(web,'package.json'));
let esbuild;
try { esbuild=createRequire(path.join(web,'functions/package.json'))('esbuild'); }
catch { esbuild=requireWeb('esbuild'); }
const normalize=p=>path.resolve(p).replaceAll('\\','/').toLowerCase();
const staged=p=>path.join(here,'web',path.relative(web,p));
const entry=['payments','clients','renewals','client-trash-operations','converters'].map(name=>
  `export * from ${JSON.stringify(path.join(web,'src/services',name+'.ts'))};`).join('\n');
await esbuild.build({absWorkingDir:web,tsconfigRaw:{compilerOptions:{}},stdin:{contents:entry,resolveDir:web,loader:'ts'},bundle:true,platform:'node',target:'node22',format:'cjs',
  outfile:path.join(here,'.tmp/web-services.cjs'),plugins:[{name:'reviewable-overlay',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if(args.path.startsWith('firebase/'))return {path:requireWeb.resolve(args.path),external:true};
      if(!args.path.startsWith('.')&&!path.isAbsolute(args.path))return;
      const candidate=path.resolve(args.resolveDir,args.path);
      if(normalize(candidate)===normalize(path.join(web,'src/config/firebase'))||normalize(candidate)===normalize(path.join(web,'src/config/firebase.ts')))
        return {path:'firebase-config',namespace:'test-only'};
      for(const p of [candidate,candidate+'.ts',candidate+'.tsx',path.join(candidate,'index.ts')])
        if((fs.existsSync(staged(p))&&fs.statSync(staged(p)).isFile()) ||
          (fs.existsSync(p)&&fs.statSync(p).isFile()))return {path:p};
    });
    build.onLoad({filter:/.*/,namespace:'test-only'},()=>({contents:'export const db=globalThis.__receiptTestDb; export const auth=globalThis.__receiptTestAuth;',loader:'js'}));
    build.onLoad({filter:/\.(ts|tsx)$/},args=>{
      const replacement=staged(args.path);
      if(fs.existsSync(replacement))return {contents:fs.readFileSync(replacement,'utf8'),loader:args.path.endsWith('.tsx')?'tsx':'ts',resolveDir:path.dirname(args.path)};
    });
  }}]});
console.log('Bundled actual staged web services for isolated emulator integration tests.');
