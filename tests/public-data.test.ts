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

it('publica somente B/I/K autorizados, preservando chaves, zeros à esquerda e dados financeiros',()=>{
 const source=validateBase([...HEADERS],[['EMPRESA','002407','2026-01-01','Eletiva','Cliente','SP','Hospital','SP','MÉDICO AUTORIZADO','PACIENTE ORIGINAL','REPRESENTANTE AUTORIZADO',null,'NOTA ORIGINAL',100],['OUTRA EMPRESA','002407','2026-01-01','Eletiva','Cliente','SP','Hospital','SP','OUTRO MÉDICO',null,'OUTRO REPRESENTANTE',null,null,200],['EMPRESA','0011829','2026-01-01','Eletiva','Cliente','SP','Hospital','SP','MÉDICO AUTORIZADO',null,'REPRESENTANTE AUTORIZADO','2025-12-01',null,300]],'2026-09-30','arquivo-interno.xlsx');
 const projection=publicDataset(source,true);
 for(const [i,r] of source.records.entries()){
  expect(projection.records[i]).toMatchObject({company:r.company,appointment:r.appointment,doctor:r.doctor,representative:r.representative,key:r.key});
 }
 expect(projection.records[0].key).not.toBe(projection.records[1].key);
 expect(projection.issues[0].appointment).toBe('0011829');expect(projection.issues[0].key).toBeUndefined();
 const comparable={...projection,records:projection.records.map((r,i)=>({...r,note:source.records[i].note}))};
 expect(buildView(comparable,defaultFilters())).toEqual(buildView(source,defaultFilters()));
 for(const sensitive of ['PACIENTE ORIGINAL','NOTA ORIGINAL','arquivo-interno.xlsx'])expect(JSON.stringify(projection)).not.toContain(sensitive);
 expect(source.records[0].note).toBe('NOTA ORIGINAL');
});

it('não serializa campos pessoais extras de um payload legado mesmo com B/I/K liberados',()=>{
 const legacy=structuredClone(ds);Object.assign(legacy,{patient:'PACIENTE LEGADO',internalSecret:'SEGREDO INTERNO'});Object.assign(legacy.records[0],{patient:'PACIENTE LEGADO',internalSecret:'SEGREDO INTERNO'});
 const serialized=JSON.stringify(publicDataset(legacy,true));for(const value of ['PACIENTE LEGADO','SEGREDO INTERNO','NOTA ORIGINAL'])expect(serialized).not.toContain(value);
});
