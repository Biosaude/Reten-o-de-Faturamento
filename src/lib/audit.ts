import type {Dataset,Issue} from './domain.js';
function appointmentOf(issue:Issue,appointments:Map<number,string>){
 if(issue.appointment!==undefined)return issue.appointment;
 const original=appointments.get(issue.row);if(original!==undefined)return original;
 try{const key=JSON.parse(issue.key??'');return Array.isArray(key)&&typeof key[1]==='string'?key[1]:'';}catch{return '';}
}
// Adjust legacy stored audits on read; never rewrite financial records or the database.
export function normalizeAudit(ds:Dataset):Dataset{
 const appointments=new Map(ds.records.map(r=>[r.sourceRow,r.appointment]));
 const issues=ds.issues.filter(i=>i.code!=='note_without_date').map(i=>({...i,appointment:appointmentOf(i,appointments)}));
 return {...ds,issues,audit:{...ds.audit,notesWithoutDate:0,inconsistentRecords:new Set(issues.map(i=>i.row)).size,quarantinedRows:ds.audit.sourceRows-ds.records.length}};
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
