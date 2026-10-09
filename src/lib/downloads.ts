import {adminResponse,type AdminSession} from './api';
import {DIMENSIONS,fmtMoney,type Dataset,type Filters,type Dimension} from './domain';
import {reportRows} from './report-data';
function saveBlob(data:BlobPart,type:string,name:string){
 const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function downloadTemplate(session:AdminSession){
 const res=await adminResponse('/template',session);
 saveBlob(await res.arrayBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','modelo-retencao-faturamento.xlsx');
}
export async function downloadReport(format:'xlsx'|'pdf',ds:Dataset,f:Filters){
 const {v,details,summary}=reportRows(ds,f);
 if(format==='xlsx'){
  const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();
  const sheet=(name:string,rows:unknown[][])=>{const s=book.addWorksheet(name);rows.forEach(r=>s.addRow(r));s.getRow(1).font={bold:true};s.views=[{state:'frozen',ySplit:1}];s.columns.forEach(c=>c.width=25);return s;};
  sheet('Resumo',[['Indicador','Valor'],...summary]);
  sheet('Faixas',[['Faixa','Saldo (R$)','Cirurgias','Participação','Média em dias'],...v.summary.bands.map(b=>[b.label,b.cents/100,b.count,b.share,b.mean])]);
  const s=sheet('Agendamentos',[['Empresa','Agendamento','Data da cirurgia','Tipo','Cliente','UF cliente','Hospital','UF hospital','Médico','Representante','Total (R$)','Faturado (R$)','Pendente (R$)','Dias','Faixa','Situação'],...details]);for(const c of [11,12,13])s.getColumn(c).numFmt='"R$" #,##0.00';
  sheet('Registros',[['Empresa','Agendamento','Linha original','Data cirurgia','Data faturamento','Nota','Valor (R$)'],...v.surgeries.flatMap(s=>s.records.map(r=>[r.company,r.appointment,r.sourceRow,r.surgeryDate,r.billingDate??'',r.note,r.cents/100]))]);
  for(const dim of ['company','customer','hospital','representative','customerUF','hospitalUF','type'] as Dimension[])sheet(DIMENSIONS[dim].slice(0,31),[['Nome','Saldo (R$)','Cirurgias','Média'],...v.rankings[dim].map(r=>[r.name,r.cents/100,r.count,r.mean])]);
  sheet('Evolução mensal',[['Data','Parcial','Saldo (R$)','Cirurgias','Média'],...v.monthly.map(m=>[m.at,m.isPartial?'Sim':'Não',m.pending/100,m.count,m.mean])]);
  saveBlob(await book.xlsx.writeBuffer() as unknown as ArrayBuffer,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','retencao.xlsx');
 }else{
  const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);const doc=new jsPDF();
  doc.setFontSize(14);doc.text('BIOSAÚDE | RETENÇÃO DE FATURAMENTO',14,18);
  autoTable(doc,{startY:25,head:[['Indicador','Valor']],body:summary.map(r=>r.map(String)),styles:{fontSize:8},headStyles:{fillColor:[100,116,139]}});
  doc.addPage();autoTable(doc,{head:[['Faixa','Saldo','Cirurgias']],body:v.summary.bands.map(b=>[b.label,fmtMoney(b.cents),String(b.count)]),styles:{fontSize:8},headStyles:{fillColor:[100,116,139]}});
  for(const dim of ['company','customer','hospital','representative','customerUF','hospitalUF','type'] as Dimension[]){doc.addPage();autoTable(doc,{head:[[DIMENSIONS[dim],'Saldo retido','Cirurgias','Média']],body:v.rankings[dim].map(r=>[r.name,fmtMoney(r.cents),String(r.count),r.mean.toFixed(1)]),styles:{fontSize:8},headStyles:{fillColor:[100,116,139]}});}
  doc.addPage();autoTable(doc,{head:[['Empresa','Agendamento','Cirurgia','Situação','Total','Faturado','Pendente','Dias']],body:v.surgeries.map(s=>[s.company,s.appointment,s.surgeryDate,s.status,fmtMoney(s.total),fmtMoney(s.billed),fmtMoney(s.pending),s.band===null?'—':String(s.days)]),styles:{fontSize:6},headStyles:{fillColor:[100,116,139]}});
  doc.save('retencao.pdf');
 }
}
