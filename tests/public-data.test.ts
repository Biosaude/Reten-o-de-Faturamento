import {it,expect} from 'vitest';
import {HEADERS,validateBase,buildView,defaultFilters} from '../src/lib/domain';
import {publicDataset} from '../server/public-data';
const ds=validateBase([...HEADERS],[['EMPRESA','ORIGINAL-123','2026-01-01','Eletiva','Cliente','SP','Hospital','SP','MEDICO ORIGINAL','PACIENTE ORIGINAL','REPRESENTANTE ORIGINAL','2026-05-01','NOTA ORIGINAL',100],['EMPRESA','ORIGINAL-123','2026-01-01','Eletiva','Cliente','SP','Hospital','SP','MEDICO ORIGINAL','PACIENTE ORIGINAL','REPRESENTANTE ORIGINAL',null,null,200]],'2026-09-30','arquivo-interno.xlsx');
it('anonimiza identificadores e preserva integralmente os valores e o histórico',()=>{
 const projection=publicDataset(ds);const serialized=JSON.stringify(projection);
 for(const sensitive of ['ORIGINAL-123','MEDICO ORIGINAL','PACIENTE ORIGINAL','REPRESENTANTE ORIGINAL','NOTA ORIGINAL','arquivo-interno.xlsx'])expect(serialized).not.toContain(sensitive);
 expect(projection.records[0].key).toBe(projection.records[1].key);expect(projection.records[0].doctor).toBe(projection.records[1].doctor);
 const raw=buildView(ds,defaultFilters()),anon=buildView(projection,defaultFilters());expect(anon.summary).toEqual(raw.summary);expect(anon.monthly).toEqual(raw.monthly);expect(anon.quarterly).toEqual(raw.quarterly);expect(anon.flowCents).toBe(raw.flowCents);expect(anon.flowCount).toBe(raw.flowCount);
});
