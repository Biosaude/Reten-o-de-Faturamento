import {describe,it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import {excelReport,pdfReport,reportRows} from '../server/reports';
import {HEADERS,validateBase,defaultFilters,buildView} from '../src/lib/domain';
const ds=validateBase([...HEADERS],[['EMPRESA','123','2026-01-01','Eletiva','Cliente','SP','Hospital','SP','Médico','SIGILO PACIENTE','Rep',null,'123',123.45]],'2026-09-30','base.xlsx');
describe('Exportações consistentes',()=>{
 it('Excel contém resumo e detalhamento com os mesmos centavos do dashboard',async()=>{const f=defaultFilters(),buffer=await excelReport(ds,f);const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer as unknown as ArrayBuffer);expect(wb.getWorksheet('Resumo')?.getCell('B6').value).toBe(buildView(ds,f).summary.pending/100);expect(wb.getWorksheet('Agendamentos')?.getCell('M2').value).toBe(123.45);expect(JSON.stringify(reportRows(ds,f))).not.toContain('SIGILO PACIENTE');});
 it('PDF é gerado e respeita filtros sem pacientes',async()=>{const f={...defaultFilters(),company:['Outra']};expect(reportRows(ds,f).details).toHaveLength(0);const pdf=await pdfReport(ds,f);expect(pdf.subarray(0,4).toString()).toBe('%PDF');expect(pdf.length).toBeGreaterThan(1000);});
});
