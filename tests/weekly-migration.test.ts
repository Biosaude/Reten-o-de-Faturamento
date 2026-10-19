import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {HEADERS,validateBase,buildView,defaultFilters,type Dataset} from '../src/lib/domain';
import {publicationMetadata} from '../server/publication';
it('upgrade preserva arquivo legado e arquiva duas publicações completas com rollback e RLS',async()=>{
 const db=new PGlite(),actor='00000000-0000-4000-8000-000000000001';
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);');
  for(const m of ['001_retention.sql','002_retention_audit_versions.sql'])await db.exec(await readFile('supabase/migrations/'+m,'utf8'));await db.query('insert into auth.users values($1)',[actor]);
  const row=(billing:string|null)=>['A','PARCIAL','2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico',null,'Representante',billing,'Nota',200];
  const publish=(ds:Dataset,expected:string|null,who=actor)=>db.query('select replace_retention_dataset($1::jsonb,$2::uuid,$3::uuid)',[JSON.stringify(ds),expected,who]);
  const unavailable=validateBase([...HEADERS],[row(null)],'2026-09-18','somente-auditoria.xlsx');await publish(unavailable,null);
  const legacy=validateBase([...HEADERS],[row(null)],'2026-09-25','legada.xlsx');await publish(legacy,unavailable.id);
  await db.exec(await readFile('supabase/migrations/003_retention_financial_versions.sql','utf8'));
  const first={...validateBase([...HEADERS],[row(null),row('2026-09-30')],'2026-10-02','primeira.xlsx'),...publicationMetadata(new Date('2026-10-02T15:00:00Z'))};
  const second={...validateBase([...HEADERS],[row('2026-10-09'),row('2026-09-30')],'2026-10-16','segunda.xlsx'),...publicationMetadata(new Date('2026-10-16T15:00:00Z'))};
  await publish(first,legacy.id);await publish(second,first.id);
  const versions=(await db.query<{payload:Dataset;financial_complete:boolean;published_at:Date}>('select payload,financial_complete,published_at from retention_audit_versions order by published_at')).rows;
  expect(versions).toHaveLength(4);expect(versions.filter(v=>v.financial_complete)).toHaveLength(3);expect(versions.find(v=>v.payload.id===unavailable.id)).toMatchObject({financial_complete:false,payload:{records:[]}});const old=versions.find(v=>v.payload.id===first.id)!.payload;expect(old.records).toEqual(first.records);
  expect(buildView(old,{...defaultFilters(),referenceDate:'2026-10-02'}).summary.pending).toBe(20000);expect(buildView(second,{...defaultFilters(),referenceDate:'2026-10-02'}).summary.pending).toBe(20000);expect(buildView(second,defaultFilters()).summary.pending).toBe(0);
  const rejected={...second,id:crypto.randomUUID()};await expect(publish(rejected,first.id)).rejects.toThrow('CONFLICT');await expect(publish(rejected,second.id,'00000000-0000-4000-8000-000000000099')).rejects.toThrow();
  expect((await db.query<{payload:Dataset}>('select payload from retention_current')).rows[0].payload.id).toBe(second.id);expect((await db.query('select dataset_id from retention_audit_versions')).rows).toHaveLength(4);expect((await db.query('select dataset_id from retention_imports')).rows).toHaveLength(4);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await expect(db.query('select payload from retention_audit_versions')).rejects.toMatchObject({code:'42501'});}finally{await db.exec('reset role');}}
 }finally{await db.close();}
},120000);
