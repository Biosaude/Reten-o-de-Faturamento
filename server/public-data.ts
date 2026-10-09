import {createHmac,randomBytes} from 'node:crypto';
import type {Dataset} from '../src/lib/domain.js';
const salt=randomBytes(32);
// Public projections never expose the original appointment, physician, representative, or invoice.
// Salt stays on the server; dictionary attacks cannot recover these original values from the labels.
export function publicDataset(ds:Dataset):Dataset{
 const pseudonym=(prefix:string,value:string)=>value==='Não informado'?value:`${prefix} ${createHmac('sha256',salt).update(prefix+'\0'+value).digest('hex').slice(0,16)}`;
 const keys=new Map<string,string>();
 const records=ds.records.map(r=>{const appointment=pseudonym('Agendamento',r.key);const key=JSON.stringify([r.company,appointment]);keys.set(r.key,key);return {...r,key,appointment,doctor:pseudonym('Médico',r.doctor),representative:pseudonym('Representante',r.representative),note:r.note?pseudonym('Nota',r.note):''};});
 return {...ds,fileName:'Base compartilhada.xlsx',records,issues:ds.issues.map(({key,...i})=>({...i,...(key&&keys.has(key)?{key:keys.get(key)}:{})}))};
}
