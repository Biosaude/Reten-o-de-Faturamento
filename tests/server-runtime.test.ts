import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const run=promisify(execFile);
let dir:string;
beforeAll(async()=>{
 dir=await mkdtemp(join(tmpdir(),'retention-esm-'));
 await writeFile(join(dir,'package.json'),JSON.stringify({type:'module'}));
 await symlink(resolve('node_modules'),join(dir,'node_modules'),'dir');
 await run(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p','tsconfig.server.json','--noEmit','false','--allowImportingTsExtensions','false','--rootDir',process.cwd(),'--outDir',dir]);
},30000);
afterAll(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});

async function invoke(emptySupabase:boolean){
 // Native Node loads emitted ESM: no tsx, Vite or Vitest import resolution.
 const source=`
  import {createServer} from 'node:http';
  import {once} from 'node:events';
  import app from ${JSON.stringify(pathToFileURL(join(dir,'api/handler.js')).href)};
  const emptySupabase=${emptySupabase};
  let requests=[];
  const database=createServer((req,res)=>{
   requests.push({method:req.method,url:req.url});
   res.writeHead(200,{'Content-Type':'application/json'});
   res.end('[]');
  });
  const server=app.listen(0,'127.0.0.1');
  try {
   await once(server,'listening');
   if(emptySupabase){
    database.listen(0,'127.0.0.1');await once(database,'listening');
    process.env.SUPABASE_URL='http://127.0.0.1:'+database.address().port;
    process.env.SUPABASE_SERVICE_ROLE_KEY='runtime-test-only';
   }
   const url='http://127.0.0.1:'+server.address().port;
   const response=await fetch(url+'/api/public/dataset');
   const privateResponse=await fetch(url+'/api/dataset');
   console.log(JSON.stringify({status:response.status,body:await response.json(),privateStatus:privateResponse.status,requests}));
  } finally {
   await new Promise(resolve=>server.close(resolve));
   if(database.listening)await new Promise(resolve=>database.close(resolve));
  }
 `;
 const env:NodeJS.ProcessEnv={...process.env,VERCEL:'1'};
 delete env.SUPABASE_URL;
 delete env.SUPABASE_SERVICE_ROLE_KEY;
 const {stdout}=await run(process.execPath,['--input-type=module','--eval',source],{env,timeout:15000});
 return JSON.parse(stdout);
}

describe('Runtime ESM da função Vercel',()=>{
 it('carrega handler e toda a cadeia do backend sem Supabase configurado',async()=>{
  expect(await invoke(false)).toEqual({status:200,body:null,privateStatus:401,requests:[]});
 },20000);
 it('retorna 200/null quando o Supabase ainda não tem uma base importada',async()=>{
  const result=await invoke(true);
  expect(result).toMatchObject({status:200,body:null,privateStatus:401});
  expect(result.requests).toHaveLength(1);
  expect(result.requests[0].method).toBe('GET');
  const query=new URL(result.requests[0].url,'http://test.invalid');
  expect(query.pathname).toBe('/rest/v1/retention_current');
  expect(query.searchParams.get('select')).toBe('payload');
  expect(query.searchParams.get('singleton')).toBe('eq.true');
 },20000);
});
