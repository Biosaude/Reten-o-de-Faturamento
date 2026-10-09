import {createHmac,randomBytes} from 'node:crypto';
import {normalizeAudit} from '../src/lib/audit.js';
import type {Dataset} from '../src/lib/domain.js';
const salt=randomBytes(32);
// Only B/I/K can be released by the server publication policy. Invoices remain protected.
// Patients are never part of validated records; use an allowlist here as defense in depth.
export function publicDataset(source:Dataset,publishIdentifiers=true):Dataset{
 const ds=normalizeAudit(source);
 const pseudonym=(prefix:string,value:string)=>value==='Não informado'?value:`${prefix} ${createHmac('sha256',salt).update(prefix+'\0'+value).digest('hex').slice(0,16)}`;
 const keys=new Map<string,string>();
 const records=ds.records.map(r=>{
  const appointment=publishIdentifiers?r.appointment:pseudonym('Agendamento',r.key);
  const key=JSON.stringify([r.company,appointment]);keys.set(r.key,key);
  return {id:r.id,sourceRow:r.sourceRow,company:r.company,key,appointment,surgeryDate:r.surgeryDate,type:r.type,customer:r.customer,customerUF:r.customerUF,hospital:r.hospital,hospitalUF:r.hospitalUF,doctor:publishIdentifiers?r.doctor:pseudonym('Médico',r.doctor),representative:publishIdentifiers?r.representative:pseudonym('Representante',r.representative),billingDate:r.billingDate,note:r.note?pseudonym('Nota',r.note):'',cents:r.cents};
 });
 return {id:ds.id,asOf:ds.asOf,updatedAt:ds.updatedAt,audit:ds.audit,fileName:'Base compartilhada.xlsx',records,issues:ds.issues.map(({key,appointment,row,code,severity,message})=>{
  const label=publishIdentifiers?(appointment??''):(key?pseudonym('Agendamento',key):'');
  return {row,code,severity,message,appointment:label,...(key&&keys.has(key)?{key:keys.get(key)}:{})};
 })};
}
