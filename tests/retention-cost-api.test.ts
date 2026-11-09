import {it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import type {Server} from 'node:http';
import {createApp} from '../server/app';
import {COST_HEADERS,HEADERS,buildView,defaultFilters,type Dataset} from '../src/lib/domain';

it('publica custos, preserva versão antiga, aceita mudança somente no custo e mantém valores após reiniciar',async()=>{
 const dir=await mkdtemp(tmpdir()+'/retention-cost-api-');vi.stubEnv('LOCAL_DATA_DIR',dir);
 let server:Server|undefined,url='';
 const start=async()=>{server=createApp(true,()=>new Date('2026-10-16T15:00:00Z')).listen(0,'127.0.0.1');await new Promise<void>(r=>server!.on('listening',r));url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;};
 const stop=()=>new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
 try{
  await start();const auth=await fetch(url+'/api/auth/local',{method:'POST'}),cookie=auth.headers.get('set-cookie')!.split(';')[0];
  const base=['A','001','2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico','PACIENTE PRIVADO','Representante',null,null];
  const post=(headers:readonly string[],rows:unknown[][],expectedId:string|null,session=true)=>fetch(url+'/api/import',{method:'POST',headers:{'Content-Type':'application/json',...(session?{Cookie:cookie}:{})},body:JSON.stringify({headers,rows,fileName:'custos.xlsx',expectedId,confirmed:true})});
  expect((await post(COST_HEADERS,[[...base,30,100]],null,false)).status).toBe(401);
  const oldResponse=await post(HEADERS,[[...base,100]],null);expect(oldResponse.status).toBe(200);const old=await oldResponse.json() as Dataset;
  const firstResponse=await post(COST_HEADERS,[[...base,30,100]],old.id);expect(firstResponse.status).toBe(200);const first=await firstResponse.json() as Dataset;
  const nextResponse=await post(COST_HEADERS,[[...base,40,100]],first.id);expect(nextResponse.status).toBe(200);const next=await nextResponse.json() as Dataset;
  expect((await post(COST_HEADERS,[[...base,40,100]],next.id)).status).toBe(409);
  expect((await post(COST_HEADERS,[[...base,90,100]],first.id)).status).toBe(409);
  await stop();await start();
  const current=await (await fetch(url+'/api/public/dataset')).json() as Dataset;
  expect(buildView(current,defaultFilters()).summary).toMatchObject({pending:10000,cost:{cents:4000}});
  expect(JSON.stringify(current)).not.toContain('PACIENTE PRIVADO');
  const versions=await (await fetch(url+'/api/public/versions')).json();expect(versions).toHaveLength(3);
  const archived=await (await fetch(url+'/api/public/versions/'+first.id)).json() as Dataset;
  expect(buildView(archived,defaultFilters()).summary.cost.cents).toBe(3000);
  const legacy=await (await fetch(url+'/api/public/versions/'+old.id)).json() as Dataset;
  expect(buildView(legacy,defaultFilters()).summary.cost.cents).toBeNull();
 }finally{if(server?.listening)await stop();vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
});
