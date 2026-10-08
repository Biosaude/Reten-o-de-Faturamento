import assert from 'node:assert/strict';
import {buildView,defaultFilters,type Dataset} from '../src/lib/domain';
const base='http://127.0.0.1:3001';
assert.equal((await fetch(base+'/api/import',{method:'POST'})).status,401);
const res=await fetch(base+'/api/public/dataset');assert.equal(res.status,200);const dataset=await res.json() as Dataset|null;
assert(dataset,'Importe a base oficial: não há dataset no armazenamento local.');
const view=buildView(dataset,{...defaultFilters(),year:Number(dataset.asOf.slice(0,4))});assert.equal(view.summary.bands.reduce((a,b)=>a+b.cents,0),view.summary.pending);assert.equal(view.summary.bands.reduce((a,b)=>a+b.count,0),view.summary.count);
assert.equal(JSON.stringify(dataset).includes('"patient"'),false);
console.log(JSON.stringify({api:'ready',publicRead:'anonymized',sharedWrites:'protected',asOf:dataset.asOf,validRows:dataset.audit.validRows,pendingCents:view.summary.pending,pendingSurgeries:view.summary.count}));
