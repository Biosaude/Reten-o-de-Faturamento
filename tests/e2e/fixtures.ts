import {test as base,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,rm,copyFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';

type LocalApp={url:string;directory:string};
type Options={officialDataDir:string|undefined};

async function stop(child:ChildProcess){
 if(child.exitCode!==null||child.signalCode!==null)return;
 await new Promise<void>(done=>{
  const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
  child.once('exit',()=>{clearTimeout(timer);done();});child.kill('SIGTERM');
 });
}

export const test=base.extend<Options&{localApp:LocalApp}>({
 officialDataDir:[undefined,{option:true}],
 localApp:async({officialDataDir},use)=>{
  const directory=await mkdtemp(join(tmpdir(),'retention-e2e-'));await chmod(directory,0o700);
  let child:ChildProcess|undefined;
  try{
   // Optional private fixture is copied into THIS test's directory, never modified at source.
   if(officialDataDir)for(const file of ['dataset.enc','encryption.key']){
    await copyFile(resolve(officialDataDir,file),join(directory,file));await chmod(join(directory,file),0o600);
   }
   // Explicit environment allowlist: no Supabase credentials or external identity/proxy bindings.
   child=spawn(process.execPath,['--import','tsx','scripts/e2e-server.ts'],{
    cwd:resolve('.'),env:{PATH:process.env.PATH,TMPDIR:tmpdir(),LOCAL_DATA_DIR:directory,NODE_ENV:'test'},
    stdio:['ignore','ignore','pipe','ipc'],
   });
   const processChild=child;let errors='';processChild.stderr!.on('data',chunk=>{errors=(errors+chunk).slice(-4000);});
   const port=await new Promise<number>((ready,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Timeout ao iniciar API E2E. '+errors)),20000);
    processChild.once('error',error=>{clearTimeout(timer);reject(error);});
    processChild.once('exit',code=>{clearTimeout(timer);reject(new Error(`API E2E terminou (${code}). ${errors}`));});
    processChild.on('message',message=>{
     const port=(message as {port?:number})?.port;
     if(typeof port==='number'){clearTimeout(timer);ready(port);}
    });
   });
   const url=`http://127.0.0.1:${port}`;
   const config=await (await fetch(url+'/api/auth/config')).json();
   expect(config).toEqual({local:true,supabaseUrl:null,anonKey:null});
   await use({url,directory});
  }finally{if(child)await stop(child);await rm(directory,{recursive:true,force:true});}
 },
 baseURL:async({localApp},use)=>use(localApp.url),
 context:async({context,localApp},use)=>{
  // Page-level mocks still work; any unmocked request outside this test's origin is denied.
  await context.route('**/*',route=>new URL(route.request().url()).origin===localApp.url?route.continue():route.abort('blockedbyclient'));
  await use(context);
 },
});
export {expect};
export type {Page} from '@playwright/test';
