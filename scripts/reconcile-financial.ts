import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {basename,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {parseFile} from '../src/lib/import';
import {buildView,defaultFilters,STATUSES,DIMENSIONS,type Dimension} from '../src/lib/domain';
import {executiveRanking} from '../src/lib/executive-ranking';
import {publicDataset} from '../server/public-data';
const [file,asOf,output,...historical]=process.argv.slice(2);
if(!file||!asOf||!output||!/\.xlsx$/i.test(file))throw new Error('Uso: node --import tsx scripts/reconcile-financial.ts arquivo.xlsx AAAA-MM-DD diretorio-privado [referencias AAAA-MM-DD ...]');
const sharedIndex=historical.indexOf('--shared');
const sharedFile=sharedIndex>=0?historical[sharedIndex+1]:undefined;
if(sharedIndex>=0&&(sharedIndex!==historical.length-2||!sharedFile))throw new Error('Use --shared snapshot.json no final dos argumentos.');
const references=[...new Set([...(sharedIndex>=0?historical.slice(0,sharedIndex):historical),asOf])].sort();
if(references.some(at=>!/^\d{4}-\d{2}-\d{2}$/.test(at)||at>asOf))throw new Error('Referências devem ser datas ISO até o corte explicitamente informado.');
const out=resolve(output);await mkdir(out,{recursive:true,mode:0o700});
const {dataset:ds}=await parseFile(new File([await readFile(file)],basename(file)),asOf);
const positions=[];
for(const at of references){
 const base={...ds,asOf:at};
 const byStatus=Object.fromEntries([[],...STATUSES.map(s=>[s])].map(statuses=>{
  const v=buildView(base,{...defaultFilters(),year:Number(at.slice(0,4)),statuses});
  return [statuses[0]??'all',{reference:v.period.end,summary:v.summary,total:v.surgeries.reduce((s,r)=>s+r.total,0),billed:v.surgeries.reduce((s,r)=>s+r.billed,0),surgeries:v.surgeries.length,financialRows:v.surgeries.reduce((s,r)=>s+r.records.length,0),flowCents:v.flowCents,flowCount:v.flowCount}];
 }));
 const filters={...defaultFilters(),year:Number(at.slice(0,4))};
 const raw=buildView(base,filters),shared=buildView(publicDataset(base),filters);
 const clean=(v:typeof raw)=>({...v,surgeries:v.surgeries.map(s=>({...s,records:s.records.map(({note,...r})=>r)}))});
 const equal=isDeepStrictEqual(clean(raw),clean(shared));
 positions.push({at,byStatus,monthly:raw.monthly,quarterly:raw.quarterly,rankings:Object.fromEntries(Object.keys(DIMENSIONS).map(d=>[d,executiveRanking(raw.surgeries,d as Dimension,raw.period.end,raw.summary.pending)])),publicFinancialViewEqual:equal});
}
const records=ds.records.map(({sourceRow,key,company,appointment,surgeryDate,billingDate,cents})=>({sourceRow,key,company,appointment,surgeryDate,billingDate,cents}));
await writeFile(resolve(out,'engine.json'),JSON.stringify({id:ds.id,asOf:ds.asOf,audit:ds.audit,issues:ds.issues.map(({row,code,severity})=>({row,code,severity})),records,positions}),{mode:0o600});
execFileSync('python3',[resolve(dirname(fileURLToPath(import.meta.url)),'reconcile_financial.py'),resolve(file),resolve(out,'engine.json'),out,...(sharedFile?[resolve(sharedFile)]:[])],{stdio:'inherit'});
