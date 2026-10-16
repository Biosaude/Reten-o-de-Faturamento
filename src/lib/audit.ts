import {moneyCents,normalizeDate,type Dataset,type Issue} from './domain.js';
import {financialAuditCells,type AuditRecord} from './audit-source.js';
function appointmentOf(issue:Issue,appointments:Map<number,string>){
 if(issue.appointment!==undefined)return issue.appointment;
 const original=appointments.get(issue.row);if(original!==undefined)return original;
 try{const key=JSON.parse(issue.key??'');return Array.isArray(key)&&typeof key[1]==='string'?key[1]:'';}catch{return '';}
}
// Adjust legacy stored audits on read; never rewrite financial records or the database.
export function normalizeAudit(ds:Dataset):Dataset{
 const appointments=new Map(ds.records.map(r=>[r.sourceRow,r.appointment]));
 const issues=ds.issues.filter(i=>i.code!=='note_without_date').map(i=>({...i,appointment:appointmentOf(i,appointments)}));
 const financial=new Map(ds.records.map(r=>[r.sourceRow,r]));
 const originals=new Map((ds.auditRecords??[]).map(r=>[r.sourceRow,r]));
 const auditRecords=[...new Set(issues.map(i=>i.row))].map(sourceRow=>{
  const rowIssues=issues.filter(i=>i.row===sourceRow),original=originals.get(sourceRow),record=financial.get(sourceRow);
  let company='';try{company=JSON.parse(rowIssues[0].key??'')[0]??'';}catch{}
  const cells=original?.cells??(record?financialAuditCells(record):[company,rowIssues[0].appointment??'',...Array(12).fill(null)]);
  return {sourceRow,cells:Array.from({length:14},(_,i)=>i===9?null:typeof cells[i]==='string'||typeof cells[i]==='number'?cells[i]:null),columnCount:original?.columnCount??14,codes:[...new Set(rowIssues.map(i=>i.code))],severity:rowIssues.some(i=>i.severity==='error')?'error' as const:'warning' as const,source:original?.source??'legacy_partial' as const};
 });
 return {...ds,issues,auditRecords,audit:{...ds.audit,notesWithoutDate:0,inconsistentRecords:new Set(issues.map(i=>i.row)).size,quarantinedRows:ds.audit.sourceRows-ds.audit.validRows}};
}
export type AuditSeverity='all'|'warning'|'error';
export const severityLabel=(severity:Issue['severity'])=>severity==='error'?'Quarentena':'Conferir';
export function auditRows(ds:Dataset,query='',severity:AuditSeverity='all'){
 const normalized=normalizeAudit(ds),needle=query.trim().toLocaleLowerCase('pt-BR');
 return normalized.issues.filter(i=>(severity==='all'||i.severity===severity)&&`${i.row} ${i.appointment} ${i.code} ${severityLabel(i.severity)} ${i.message}`.toLocaleLowerCase('pt-BR').includes(needle));
}
export function reviewCount(ds:Dataset){
 const issues=normalizeAudit(ds).issues,quarantine=new Set(issues.filter(i=>i.severity==='error').map(i=>i.row));
 return new Set(issues.filter(i=>i.severity==='warning'&&!quarantine.has(i.row)).map(i=>i.row)).size;
}

export type AuditFilters={company?:string;code?:string;from?:string;to?:string};
export const auditCompany=(r:AuditRecord)=>String(r.cells[0]??'').trim().toUpperCase();
export function filteredAuditRows(ds:Dataset,query='',severity:AuditSeverity='all',filters:AuditFilters={}){
 const normalized=normalizeAudit(ds),records=new Map(normalized.auditRecords!.map(r=>[r.sourceRow,r]));
 return auditRows(normalized,query,'all').filter(i=>{
  const r=records.get(i.row)!;const date=normalizeDate(r.cells[2]);
  return (severity==='all'||r.severity===severity)&&(!filters.company||auditCompany(r)===filters.company)&&(!filters.code||i.code===filters.code)&&(!filters.from||date!==null&&date>=filters.from)&&(!filters.to||date!==null&&date<=filters.to);
 });
}
export function auditCategorySummary(ds:Dataset,issues:Issue[]){
 const records=new Map(normalizeAudit(ds).auditRecords!.map(r=>[r.sourceRow,r]));
 return [...new Set(issues.map(i=>i.code))].map(code=>{const rows=[...new Set(issues.filter(i=>i.code===code).map(i=>i.row))];return {code,count:rows.length,unknownAmounts:rows.filter(row=>moneyCents(records.get(row)?.cells[13])===null).length,cents:rows.reduce((sum,row)=>sum+(moneyCents(records.get(row)?.cells[13])??0),0),message:issues.find(i=>i.code===code)!.message};});
}
export function auditSnapshot(ds:Dataset):Dataset{
 const normalized=normalizeAudit(ds);return {id:ds.id,fileName:ds.fileName,asOf:ds.asOf,updatedAt:ds.updatedAt,audit:normalized.audit,issues:normalized.issues,auditRecords:normalized.auditRecords,records:[]};
}
export type AuditVersionInfo={id:string;asOf:string|null;updatedAt:string;fileName:string;audit:Dataset['audit'];available:boolean};
function signature(cells:(string|number|null)[]){
 const amount=moneyCents(cells[13]);if(!String(cells[0]??'').trim()||!String(cells[1]??'').trim()||amount===null)return null;
 return JSON.stringify([String(cells[0]).trim().toUpperCase(),...[1,3,4,5,6,7,8,10,12].map(i=>{const value=String(cells[i]??'').trim();return [5,7].includes(i)?value.toUpperCase()||'NÃO INFORMADO':[3,4,6,8,10].includes(i)?value||'Não informado':value;}),amount]);
}
export function currentAuditStatus(old:AuditRecord,current:Dataset,previous:Dataset){
 if(old.severity!=='error')return '';
 const key=signature(old.cells);if(!key)return 'Correspondência não confirmada';
 const historical=normalizeAudit(previous).auditRecords!.filter(r=>signature(r.cells)===key);
 const valid=current.records.filter(r=>signature(financialAuditCells(r))===key);
 const quarantined=normalizeAudit(current).auditRecords!.filter(r=>r.severity==='error'&&signature(r.cells)===key);
 if(historical.length!==1||valid.length+quarantined.length!==1)return 'Correspondência não confirmada';
 return valid.length?'Válido na versão atual':'Em quarentena na versão atual';
}
