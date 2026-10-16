import type {Issue,FinancialRecord} from './domain.js';
export type AuditCell=string|number|null;
export type AuditRecord={sourceRow:number;cells:AuditCell[];columnCount:number;codes:string[];severity:Issue['severity'];source:'original'|'legacy_partial'};
const cell=(value:unknown):AuditCell=>value===null||value===undefined?null:value instanceof Date?(Number.isFinite(value.getTime())?value.toISOString():String(value)):typeof value==='number'||typeof value==='string'?value:String(value);
export function captureAuditRecords(input:unknown[][],issues:Issue[]):AuditRecord[]{
 const grouped=new Map<number,Issue[]>();for(const i of issues)if(i.code!=='note_without_date')grouped.set(i.row,[...(grouped.get(i.row)??[]),i]);
 return [...grouped].map(([sourceRow,items])=>{const raw=input[sourceRow-2]??[];return {sourceRow,cells:Array.from({length:14},(_,i)=>i===9?null:cell(raw[i])),columnCount:raw.length,codes:[...new Set(items.map(i=>i.code))],severity:items.some(i=>i.severity==='error')?'error':'warning',source:'original'};});
}
export function financialAuditCells(r:FinancialRecord):AuditCell[]{return [r.company,r.appointment,r.surgeryDate,r.type,r.customer,r.customerUF,r.hospital,r.hospitalUF,r.doctor,null,r.representative,r.billingDate,r.note,r.cents/100];}
