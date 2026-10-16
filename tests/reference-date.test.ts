import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {parseFile} from '../src/lib/import';
import {buildView,defaultFilters,validateBase,HEADERS,STATUSES,confirmedCutoff} from '../src/lib/domain';
import {publicDataset} from '../server/public-data';
const row=(id:string,amount:number,surgery='2025-12-01',billing:string|null=null)=>['A',id,surgery,'Eletiva','Cliente','SP','Hospital','SP','Médico',null,'Representante',billing,null,amount];
const dataset=()=>validateBase([...HEADERS],[row('PARCIAL',100,'2025-12-01','2026-10-10'),row('PARCIAL',200),row('PENDENTE',50,'2026-09-01'),row('FUTURA',25,'2026-10-12')],'2026-10-16','ficticia.xlsx');
it('abre no corte validado, nunca na última importação nem na maior data dos registros',()=>{
 const ds=dataset();ds.updatedAt='2026-10-16T23:59:00Z';ds.asOf='2026-10-09';
 const v=buildView(ds,defaultFilters());expect(v.period.end).toBe('2026-10-09');expect(v.summary.pending).toBe(35000);
});
it('acompanha o corte e o ano de uma nova versão sem fixar 2026 e preserva dimensões',()=>{
 const ds=dataset(),f={...defaultFilters(),company:['A']};
 expect(buildView({...ds,asOf:'2025-12-31'},f).period).toMatchObject({end:'2025-12-31',year:2025});
 expect(buildView(ds,f).period).toMatchObject({end:'2026-10-16',year:2026});expect(f.company).toEqual(['A']);
});
it('ano isolado fecha em 31/12 para anos passados e limita o ano atual ao corte',()=>{
 const ds=dataset();expect(buildView(ds,{...defaultFilters(),year:2025}).period.end).toBe('2025-12-31');expect(buildView(ds,{...defaultFilters(),year:2026}).period.end).toBe('2026-10-16');expect(buildView(ds,{...defaultFilters(),year:2027}).period.end).toBeNull();
});
it('data específica reconstrói parcelas e limita também o histórico e o fluxo',()=>{
 const ds=dataset(),old=buildView(ds,{...defaultFilters(),referenceDate:'2026-10-09'}),now=buildView(ds,defaultFilters());
 expect(old.summary.pending).toBe(35000);expect(old.summary.partial).toBe(0);expect(now.summary.pending).toBe(27500);expect(now.summary.partial).toBe(1);
 expect(old.flowCents).toBe(0);expect(now.flowCents).toBe(10000);expect(old.monthly.at(-1)?.at).toBe('2026-10-09');expect(old.quarterly.at(-1)?.at).toBe('2026-10-09');
 expect(buildView(ds,{...defaultFilters(),referenceDate:'2026-10-09',statuses:[STATUSES[0]]}).summary.pending).toBe(35000);
});
it('mês, quarter e interseção preservam estoque no último fechamento, sem somar saldos',()=>{
 const ds=dataset(),month=buildView(ds,{...defaultFilters(),year:2026,months:[8]}),quarter=buildView(ds,{...defaultFilters(),year:2026,quarters:[3]});
 expect(month.period.end).toBe('2026-08-31');expect(month.quarterly.at(-1)?.at).toBe('2026-08-31');expect(quarter.period.end).toBe('2026-09-30');
 const many=buildView(ds,{...defaultFilters(),months:[8,9],quarters:[3]});expect(many.summary.pending).toBe(quarter.summary.pending);expect(many.period.months).toEqual([8,9]);
});
it('sem corte confiável não inventa fechamento; data específica fora do corte é recusada',()=>{
 const ds=dataset();for(const asOf of ['','2026-02-31','16/10/2026']){expect(confirmedCutoff(asOf)).toBeNull();expect(buildView({...ds,asOf},defaultFilters()).period.end).toBeNull();}
 expect(buildView(ds,{...defaultFilters(),referenceDate:'2026-10-17'}).period.end).toBeNull();expect(buildView(ds,{...defaultFilters(),referenceDate:'2026-02-31'}).period.end).toBeNull();
});
it('projeção pública e administrativa usam o mesmo corte e a mesma reconstrução',()=>{
 const ds=dataset();for(const filters of [defaultFilters(),{...defaultFilters(),referenceDate:'2026-10-09'},{...defaultFilters(),year:2025}]){
  const admin=buildView(ds,filters),shared=buildView(publicDataset(ds),filters);expect(shared.summary).toEqual(admin.summary);expect(shared.period).toEqual(admin.period);expect(shared.rankings).toEqual(admin.rankings);
 }
});
it.runIf(!!process.env.OFFICIAL_RECONCILIATION_PATH)('mantém os saldos conciliados do PR #8 por data, mês e quarter na mesma planilha',async()=>{
 const file=process.env.OFFICIAL_RECONCILIATION_PATH!;const {dataset:ds}=await parseFile(new File([await readFile(file)],'geral.xlsx'),'2026-10-16');
 const cases:[ReturnType<typeof defaultFilters>,string,number][]=[
  [defaultFilters(),'2026-10-16',1240737081],
  [{...defaultFilters(),referenceDate:'2026-10-09'},'2026-10-09',1527993418],
  [{...defaultFilters(),year:2026,months:[9]},'2026-09-30',1417234277],
  [{...defaultFilters(),year:2026,months:[8]},'2026-08-31',1386591199],
  [{...defaultFilters(),year:2026,quarters:[2]},'2026-06-30',1187476767],
 ];
 for(const [filters,reference,pending] of cases){const v=buildView(ds,filters),shared=buildView(publicDataset(ds),filters);expect(v.period.end).toBe(reference);expect(v.summary.pending).toBe(pending);expect(v.summary.bands.reduce((s,b)=>s+b.cents,0)).toBe(pending);expect(shared.summary).toEqual(v.summary);}
},120000);
