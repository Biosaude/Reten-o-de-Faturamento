import {describe,it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import {HEADERS,validateBase,buildView,defaultFilters,keyOf} from '../src/lib/domain';
import {normalizeAudit,auditRows,reviewCount} from '../src/lib/audit';
import {auditWorkbook} from '../src/lib/audit-export';
import {publicDataset} from '../server/public-data';
const row=(appointment:string,doctor:string,amount=100,billing:string|null=null,note:string|null=null)=>['Empresa',appointment,'2026-09-01','Eletiva','Cliente','SP','Hospital','SP',doctor,null,'Representante original',billing,note,amount];
const base=()=>validateBase([...HEADERS],[row('ORIGINAL A','Médico original',100,null,'Nota original'),row('ORIGINAL B','Outro médico',200,'2026-08-01'),row('ORIGINAL C','Médico 1'),row('ORIGINAL C','Médico 2')],'2026-09-30','ficticia.xlsx');
describe('Auditoria sem alteração financeira',()=>{
 it('nota sem data continua pendente sem ocorrência ou quarentena',()=>{
  const ds=validateBase([...HEADERS],[row('ORIGINAL A','Médico original',100,null,'123')],'2026-09-30','ficticia.xlsx');
  expect(ds.issues).toEqual([]);expect(ds.audit.quarantinedRows).toBe(0);expect(ds.audit.inconsistentRecords).toBe(0);
  const view=buildView(ds,defaultFilters());expect(view.summary.pending).toBe(10000);expect(view.summary.count).toBe(1);expect(view.flowCents).toBe(0);expect(view.surgeries[0].days).toBe(29);
 });
 it('normaliza auditoria antiga sem regravar registros e recupera agendamento inclusive da quarentena',()=>{
  const raw=base();raw.issues.forEach(i=>delete i.appointment);
  raw.issues.push({row:2,key:keyOf('EMPRESA','ORIGINAL A'),code:'note_without_date',severity:'warning',message:'Nota sem data: registro permanece pendente.'});
  raw.audit.notesWithoutDate=1;raw.audit.inconsistentRecords=4;
  const corrected=normalizeAudit(raw);
  expect(corrected.records).toBe(raw.records);expect(buildView(corrected,defaultFilters())).toEqual(buildView(raw,defaultFilters()));
  expect(corrected.issues).toHaveLength(3);expect(corrected.audit.inconsistentRecords).toBe(3);expect(corrected.audit.quarantinedRows).toBe(1);expect(reviewCount(corrected)).toBe(2);
  expect(corrected.issues.find(i=>i.row===3)?.appointment).toBe('ORIGINAL B');expect(raw.issues).toHaveLength(4);
  expect(corrected.issues.filter(i=>i.appointment==='ORIGINAL C')).toHaveLength(2);
 });
 it('busca parcial por agendamento, linha, tipo e severidade e aplica filtro adicional',()=>{
  const ds=base();expect(auditRows(ds,'original c')).toHaveLength(2);expect(auditRows(ds,'3')).toHaveLength(1);
  expect(auditRows(ds,'ANTERIOR')).toHaveLength(1);expect(auditRows(ds,'quarentena')).toHaveLength(1);expect(auditRows(ds,'ConFeRiR')).toHaveLength(2);
  expect(auditRows(ds,'','error')).toHaveLength(1);expect(auditRows(ds,'','warning')).toHaveLength(2);expect(auditRows(ds,'inexistente')).toEqual([]);
 });
 it('exporta todos os resultados filtrados com cabeçalho, agendamento e filtros Excel',async()=>{
  const filtered=auditRows(base(),'ORIGINAL C','warning'),book=new ExcelJS.Workbook();await book.xlsx.load(await auditWorkbook(filtered));
  const sheet=book.worksheets[0];expect(sheet.rowCount).toBe(3);expect(sheet.getRow(1).values).toEqual([undefined,'Linha','Agendamento','Severidade','Ocorrência']);
  expect(sheet.getCell('B2').value).toBe('ORIGINAL C');expect(sheet.getCell('C2').value).toBe('Conferir');expect(sheet.autoFilter).toBe('A1:D3');expect(sheet.getColumn(4).width).toBe(85);expect(sheet.getRow(1).font.bold).toBe(true);
 });
 it('exportação vazia permanece um Excel válido',async()=>{const book=new ExcelJS.Workbook();await book.xlsx.load(await auditWorkbook([]));expect(book.worksheets[0].rowCount).toBe(1);});
 it('projeção pública não vaza agendamento original nem em ocorrências de quarentena',()=>{
  const raw=base(),shared=publicDataset(raw,false),serialized=JSON.stringify(shared);
  for(const original of ['ORIGINAL A','ORIGINAL B','ORIGINAL C','Médico original','Médico 1','Médico 2','Representante original'])expect(serialized).not.toContain(JSON.stringify(original));
  expect(shared.issues.find(i=>i.row===3)?.appointment).toMatch(/^Agendamento /);expect(shared.audit).toEqual(normalizeAudit(raw).audit);
 });
});
