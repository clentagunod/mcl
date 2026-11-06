import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const web=path.resolve(here,'../../web');
const overlay=original=>path.join(here,'web',path.relative(web,original));
export default {
  root:web,
  cacheDir:path.join(here,'.tmp/vite-cache'),
  plugins:[{name:'staged-review-overlay',enforce:'pre',
    resolveId(source,importer){
      if(!importer||!source.startsWith('.'))return;
      const base=path.resolve(path.dirname(importer.split('?')[0]),source);
      for(const candidate of [base,base+'.ts',base+'.tsx',path.join(base,'index.ts')]) {
        const staged=overlay(candidate);
        if(fs.existsSync(staged)&&fs.statSync(staged).isFile())return candidate;
      }
    },
    load(id){
      if(id.startsWith('\0'))return;
      const original=id.split('?')[0];
      if(!path.isAbsolute(original)||!original.startsWith(web))return;
      const staged=overlay(original);
      if(fs.existsSync(staged)&&fs.statSync(staged).isFile())return fs.readFileSync(staged,'utf8');
    },
  }],
  test:{environment:'node',include:process.env.MCL_LEDGER_TEST_SUITE==='spark'?['tests/firestore-spark.test.ts']:['src/**/*.test.ts'],
    fileParallelism:false,maxWorkers:1,testTimeout:30000,hookTimeout:30000},
};
