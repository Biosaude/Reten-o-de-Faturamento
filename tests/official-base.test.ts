import {it,expect} from 'vitest';
import {readDataset} from '../server/store';
import {buildView,defaultFilters} from '../src/lib/domain';
import expected from '../docs/validacao-independente.json';
// The official spreadsheet is private. No patient or row-level data is stored in these fixtures.
it.runIf(process.env.VALIDATE_OFFICIAL_BASE==='1')('reconciles all 9 official monthly closings against independent Python/Decimal results',async()=>{
 const ds=await readDataset(true);expect(ds).not.toBeNull();const view=buildView(ds!,defaultFilters());expect(ds!.audit.totalCents).toBe(expected.totalCents);
 expect(view.monthly).toHaveLength(9);for(const m of expected.monthly){const actual=view.monthly.find(v=>v.at===m.at)!;expect(actual.pending).toBe(m.pending);expect(actual.count).toBe(m.count);expect(actual.bands.map(b=>b.cents)).toEqual(m.bands);expect(actual.bands.map(b=>b.count)).toEqual(m.bandCounts);}
});
