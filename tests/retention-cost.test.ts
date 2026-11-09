import {describe,it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import {COST_HEADERS,HEADERS,validateBase,buildView,defaultFilters,DIMENSIONS,type Dimension} from '../src/lib/domain';
import {parseFile} from '../src/lib/import';
import {normalizeAudit} from '../src/lib/audit';
import {publicDataset} from '../server/public-data';
import {excelReport,excelTemplate} from '../server/reports';
import {auditWorkbook} from '../src/lib/audit-export';

const row=(id:string,cost:unknown,value=100,billing:unknown=null)=>['EMPRESA',id,'2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico','PACIENTE SIGILOSO','Representante',billing,null,cost,value];
const dataset=(rows:unknown[][])=>validateBase(COST_HEADERS,rows,'2026-10-16','teste.xlsx');
const view=(rows:unknown[][])=>buildView(dataset(rows),defaultFilters());

describe('Retenção a preço de custo por registro',()=>{
 it('lê N como custo e O como valor, preservando integralmente os cálculos financeiros legados',()=>{
  const rows=[row('PARCIAL',30,100),row('PARCIAL',90,200,'2026-10-10'),row('PENDENTE',50,300),row('FATURADA',400,500,'2026-09-20')];
  const current=view(rows),legacy=buildView(validateBase([...HEADERS],rows.map(r=>[...r.slice(0,13),r[14]]),'2026-10-16','legado.xlsx'),defaultFilters());
  expect(current.summary.cost).toMatchObject({cents:8000,coveredRows:2,eligibleRows:2,coverage:1,percent:.2});
  expect(current.surgeries.find(s=>s.appointment==='PARCIAL')?.pending).toBe(10000);
  const financial=(v:typeof current)=>({summary:{...v.summary,cost:undefined,bands:v.summary.bands.map(b=>({...b,cost:undefined}))},flow:v.flowCents,count:v.flowCount,movements:v.movements,rankings:v.rankings});
  expect(financial(current)).toEqual(financial(legacy));
  expect(current.monthly.find(m=>m.at==='2026-09-30')?.cost.cents).toBe(17000);
  expect(current.summary.bands.reduce((sum,b)=>sum+(b.cost.cents??0),0)).toBe(8000);
 });
 it('usa custo da linha pendente em cirurgia parcial e zera somente quando todas as linhas com custo estão faturadas',()=>{
  const d=dataset([row('A',80,100,'2026-10-10'),row('A',20,50,'2026-10-16')]);
  expect(buildView(d,{...defaultFilters(),referenceDate:'2026-10-09'}).summary.cost.cents).toBe(10000);
  expect(buildView(d,{...defaultFilters(),referenceDate:'2026-10-10'}).summary.cost.cents).toBe(2000);
  expect(buildView(d,defaultFilters()).summary.cost).toMatchObject({cents:0,percent:null,eligibleRows:0});
 });
 it('não replica custo por agendamento nem elimina linhas legítimas repetidas',()=>{
  const v=view([row('A',30),row('A',30),row('A',20)]);
  expect(v.summary.count).toBe(1);expect(v.summary.cost.cents).toBe(8000);expect(v.summary.cost.eligibleRows).toBe(3);
 });
 it('exclui quarentena, preserva custo original na auditoria e não desloca Valor total',async()=>{
  const d=dataset([row('A',30),row('B',999,200,'2026-08-30')]);
  expect(buildView(d,defaultFilters()).summary.cost.cents).toBe(3000);expect(d.audit.quarantinedCents).toBe(20000);
  const r=normalizeAudit(d).auditRecords![0];expect(r.cost).toBe(999);expect(r.cells[13]).toBe(200);expect(r.columnCount).toBe(15);
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await auditWorkbook(d.issues,d) as unknown as ArrayBuffer);
  expect(wb.getWorksheet('Registros')!.getRow(1).values).toContain('Custo médio total');expect(JSON.stringify(d)).not.toContain('PACIENTE SIGILOSO');
 });
 it.each([null,'',-1,'inválido',Infinity])('mantém custo %s fora da cobertura sem perder o registro financeiro',cost=>{
  const d=dataset([row('A',cost),row('B',0)]),v=buildView(d,defaultFilters());
  expect(v.summary.pending).toBe(20000);expect(v.summary.cost).toMatchObject({cents:0,coveredRows:1,eligibleRows:2,coverage:.5,percent:null});
  expect(d.audit.quarantinedRows).toBe(0);expect(d.issues.some(i=>i.code.startsWith('cost_'))).toBe(true);
 });
 it('mantém zero válido, custo ausente indisponível e denominador zero sem percentuais fictícios',()=>{
  expect(view([row('A',0)]).summary.cost).toMatchObject({cents:0,coverage:1,percent:0});
  expect(view([row('A',null)]).summary.cost).toMatchObject({cents:null,coverage:0,percent:null});
  expect(view([row('A',10,0)]).summary.cost).toMatchObject({cents:1000,percent:null});
  const legacy=validateBase([...HEADERS],[[...row('A',10).slice(0,13),100]],'2026-10-16','antiga.xlsx');
  expect(buildView(legacy,defaultFilters()).summary.cost).toMatchObject({cents:null,coveredRows:0,eligibleRows:1});
  expect(legacy.records[0]).not.toHaveProperty('costCents');
 });
 it.each(Object.keys(DIMENSIONS) as Dimension[])('aplica o filtro %s antes do custo e respeita o status/faixa',dimension=>{
  const d=dataset([row('A',30),row('B',80)]);d.records[1][dimension]='OUTRO';
  const selected=buildView(d,{...defaultFilters(),[dimension]:[d.records[0][dimension]],statuses:['Totalmente pendente'],bands:[0]});
  expect(selected.summary.pending).toBe(10000);expect(selected.summary.cost.cents).toBe(3000);
 });
 it('rejeita somas de custo fora da precisão segura',()=>{
  expect(()=>dataset([row('A','90071992547409.91'),row('B',1)])).toThrow('precisão do custo');
 });
 it('preserva custo na leitura pública, relatórios e modelo novo, mantendo proteção de identificadores',async()=>{
  const d=dataset([row('A',30),row('B',null)]),shared=publicDataset(d,false);
  expect(shared.records.map(r=>r.costCents)).toEqual([3000,null]);expect(shared.records[0].appointment).not.toBe('A');
  expect(buildView(shared,defaultFilters()).summary.cost).toEqual(buildView(d,defaultFilters()).summary.cost);
  const report=new ExcelJS.Workbook();await report.xlsx.load(await excelReport(d,defaultFilters()) as unknown as ArrayBuffer);
  expect(report.getWorksheet('Agendamentos')!.getCell('Q2').value).toBe(30);
  expect(report.getWorksheet('Registros')!.getCell('H3').value).toBeNull();
  expect(report.getWorksheet('Retenção a custo')).toBeDefined();
  const template=new ExcelJS.Workbook();await template.xlsx.load(await excelTemplate() as unknown as ArrayBuffer);
  expect(template.worksheets[0].getRow(1).values).toEqual([undefined,...COST_HEADERS]);
 });
});

