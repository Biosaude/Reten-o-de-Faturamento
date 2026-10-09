import {isDeepStrictEqual} from 'node:util';
import {it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import {readDataset} from '../server/store';
import {keyOf,buildView,defaultFilters} from '../src/lib/domain';
import {publicDataset} from '../server/public-data';
import {normalizeAudit} from '../src/lib/audit';
it.runIf(!!process.env.OFFICIAL_BASE_PATH)('confere B/I/K de uma amostra oficial e mantém indicadores após recalcular auditoria',async()=>{
 const book=new ExcelJS.Workbook();await book.xlsx.readFile(process.env.OFFICIAL_BASE_PATH!);const ds=(await readDataset(true))!;
 expect(ds).not.toBeNull();
 const shared=publicDataset(ds,true);
 const sample=[...ds.records.slice(0,20),...ds.records.slice(-20)];
 for(const r of sample){const source=book.worksheets[0].getRow(r.sourceRow);
  // Only booleans enter assertion output: never print original personal identifiers.
  expect(r.company===String(source.getCell(1).value??'').trim().toUpperCase()).toBe(true);
  expect(r.appointment===String(source.getCell(2).value??'').trim()).toBe(true);
  expect(r.doctor===(String(source.getCell(9).value??'').trim()||'Não informado')).toBe(true);
  expect(r.representative===(String(source.getCell(11).value??'').trim()||'Não informado')).toBe(true);
  expect(r.key===keyOf(r.company,r.appointment)).toBe(true);
  const published=shared.records.find(record=>record.id===r.id)!;
  expect(['company','appointment','doctor','representative','key'].every(field=>published[field as keyof typeof published]===r[field as keyof typeof r])).toBe(true);
 }
 const comparable={...shared,records:shared.records.map((r,i)=>({...r,note:ds.records[i].note}))};
 expect(isDeepStrictEqual(buildView(comparable,defaultFilters()),buildView(ds,defaultFilters()))).toBe(true);
 expect(JSON.stringify(buildView(normalizeAudit(ds),defaultFilters()))===JSON.stringify(buildView(ds,defaultFilters()))).toBe(true);
});
