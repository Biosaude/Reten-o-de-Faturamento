import type {Issue} from './domain.js';
import {severityLabel} from './audit.js';
export async function auditWorkbook(issues:Issue[]){
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Ocorrências');
 sheet.addRow(['Linha','Agendamento','Severidade','Ocorrência']);
 issues.filter(i=>i.code!=='note_without_date').forEach(i=>sheet.addRow([i.row,i.appointment??'',severityLabel(i.severity),i.message]));
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF64748B'}};
 sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:sheet.rowCount,column:4}};
 [12,30,18,85].forEach((width,i)=>sheet.getColumn(i+1).width=width);sheet.getColumn(4).alignment={wrapText:true,vertical:'top'};
 return book.xlsx.writeBuffer();
}
export async function downloadAudit(issues:Issue[],asOf:string){
 const data=await auditWorkbook(issues),url=URL.createObjectURL(new Blob([data as unknown as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');
 link.href=url;link.download=`Auditoria_Retencao_Faturamento_${asOf}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
