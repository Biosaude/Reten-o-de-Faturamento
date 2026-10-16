import {it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import {HEADERS,validateBase,buildView,defaultFilters} from '../src/lib/domain';
import {publicDataset} from '../server/public-data';
import {filteredAuditRows,normalizeAudit,auditCategorySummary,currentAuditStatus,auditSnapshot} from '../src/lib/audit';
import {auditWorkbook} from '../src/lib/audit-export';
const row=(id:string,value:unknown,billing:string|null=null,company='A')=>[company,id,'2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico real','PACIENTE SEGREDO','Representante real',billing,'NOTA SEGREDO',value];
const ds=()=>validateBase([...HEADERS],[row('001',30,'2026-08-01'),row('002','INVÁLIDO',null,'B'),row('003',100),row('003',50,'2026-09-10')],'2026-10-16','original.xlsx');
it('retém cada linha rejeitada e original A–N exceto J, sem alterar a visão financeira',()=>{
 const d=ds(),view=buildView(d,defaultFilters());expect(d.auditRecords).toHaveLength(2);expect(d.auditRecords![0].cells[1]).toBe('001');expect(d.auditRecords![1].cells[13]).toBe('INVÁLIDO');expect(d.auditRecords!.every(r=>r.cells[9]===null)).toBe(true);expect(JSON.stringify(d)).not.toContain('PACIENTE SEGREDO');expect(view.summary.pending).toBe(10000);expect(view.summary.partial).toBe(1);expect(d.audit.quarantinedRows).toBe(2);
});
it('filtra por empresa, motivo, classe, agendamento e período sem perder a linha financeira',()=>{
 const d=ds();expect(filteredAuditRows(d,'001','error',{company:'A',code:'billing_before_surgery',from:'2026-09-01',to:'2026-09-30'})).toHaveLength(1);expect(filteredAuditRows(d,'','error',{company:'B'})).toHaveLength(1);expect(filteredAuditRows(d,'','warning')).toHaveLength(0);expect(filteredAuditRows(d,'','error',{from:'2026-10-01'})).toHaveLength(0);
 const categories=auditCategorySummary(d,d.issues);expect(categories.find(c=>c.code==='billing_before_surgery')).toMatchObject({count:1,cents:3000});expect(categories.find(c=>c.code==='amount')).toMatchObject({count:1,cents:0,unknownAmounts:1});
});
it('público não recebe pacientes ou notas originais nem pelas linhas rejeitadas',()=>{
 const d=ds(),shared=publicDataset(d);for(const value of ['PACIENTE SEGREDO','NOTA SEGREDO'])expect(JSON.stringify(shared)).not.toContain(value);
 expect(shared.auditRecords![0].cells[1]).toBe('001');expect(shared.auditRecords![0].cells[8]).toBe('Médico real');const protectedData=publicDataset(d,false);expect(protectedData.auditRecords![0].cells[1]).toMatch(/^Agendamento /);expect(JSON.stringify(protectedData)).not.toContain('Médico real');expect(buildView(shared,defaultFilters()).summary).toEqual(buildView(d,defaultFilters()).summary);
});
it('Excel exporta campos da quarentena uma vez por linha, filtros, versão e motivos sem pacientes',async()=>{
 const d=ds(),issues=filteredAuditRows(d,'001','error',{company:'A'}),book=new ExcelJS.Workbook();await book.xlsx.load(await auditWorkbook(issues,d));const sheet=book.getWorksheet('Registros')!;expect(sheet.rowCount).toBe(2);expect(sheet.getCell('A2').value).toBe(d.id);expect(sheet.getCell('B2').value).toBe('2026-10-16');expect(sheet.getCell('D2').value).toBe(2);expect(sheet.getCell('F2').value).toBe('001');expect(sheet.getCell('Q2').value).toBe(30);expect(sheet.getCell('S2').value).toContain('Faturamento anterior');expect(sheet.autoFilter).toBe('A1:T2');expect(JSON.stringify(sheet.getSheetValues())).not.toContain('PACIENTE SEGREDO');
});
it('legados mostram detalhes indisponíveis e a quarentena não vira registros válidos',()=>{
 const d=ds();delete d.auditRecords;const normalized=normalizeAudit(d);expect(normalized.auditRecords).toHaveLength(2);expect(normalized.auditRecords![0].source).toBe('legacy_partial');expect(normalized.auditRecords![0].cells[2]).toBeNull();expect(normalized.auditRecords![0].cells[1]).toBe('001');expect(normalized.records).toBe(d.records);expect(auditSnapshot(d).audit.quarantinedRows).toBe(2);
});
it('histórico identifica correspondência válida única e não presume correção entre parcelas ambíguas',()=>{
 const previous=ds(),r=previous.auditRecords![0],current=validateBase([...HEADERS],[row('001',30,'2026-09-02')],'2026-10-16','corrigida.xlsx');expect(currentAuditStatus(r,current,previous)).toBe('Válido na versão atual');
 const ambiguous=validateBase([...HEADERS],[row('001',30,'2026-09-02'),row('001',30,'2026-09-02')],'2026-10-16','ambiguo.xlsx');expect(currentAuditStatus(r,ambiguous,previous)).toBe('Correspondência não confirmada');expect(previous.auditRecords![0].severity).toBe('error');
});
it('a classificação considera o registro inteiro e preserva motivos adicionais da mesma linha',()=>{
 const a=row('MISTO',10),b=row('MISTO',20);b[2]='2026-09-02';b[3]='Urgência';const d=validateBase([...HEADERS],[a,b,row('VALIDO',30)],'2026-10-16','misto.xlsx');
 expect(filteredAuditRows(d,'','error',{code:'conflicting_type'})).toHaveLength(2);expect(filteredAuditRows(d,'','warning')).toHaveLength(0);
});
it('a projeção pública remove propriedades extras e protege identificadores e notas com valor zero',()=>{
 const zero=row('0',30,'2026-08-01');zero[1]=0;zero[12]=0;const d=validateBase([...HEADERS],[zero,row('VALIDO',10)],'2026-10-16','zero.xlsx');Object.assign(d.auditRecords![0],{patient:'PACIENTE EXTRA',rawPatient:'PACIENTE EXTRA'});d.auditRecords![0].cells[9]='PACIENTE EXTRA';
 const shared=publicDataset(d,false);expect(shared.auditRecords![0].cells[1]).toMatch(/^Agendamento /);expect(shared.auditRecords![0].cells[12]).toMatch(/^Nota /);expect(JSON.stringify(shared)).not.toContain('PACIENTE EXTRA');
});
