import {it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createApp} from '../server/app';
import {publicationMetadata} from '../server/publication';
import {HEADERS,buildView,defaultFilters,type Dataset} from '../src/lib/domain';
const row=(id:string,value:number,billing:string|null=null,surgery='2026-09-20')=>['A',id,surgery,'Eletiva','Cliente','SP','Hospital','SP','Médico fictício','PACIENTE NÃO PUBLICAR','Representante',billing,'NOTA RESTRITA',value];
it('usa o mesmo instante de publicação e o calendário de Brasília, inclusive na virada UTC',()=>{
 expect(publicationMetadata(new Date('2026-10-17T01:30:00Z'))).toEqual({asOf:'2026-10-16',updatedAt:'2026-10-17T01:30:00.000Z'});
 expect(publicationMetadata(new Date('2026-10-17T03:00:00Z')).asOf).toBe('2026-10-17');
});
it('duas publicações preservam versões completas, referência automática e retenção de duas semanas atrás',async()=>{
 const dir=await mkdtemp(tmpdir()+'/retention-weekly-');vi.stubEnv('LOCAL_DATA_DIR',dir);
 let instant=new Date('2026-10-02T15:00:00Z');const server=createApp(true,()=>instant).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const get=async(path:string,cookie?:string)=>fetch(url+'/api'+path,{headers:cookie?{Cookie:cookie}:{}});
 try{
  const auth=await fetch(url+'/api/auth/local',{method:'POST'}),cookie=auth.headers.get('set-cookie')!.split(';')[0];
  const publish=async(rows:unknown[][],expectedId:string|null,extra={})=>fetch(url+'/api/import',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({headers:HEADERS,rows,fileName:'ficticia.xlsx',expectedId,confirmed:true,...extra})});
  const rows=[row('PARCIAL',100,'2026-09-30'),row('PARCIAL',200),row('PARCIAL',300),row('FUTURA',50,null,'2026-10-10'),row('QUARENTENA',70,'2026-09-01')];
  const r1=await publish(rows,null,{asOf:'2000-01-01',updatedAt:'2000-01-01T00:00:00Z'});expect(r1.status).toBe(200);const first=await r1.json() as Dataset;
  expect(first.asOf).toBe('2026-10-02');expect(first.updatedAt).toBe(instant.toISOString());expect(first.audit.quarantinedRows).toBe(1);expect(buildView(first,defaultFilters()).summary.pending).toBe(50000);
  instant=new Date('2026-10-16T16:45:00Z');const updated=structuredClone(rows);updated[1][11]='2026-10-09';
  const r2=await publish(updated,first.id);expect(r2.status).toBe(200);const second=await r2.json() as Dataset;expect(second.asOf).toBe('2026-10-16');expect(second.updatedAt).toBe(instant.toISOString());
  const publicBase=await (await get('/public/dataset')).json() as Dataset,privateBase=await (await get('/dataset',cookie)).json() as Dataset;
  expect(publicBase.id).toBe(second.id);expect(privateBase.id).toBe(second.id);expect(publicBase.asOf).toBe(privateBase.asOf);expect(buildView(publicBase,defaultFilters()).summary.pending).toBe(35000);
  const historical={...defaultFilters(),referenceDate:'2026-10-02'};expect(buildView(publicBase,historical).summary.pending).toBe(50000);expect(buildView(publicBase,historical).summary.partial).toBe(1);
  const versions=await (await get('/public/versions')).json();expect(versions.map((v:{id:string})=>v.id)).toEqual([second.id,first.id]);expect(JSON.stringify(versions)).not.toContain('ficticia.xlsx');
  const archived=await (await get('/public/versions/'+first.id)).json() as Dataset;expect(archived.records).toHaveLength(4);expect(archived.records[1].billingDate).toBeNull();expect(buildView(archived,historical).summary.pending).toBe(50000);expect(archived.auditRecords).toHaveLength(1);
  expect(JSON.stringify(archived)).not.toContain('PACIENTE NÃO PUBLICAR');expect(JSON.stringify(archived)).not.toContain('NOTA RESTRITA');expect(JSON.stringify(archived)).not.toContain('ficticia.xlsx');
  expect((await get('/versions/'+first.id)).status).toBe(401);const privateOld=await (await get('/versions/'+first.id,cookie)).json() as Dataset;expect(privateOld.records[0].note).toBe('NOTA RESTRITA');
  expect((await (await get('/public/dataset')).json()).id).toBe(second.id);
  const conflict=await publish(rows,first.id);expect(conflict.status).toBe(409);expect((await (await get('/public/versions')).json())).toHaveLength(2);
  const duplicate=await publish(updated,second.id);expect(duplicate.status).toBe(409);
 }finally{await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
});
