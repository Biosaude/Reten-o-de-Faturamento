import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';

it('executa a conferência em snapshot READ ONLY e retorna apenas metadados sem alterar tabelas',async()=>{
 const db=new PGlite();
 const orphan='00000000-0000-4000-8000-000000000001',current='00000000-0000-4000-8000-000000000002',outside='00000000-0000-4000-8000-000000000003';
 const payload={id:current,asOf:'2026-11-09',updatedAt:'2026-11-09T20:01:20Z',records:[{cents:12345,costCents:3333,private:'PRIVATE-ROW'}]};
 try{
  await db.exec(`create table retention_current(singleton boolean primary key,payload jsonb);
   create table retention_imports(dataset_id uuid,imported_at timestamptz);
   create table retention_audit_versions(dataset_id uuid,as_of text,published_at timestamptz,financial_complete boolean);`);
  await db.query('insert into retention_current values(true,$1)',[JSON.stringify(payload)]);
  await db.query('insert into retention_imports values($1,$2),($3,$4)',[current,'2026-11-09T20:01:20Z',outside,'2026-11-09T20:04:00Z']);
  await db.query('insert into retention_audit_versions values($1,$2,$3,true),($4,$2,$5,true),($6,$2,$7,true)',[orphan,'2026-11-09','2026-11-09T20:01:10Z',current,'2026-11-09T20:01:20Z',outside,'2026-11-09T20:04:00Z']);
  const snapshot=()=>db.exec('select * from retention_current;select * from retention_imports order by dataset_id;select * from retention_audit_versions order by dataset_id;');
  const before=await snapshot();
  const results=await db.exec(await readFile('docs/queries/audit-import-attempts.sql','utf8'));
  const rows=results.filter(r=>r.rows.length).map(r=>r.rows);
  expect(rows[0]).toEqual([{read_only:'on',isolation:'repeatable read'}]);
  expect(rows[1]).toEqual([{dataset_id:current,reference_date:'2026-11-09',published_at:'2026-11-09T20:01:20Z',valid_rows:1}]);
  expect(rows[2]).toMatchObject([{dataset_id:current,is_current:true,has_archive:true,financial_complete:true}]);
  expect(rows[3]).toMatchObject([{dataset_id:orphan,has_import_log:false},{dataset_id:current,has_import_log:true}]);
  expect(JSON.stringify(rows)).not.toContain(outside);
  for(const forbidden of ['PRIVATE-ROW','cents','costCents','3333','12345'])expect(JSON.stringify(rows)).not.toContain(forbidden);
  expect(await snapshot()).toEqual(before);
 }finally{await db.close();}
},20000);
