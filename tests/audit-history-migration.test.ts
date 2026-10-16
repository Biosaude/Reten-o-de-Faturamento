import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {HEADERS,validateBase,buildView,defaultFilters} from '../src/lib/domain';
let db:PGlite,first:ReturnType<typeof validateBase>,second:ReturnType<typeof validateBase>;
const actor='00000000-0000-4000-8000-000000000001';
const row=(id:string,amount:number,billing:string|null=null)=>['A',id,'2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico','PACIENTE FICTÍCIO','Representante',billing,'NOTA ORIGINAL',amount];
const publish=(payload:typeof first,expected:string|null,who=actor)=>db.query('select public.replace_retention_dataset($1::jsonb,$2::uuid,$3::uuid)',[JSON.stringify(payload),expected,who]);
const state=async()=>({current:(await db.query<{payload:typeof first}>('select payload from retention_current')).rows[0].payload,archives:Number((await db.query<{count:string}>('select count(*) from retention_audit_versions')).rows[0].count),imports:Number((await db.query<{count:string}>('select count(*) from retention_imports')).rows[0].count)});
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);`);
 await db.exec(await readFile('supabase/migrations/001_retention.sql','utf8'));await db.query('insert into auth.users values($1)',[actor]);await db.query("insert into retention_roles values($1,'admin')",[actor]);
 first=validateBase([...HEADERS],[row('QUARANTENA',30,'2026-08-01'),row('VALIDO',100)],'2026-10-09','primeira.xlsx');
 second=validateBase([...HEADERS],[row('QUARANTENA',30,'2026-09-02'),row('VALIDO',100)],'2026-10-16','segunda.xlsx');
 await publish(first,null);await db.exec(await readFile('supabase/migrations/002_retention_audit_versions.sql','utf8'));
},120000);
afterAll(async()=>{await db?.close();});
it('migration preserva a versão corrente, os motivos e o log anterior sem pacientes',async()=>{
 const s=await state();expect(s.current.id).toBe(first.id);expect(s.archives).toBe(1);expect(s.imports).toBe(1);
 const archived=(await db.query<{payload:typeof first}>('select payload from retention_audit_versions where dataset_id=$1',[first.id])).rows[0].payload;
 expect(archived.auditRecords).toHaveLength(1);expect(archived.auditRecords![0].cells[1]).toBe('QUARANTENA');expect(JSON.stringify(archived)).not.toContain('PACIENTE FICTÍCIO');
});
it('publicação guarda dados e corte juntos e mantém a quarentena anterior após correção',async()=>{
 await publish(second,first.id);const s=await state();expect(s.current.id).toBe(second.id);expect(s.current.asOf).toBe('2026-10-16');expect(s.archives).toBe(2);expect(s.imports).toBe(2);
 const archived=(await db.query<{payload:typeof first}>('select payload from retention_audit_versions where dataset_id=$1',[first.id])).rows[0].payload;expect(archived.audit.quarantinedRows).toBe(1);expect(s.current.audit.quarantinedRows).toBe(0);expect(buildView(s.current,defaultFilters()).summary.pending).toBe(10000);
});
it('conflito e falha tardia no log revertem dados, corte e novo arquivo histórico atomicamente',async()=>{
 const next=validateBase([...HEADERS],[row('NOVO',500)],'2026-10-16','nao-publicada.xlsx');await expect(publish(next,first.id)).rejects.toThrow('CONFLICT');
 await expect(publish(next,second.id,'00000000-0000-4000-8000-000000000099')).rejects.toThrow();
 const s=await state();expect(s.current.id).toBe(second.id);expect(s.current.asOf).toBe(second.asOf);expect(s.archives).toBe(2);expect(s.imports).toBe(2);
});
it('histórico não pode ser lido pelo público nem por usuários autenticados diretamente',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await expect(db.query('select * from public.retention_audit_versions')).rejects.toMatchObject({code:'42501'});}finally{await db.exec('reset role');}}
 await db.exec('set role service_role');try{expect((await db.query('select dataset_id from public.retention_audit_versions')).rows).toHaveLength(2);}finally{await db.exec('reset role');}
});
