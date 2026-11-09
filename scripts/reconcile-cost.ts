import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseFile} from '../src/lib/import';
import {buildView,defaultFilters,DIMENSIONS,HEADERS,columnOrder,validateBase,type Dimension,type Filters} from '../src/lib/domain';
import assert from 'node:assert/strict';

const [file,asOf,out='.local/cost-validation']=process.argv.slice(2);
if(!file||!asOf)throw new Error('Uso: npx tsx scripts/reconcile-cost.ts arquivo.xlsx AAAA-MM-DD [diretório privado]');
const dir=resolve(out);await mkdir(dir,{recursive:true,mode:0o700});
const parsed=await parseFile(new File([new Uint8Array(await readFile(file))],'cost-validation.xlsx'),asOf);
const ds=parsed.dataset;
const references=[...new Set([asOf,'2026-10-16','2026-09-30'].filter(at=>at<=asOf))];
const filters:Filters[]=references.map(referenceDate=>({...defaultFilters(),referenceDate}));
const pending=ds.records.find(r=>r.surgeryDate<=asOf&&(!r.billingDate||r.billingDate>asOf));
if(pending)for(const dim of Object.keys(DIMENSIONS) as Dimension[])filters.push({...defaultFilters(),[dim]:[pending[dim]]});
for(const status of ['Totalmente pendente','Parcialmente faturada'] as const)filters.push({...defaultFilters(),statuses:[status]});
for(const band of [0,1,2,3,4])filters.push({...defaultFilters(),bands:[band]});
const checks=filters.map(f=>{const v=buildView(ds,f);return {filters:f,at:v.period.end,result:{pendingCents:v.summary.pending,costCents:v.summary.cost.cents,eligibleRows:v.summary.cost.eligibleRows,coveredRows:v.summary.cost.coveredRows}};});
// Independent legacy projection also proves O continues driving all financial totals.
const order=columnOrder(parsed.headers).slice(0,HEADERS.length);
const legacy=validateBase([...HEADERS],parsed.rows.map(row=>order.map(index=>row[index])),asOf,'legacy-projection.xlsx');
for(const f of filters){
 const a=buildView(ds,f),b=buildView(legacy,f);
 assert.deepEqual({pending:a.summary.pending,count:a.summary.count,mean:a.summary.mean,partial:a.summary.partial,flow:a.flowCents,flowCount:a.flowCount,bands:a.summary.bands.map(b=>b.cents),movements:a.movements,rankings:a.rankings},
 {pending:b.summary.pending,count:b.summary.count,mean:b.summary.mean,partial:b.summary.partial,flow:b.flowCents,flowCount:b.flowCount,bands:b.summary.bands.map(b=>b.cents),movements:b.movements,rankings:b.rankings});
}
const engine=resolve(dir,'engine.json');await writeFile(engine,JSON.stringify({dataset:ds,checks}),{mode:0o600});
const result=spawnSync('python3',['scripts/reconcile_cost.py',resolve(file),engine],{encoding:'utf8',maxBuffer:1024*1024});
if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status??1);}
await writeFile(resolve(dir,'reconciliation.json'),result.stdout,{mode:0o600});process.stdout.write(result.stdout);
