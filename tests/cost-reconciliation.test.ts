import {it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ExcelJS from 'exceljs';
import {COST_HEADERS,type Dataset} from '../src/lib/domain';

const execute=promisify(execFile);
const variants=['original','maiúsculas e espaços','minúsculas','reordenado e normalizado'] as const;
it.each(variants)('concilia custo N e valor O com cabeçalho %s',async variant=>{
 const dir=await mkdtemp(join(tmpdir(),'retention-cost-reconciliation-'));
 try{
  const indices=COST_HEADERS.map((_,i)=>i);if(variant==='reordenado e normalizado')indices.reverse();
  const normalize=(header:string)=>variant==='original'?header:variant==='minúsculas'?header.toLowerCase():`  ${header.normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase().replaceAll(' ','   ')}  `;
  const row=(id:string,cost:number,value:number,billing:string|null=null)=>['FICTÍCIA',id,'2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico','PACIENTE NÃO EXPORTAR','Representante',billing,null,cost,value];
  const rows=[row('PARCIAL',30,100),row('PARCIAL',90,200,'2026-10-10'),row('PENDENTE',50,300),row('FATURADA',70,500,'2026-09-15')];
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Dados');
  sheet.addRow(indices.map(i=>normalize(COST_HEADERS[i])));rows.forEach(r=>sheet.addRow(indices.map(i=>r[i])));
  const file=join(dir,'ficticia.xlsx'),output=join(dir,'resultado');await book.xlsx.writeFile(file);
  await execute(process.execPath,['--import','tsx','scripts/reconcile-cost.ts',file,'2026-11-09',output],{timeout:30000});
  const report=JSON.parse(await readFile(join(output,'reconciliation.json'),'utf8'));
  expect(report).toMatchObject({sourceRows:4,validRows:4,quarantinedRows:0});expect(report.checks).toHaveLength(18);
  expect(report.checks.find((c:{at:string;filtered:boolean})=>c.at==='2026-11-09'&&!c.filtered)).toMatchObject({pendingCents:40000,costCents:8000,eligibleRows:2,coveredRows:2});
  expect(report.checks.find((c:{at:string;filtered:boolean})=>c.at==='2026-09-30'&&!c.filtered)).toMatchObject({pendingCents:60000,costCents:17000,eligibleRows:3,coveredRows:3});
  const engine=JSON.parse(await readFile(join(output,'engine.json'),'utf8')) as {dataset:Dataset};
  expect(engine.dataset.records.map(r=>[r.cents,r.costCents])).toEqual([[10000,3000],[20000,9000],[30000,5000],[50000,7000]]);
  expect(JSON.stringify(engine)).not.toContain('PACIENTE NÃO EXPORTAR');
 }finally{await rm(dir,{recursive:true,force:true});}
},30000);
