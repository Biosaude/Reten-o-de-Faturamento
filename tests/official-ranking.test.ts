import {it,expect} from 'vitest';
import {readDataset} from '../server/store';
import {buildView,defaultFilters} from '../src/lib/domain';
import {executiveRanking} from '../src/lib/executive-ranking';
import expected from '../docs/validacao-ranking-independente.json';
it.runIf(process.env.VALIDATE_OFFICIAL_BASE==='1')('confere percentuais e médias ponderadas da base oficial com apuração independente',async()=>{
 const ds=await readDataset(true);expect(ds).not.toBeNull();const v=buildView(ds!,defaultFilters());const items=executiveRanking(v.surgeries,'customer',v.period.end,v.summary.pending);
 expect(v.summary.pending).toBe(expected.totalPendingCents);
 for(const sample of expected.examples){const item=items.find(i=>i.name===sample.customer)!;expect(item.cents).toBe(sample.pendingCents);expect(item.count).toBe(sample.count);expect(item.share).toBeCloseTo(sample.share,12);expect(item.weightedMean).toBeCloseTo(sample.weightedMean,10);}
});
