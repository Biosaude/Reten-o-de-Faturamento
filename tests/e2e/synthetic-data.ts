import {HEADERS,validateBase} from '../../src/lib/domain';

// Deliberately small invented examples, not a reconstruction of an official base.
// At 30/09: pending=100+200+400=700, billed=50, 3 surgeries (1 partial).
// At 30/06: pending=100+200+50=350; >180 days at 30/09 contains only 100.
export const SYNTHETIC_PENDING='700,00';
export function syntheticDataset(){
 const row=(id:string,date:string,value:number,billing:string|null=null)=>['EMPRESA FICTÍCIA',id,date,'Eletiva','Cliente fictício','SP','Hospital fictício','SP','Médico fictício',null,'Representante fictício',billing,null,value];
 return validateBase([...HEADERS],[
  row('SINT-ANTIGA','2026-01-01',100),
  row('SINT-PARCIAL','2026-06-01',200),
  row('SINT-PARCIAL','2026-06-01',50,'2026-09-15'),
  row('SINT-RECENTE','2026-09-01',400),
 ],'2026-09-30','fixture-sintetica.csv');
}