describe('Cabeçalhos identificados por nome, com privacidade',()=>{
 it.each(['xlsx','csv'])('importa %s com colunas reordenadas e remove paciente antes da requisição',async extension=>{
  const headers=[...COST_HEADERS].reverse(),values=row('A','12,34',987.65).reverse();let bytes:Buffer;
  if(extension==='xlsx'){const wb=new ExcelJS.Workbook(),s=wb.addWorksheet('Dados');s.addRow(headers);s.addRow(values);bytes=Buffer.from(await wb.xlsx.writeBuffer());}
  else bytes=Buffer.from([headers,values].map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n'));
  const result=await parseFile(new File([new Uint8Array(bytes)],'teste.'+extension),'2026-10-16');
  expect(result.dataset.records[0]).toMatchObject({costCents:1234,cents:98765});expect(JSON.stringify(result)).not.toContain('PACIENTE SIGILOSO');
 });
 it('rejeita cabeçalhos ambíguos, extras ou ausentes e põe linhas malformadas em quarentena',()=>{
  expect(()=>validateBase([...COST_HEADERS.slice(0,14),'Custo médio total'],[row('A',1)],'2026-10-16','x')).toThrow('Arquivo incompatível');
  expect(()=>validateBase([...HEADERS,'Outro'],[row('A',1)],'2026-10-16','x')).toThrow('Arquivo incompatível');
  const d=dataset([row('A',30),row('B',80).slice(0,14)]);expect(d.audit.quarantinedRows).toBe(1);
 });
});
