import {test,expect} from './fixtures';
import {COST_HEADERS} from '../../src/lib/domain';

test('publica e recarrega lote sintético de 18.031 linhas com o mesmo contrato JSON',async({page})=>{
 test.setTimeout(90000);const check=expect.configure({timeout:20000});
 await page.goto('/');await page.getByRole('button',{name:'Acesso administrativo'}).click();await page.getByRole('button',{name:'Entrar no ambiente local'}).click();
 await page.getByLabel('Base compartilhada (Supabase)').check();
 const rows=Array.from({length:18031},(_,i)=>['FICTÍCIA','SINT-'+i,'2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico',null,'Rep',i<499?'2026-08-31':null,null,30,100]);
 const csv=[COST_HEADERS,...rows].map(r=>r.map(v=>v??'').join(';')).join('\n');
 await page.getByLabel('Selecionar planilha da base').setInputFiles({name:'synthetic-large.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await check(page.getByRole('status')).toContainText('Arquivo validado');
 await page.getByLabel(/Confirmo a substituição/).check();
 const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/import'&&r.request().method()==='POST');
 await page.getByRole('button',{name:/Salvar Base Compartilhada/}).click();
 const response=await result;expect(response.status()).toBe(200);expect(response.headers()['content-encoding']).toBe('gzip');expect(Number(response.headers()['content-length'])).toBeLessThan(4_500_000);
 const imported=await response.json();expect(imported.records).toHaveLength(17532);
 await check(page.getByRole('status')).toContainText('Base compartilhada salva');
 await check(page.locator('.kpi').first()).toContainText('1.753.200,00');await check(page.getByTestId('retained-cost')).toContainText('525.960,00');
 await page.reload();await check(page.locator('.kpi').first()).toContainText('1.753.200,00');await check(page.getByTestId('retained-cost')).toContainText('525.960,00');
 // Fetch inside Chromium verifies transparent decoding and the complete persisted payload.
 const reloaded=await page.evaluate(async()=>{const r=await fetch('/api/dataset');if(!r.ok)throw new Error('Dataset indisponível');return r.json();});
 expect(reloaded.records).toEqual(imported.records);expect(reloaded.auditRecords).toEqual(imported.auditRecords);expect(reloaded.audit).toEqual(imported.audit);
});
