import {beforeAll,afterAll,it,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import ExcelJS from 'exceljs';
import {HEADERS,STATUSES} from '../src/lib/domain';
let dir:string,file:string,output:string,report:any;
const run=(args:string[])=>execFileSync(process.execPath,['--import','tsx','scripts/reconcile-financial.ts',...args],{encoding:'utf8',stdio:'pipe',timeout:120000});
beforeAll(async()=>{
 dir=await mkdtemp(tmpdir()+'/retention-reconciliation-');file=resolve(dir,'ficticia.xlsx');output=resolve(dir,'audit');
 const row=(company:string,id:string,surgery:unknown,value:unknown,billing:unknown=null)=>[company,id,surgery,'Eletiva','Cliente','SP','Hospital','SP','Médico fictício','PACIENTE NÃO EXPORTAR','Representante fictício',billing,'NOTA INTERNA',value];
 const book=new ExcelJS.Workbook(),s=book.addWorksheet('Dados');s.addRow([...HEADERS]);
 [row('A','MULTI','01/12/2025','100,11','05/09/2026'),row('A','MULTI','01/12/2025',200.22),row('A','MULTI','01/12/2025',50.33,'10/10/2026'),row('B','MULTI',46023,10.01),row('A','PAID',new Date('2026-02-01T00:00:00Z'),300.44,'2026-09-01'),row('A','PENDING','2026-09-02',400.55),row('A','QUAR','2026-08-01',999.99,'2026-07-01'),row('A','DUP','2026-09-01',12.34),row('A','DUP','2026-09-01',12.34),row('A','FUTURE','2026-10-05',75.25),row('A','ZERO','2026-09-01',0)].forEach(r=>s.addRow(r));
 await book.xlsx.writeFile(file);run([file,'2026-10-16',output,'2025-12-31','2026-09-30','2026-10-09']);report=JSON.parse(await readFile(resolve(output,'reconciliation.json'),'utf8'));
},120000);
afterAll(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
it('concilia registros, datas, parcial, empresas, duplicatas, centavos, anos, quarentena e KPIs por apuração independente',async()=>{
 expect(report.sourceRows).toBe(11);expect(report.quarantineRows).toBe(1);expect(report.interpretationDifferences).toBe(0);expect(report.kpisBandsFlowsHistoryRankingsVerified).toBe(true);expect(report.publicFinancialViewsEqual).toBe(true);
 for(const p of report.positions){expect(p.bridgeResidualCents).toBe(0);expect(p.pendingByStatus['Totalmente pendente']+p.pendingByStatus['Parcialmente faturada']).toBe(p.dashboardPendingCents);}
 const september=report.positions.find((p:any)=>p.reference==='2026-09-30');expect(september.dashboardPendingCents).toBe(68579);expect(september.pendingByStatus[STATUSES[1]]).toBe(25055);
 const current=report.positions.find((p:any)=>p.reference==='2026-10-16');expect(current.dashboardPendingCents).toBe(report.excelBlankCents);expect(current.dashboardPendingCents).toBe(71071);
 const trace=await readFile(resolve(output,'row-reconciliation.csv'),'utf8');expect(trace).not.toContain('PACIENTE NÃO EXPORTAR');expect(trace).not.toContain('NOTA INTERNA');
});
it('falha quando o motor muda um valor em relação ao Excel, sem ajustar a origem',async()=>{
 const engine=JSON.parse(await readFile(resolve(output,'engine.json'),'utf8'));engine.records[0].cents++;const altered=resolve(dir,'alterado.json');await writeFile(altered,JSON.stringify(engine));
 expect(()=>execFileSync('python3',['scripts/reconcile_financial.py',file,altered,output],{stdio:'pipe'})).toThrow();
});
it('detecta snapshot compartilhado desatualizado por valores e corte diferentes',async()=>{
 const engine=JSON.parse(await readFile(resolve(output,'engine.json'),'utf8'));const snapshot={id:'versao-ficticia-antiga',asOf:'2026-10-09',records:structuredClone(engine.records)};snapshot.records[0].cents++;
 const shared=resolve(dir,'shared.json'),out=resolve(dir,'snapshot-audit');await writeFile(shared,JSON.stringify(snapshot));run([file,'2026-10-16',out,'--shared',shared]);
 const r=JSON.parse(await readFile(resolve(out,'reconciliation.json'),'utf8'));expect(r.sharedComparison).toMatchObject({sameReference:false,sameFinancialRows:false,changedRows:1,onlySourceRows:0,onlySharedRows:0});
});
it.runIf(!!process.env.OFFICIAL_RECONCILIATION_PATH)('reproduz a referência do Excel e os dois saldos históricos na planilha geral privada',async()=>{
 const out=resolve(dir,'official');run([process.env.OFFICIAL_RECONCILIATION_PATH!,'2026-10-16',out,'2026-09-30','2026-10-08','2026-10-09','2026-10-15']);
 const actual=JSON.parse(await readFile(resolve(out,'reconciliation.json'),'utf8'));const expected=JSON.parse(await readFile('docs/conciliacao-financeira-geral.json','utf8'));
 expect(actual).toEqual(expected);
},120000);
