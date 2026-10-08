import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { fmtMoney,fmtNumber,DIMENSIONS,type Dataset,type Filters,type Dimension } from '../src/lib/domain';
import {reportRows} from '../src/lib/report-data';
export {reportRows} from '../src/lib/report-data';
export async function excelReport(ds:Dataset,f:Filters){
 const {v,details,summary}=reportRows(ds,f);const book=new ExcelJS.Workbook();book.creator='Biosaúde — Retenção';
 const sheet=(name:string,rows:unknown[][])=>{const s=book.addWorksheet(name);rows.forEach(r=>s.addRow(r));s.getRow(1).font={bold:true,color:{argb:'FFB91C1C'}};s.views=[{state:'frozen',ySplit:1}];s.columns.forEach(c=>c.width=24);return s;};
 sheet('Resumo',[['Indicador','Valor'],...summary]);
 sheet('Faixas',[['Faixa','Saldo (R$)','Cirurgias','Participação','Média em dias'],...v.summary.bands.map(b=>[b.label,b.cents/100,b.count,b.share,b.mean])]);
 const d=sheet('Agendamentos',[['Empresa','Agendamento','Data da cirurgia','Tipo','Cliente','UF cliente','Hospital','UF hospital','Médico','Representante','Total (R$)','Faturado até fechamento (R$)','Pendente (R$)','Dias','Faixa','Situação'],...details]);for(const c of [11,12,13])d.getColumn(c).numFmt='"R$" #,##0.00';
 sheet('Registros',[['Empresa','Agendamento','Linha original','Data da cirurgia','Data faturamento','Nota','Valor (R$)'],...v.surgeries.flatMap(s=>s.records.map(r=>[r.company,r.appointment,r.sourceRow,r.surgeryDate,r.billingDate??'',r.note,r.cents/100]))]);
 for(const dim of ['company','customer','hospital','representative','customerUF','hospitalUF','type'] as Dimension[])sheet(DIMENSIONS[dim].slice(0,31),[['Nome','Saldo (R$)','Cirurgias','Média em dias'],...v.rankings[dim].map(r=>[r.name,r.cents/100,r.count,r.mean])]);
 sheet('Evolução mensal',[['Data','Parcial','Saldo (R$)','Cirurgias','Média'],...v.monthly.map(m=>[m.at,m.isPartial?'Sim':'Não',m.pending/100,m.count,m.mean])]);
 return Buffer.from(await book.xlsx.writeBuffer());
}
export async function pdfReport(ds:Dataset,f:Filters):Promise<Buffer>{
 const {v,summary}=reportRows(ds,f);const doc=new PDFDocument({size:'A4',margin:36,bufferPages:true});const chunks:Buffer[]=[];
 const complete=new Promise<Buffer>((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const line=(text:string,size=9)=>{if(doc.y>740)doc.addPage();doc.fontSize(size).fillColor('#263238').text(text,{width:523});doc.moveDown(.35);};
 line('BIOSAÚDE | RETENÇÃO DE FATURAMENTO',16);line('Relatório executivo — acesso restrito',11);
 for(const [name,value] of summary)line(`${name}: ${String(value)}`);
 line('Distribuição por faixa',12);for(const b of v.summary.bands)line(`${b.label} | ${fmtMoney(b.cents)} | ${b.count} cirurgias | ${fmtNumber(b.share*100,1)}% | ${fmtNumber(b.mean,1)} dias`);
 for(const dim of ['company','customer','hospital','representative','customerUF','hospitalUF','type'] as Dimension[]){line(`Ranking — ${DIMENSIONS[dim]}`,12);for(const r of v.rankings[dim])line(`${r.name} | ${fmtMoney(r.cents)} | ${r.count} cirurgias | ${fmtNumber(r.mean,1)} dias`);}
 line('Detalhamento dos agendamentos',12);for(const s of v.surgeries)line(`${s.company} • ${s.appointment} • ${s.surgeryDate} • ${s.status}\n${s.customer} / ${s.hospital} / ${s.representative}\nTotal ${fmtMoney(s.total)} | faturado ${fmtMoney(s.billed)} | pendente ${fmtMoney(s.pending)} | ${s.band!==null?`${s.days} dias — ${v.summary.bands[s.band].label}`:'Sem pendência'}`);
 const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.fontSize(8).text(`Confidencial • ${i+1}/${range.count}`,36,790,{lineBreak:false});}
 doc.end();return complete;
}
