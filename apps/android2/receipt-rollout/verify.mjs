import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const web=path.resolve(here,'../../web');
const env={...process.env,CI:'true',NO_UPDATE_NOTIFIER:'true',
  XDG_CONFIG_HOME:path.join(here,'.tmp/firebase-config'),
  FIREBASE_EMULATORS_PATH:path.join(web,'.tmp/firebase-emulators')};
delete env.DEBUG;
const studioJava='C:\\Program Files\\Android\\Android Studio\\jbr';
if(!env.JAVA_HOME&&process.platform==='win32'&&existsSync(path.join(studioJava,'bin/java.exe')))env.JAVA_HOME=studioJava;
if(env.JAVA_HOME){
  const key=Object.keys(env).find(key=>key.toLowerCase()==='path')??'PATH';
  env[key]=path.join(env.JAVA_HOME,'bin')+path.delimiter+(env[key]??'');
}
async function run(args){
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd:here,env,stdio:'inherit',windowsHide:true});
    child.on('error',reject);child.on('exit',resolve);
  });
  if(code!==0)throw new Error('Compatibility verification failed.');
}
if(process.argv.includes('--in-emulator')){
  if(!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(env.FIRESTORE_EMULATOR_HOST??'')||
    env.GCLOUD_PROJECT!=='demo-mcl-receipts-v1')throw new Error('Use the isolated demo emulator only.');
  await run(['--test','simple-payments.test.mjs']);
}else{
  await run([path.join(web,'node_modules/firebase-tools/lib/bin/firebase.js'),
    'emulators:exec','--project','demo-mcl-receipts-v1','--config','firebase.emulator.json',
    '--only','firestore','node verify.mjs --in-emulator']);
}
