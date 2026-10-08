import {readDataset} from '../server/store';
import {buildView,defaultFilters} from '../src/lib/domain';
import {writeFile} from 'node:fs/promises';
const ds=await readDataset(true);if(!ds)throw new Error('Execute seed:local antes da auditoria.');
const v=buildView(ds,defaultFilters());const result={asOf:ds.asOf,updatedAt:ds.updatedAt,audit:ds.audit,summary:v.summary,flowCents:v.flowCents,flowCount:v.flowCount,monthly:v.monthly,quarterly:v.quarterly,issuesByCode:ds.issues.reduce<Record<string,number>>((a,i)=>({...a,[i.code]:(a[i.code]??0)+1}),{})};
await writeFile('docs/auditoria-base.json',JSON.stringify(result,null,2));console.log(JSON.stringify({audit:ds.audit,summary:v.summary},null,2));
