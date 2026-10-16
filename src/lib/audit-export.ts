import {moneyCents,type Issue,type Dataset} from './domain.js';
import {severityLabel,normalizeAudit} from './audit.js';
export async function auditWorkbook(issues:Issue[],dataset?:Dataset){
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Ocorrências');
 const filtered=issues.filter(i=>i.code!=='note_without_date');
 sheet.addRow(['Linha','Agendamento','Severidade','Ocorrência']);
 filtered.forEach(i=>sheet.addRow([i.row,i.appointment??'',severityLabel(i.severity),i.message]));
 const style=(s:typeof sheet,widths:number[])=>{s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF64748B'}};s.views=[{state:'frozen',ySplit:1}];s.autoFilter={from:{row:1,column:1},to:{row:s.rowCount,column:widths.length}};widths.forEach((width,i)=>s.getColumn(i+1).width=width);};
 style(sheet,[12,30,18,85]);sheet.getColumn(4).alignment={wrapText:true,vertical:'top'};
 if(dataset){
  const ds=normalizeAudit(dataset),included=new Set(filtered.map(i=>i.row)),details=book.addWorksheet('Registros');
  details.addRow(['Versão','Corte financeiro','Atualização','Linha original','Empresa','Agendamento','Data da cirurgia','Tipo da cirurgia','Cliente de faturamento','UF cliente','Hospital','UF hospital','Médico','Representante principal','Data de faturamento','Nota de cobrança','Valor total','Classificação','Motivos','Origem dos detalhes']);
  for(const r of ds.auditRecords!.filter(r=>included.has(r.sourceRow))){const c=r.cells;details.addRow([ds.id,ds.asOf,ds.updatedAt,r.sourceRow,...[0,1,2,3,4,5,6,7,8,10,11,12].map(i=>c[i]??''),moneyCents(c[13])===null?c[13]:moneyCents(c[13])!/100,severityLabel(r.severity),filtered.filter(i=>i.row===r.sourceRow).map(i=>i.message).join(' | '),r.source==='original'?'Original sem paciente':'Legado: campos disponíveis']);}
  style(details,[38,18,26,14,28,24,22,30,34,12,34,12,28,28,22,24,20,18,85,30]);details.getColumn(17).numFmt='"R$" #,##0.00';details.getColumn(19).alignment={wrapText:true,vertical:'top'};
 }
 return book.xlsx.writeBuffer();
}
export async function downloadAudit(issues:Issue[],asOf:string,dataset?:Dataset){
 const data=await auditWorkbook(issues,dataset),url=URL.createObjectURL(new Blob([data as unknown as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');
 link.href=url;link.download=`Auditoria_Retencao_Faturamento_${asOf}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
