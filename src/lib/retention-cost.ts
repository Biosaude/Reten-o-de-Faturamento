import type {FinancialRecord,Surgery} from './domain.js';

export function validCost(value:unknown):value is number {
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
}

// A record is either wholly billed or wholly pending at the reference date.
// Partial billing exists at surgery level: never allocate a surgery's cost again.
export function costOfRecords(records:FinancialRecord[],available=false){
 const covered=records.filter(r=>validCost(r.costCents));
 const sum=covered.reduce((total,r)=>total+r.costCents!,0);
 if(!Number.isSafeInteger(sum))throw new Error('Limite de precisão do custo excedido.');
 const pending=records.reduce((total,r)=>total+r.cents,0);
 const cents=covered.length?sum:records.length===0&&available?0:null;
 return {cents,coveredRows:covered.length,eligibleRows:records.length,
  coverage:records.length?covered.length/records.length:null,
  coveredPendingCents:covered.reduce((total,r)=>total+r.cents,0),
  percent:cents!==null&&pending>0&&covered.length===records.length?cents/pending:null};
}

export function retainedCost(surgeries:Surgery[]){
 const pending=surgeries.flatMap(s=>{
  const at=new Date(Date.parse(s.surgeryDate+'T00:00:00Z')+s.days*86400000).toISOString().slice(0,10);
  return s.records.filter(r=>!r.billingDate||r.billingDate>at);
 });
 return costOfRecords(pending,surgeries.some(s=>s.records.some(r=>r.costCents!==undefined)));
}
