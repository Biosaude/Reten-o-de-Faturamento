import {test,expect} from './fixtures';
import {COST_HEADERS,HEADERS} from '../../src/lib/domain';

test('publica planilha de 15 colunas, mantém custo após recarga e consulta versão legada sem custo',async({page,request})=>{
 const base=['CUSTO TESTE','CUSTO-LEGADO','2026-09-01','Eletiva','Cliente Custo','SP','Hospital Custo','SP','Médico',null,'Representante',null,null];
 await request.post('/api/auth/local');
 const current=await (await request.get('/api/public/dataset')).json();
 const legacyResponse=await request.post('/api/import',{data:{headers:HEADERS,rows:[[...base,100]],fileName:'legada-custo.csv',expectedId:current?.id??null,confirmed:true}});
 expect(legacyResponse.status()).toBe(200);const legacy=await legacyResponse.json();
 await page.goto('/');await expect(page.getByTestId('retained-cost')).toHaveText('Indisponível');
 await page.getByRole('button',{name:'Acesso administrativo'}).click();await page.getByRole('button',{name:'Entrar no ambiente local'}).click();
 await page.getByLabel('Base compartilhada (Supabase)').check();
 const other=[...base];other[1]='OUTRA CIRURGIA';other[4]='Outro cliente';
 const billed=[...base];billed[11]='2026-10-01';
 const rows=[[...base,30,100],[...billed,80,200],[...other,20,50]];
 const csv=[COST_HEADERS,...rows].map(r=>r.map(v=>v??'').join(';')).join('\n');
 await page.getByLabel('Selecionar planilha da base').setInputFiles({name:'custos.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await expect(page.getByRole('status')).toContainText('Arquivo validado');
 await page.getByLabel(/Confirmo a substituição/).check();await page.getByRole('button',{name:/Salvar Base Compartilhada/}).click();
 await expect(page.getByRole('status')).toContainText('Base compartilhada salva');
 await expect(page.getByTestId('retained-cost')).toContainText('50,00');await expect(page.getByTestId('retained-cost-coverage')).toHaveText('2 de 2 · 100%');
 await expect(page.locator('.kpi').first()).toContainText('150,00');
 await page.reload();await expect(page.getByTestId('retained-cost')).toContainText('50,00');
 await page.getByLabel('Cliente de Faturamento',{exact:true}).click();await page.getByText('Cliente Custo',{exact:true}).first().click();await page.getByLabel('Cliente de Faturamento',{exact:true}).click();
 await expect(page.getByTestId('retained-cost')).toContainText('30,00');await expect(page.locator('.kpi').first()).toContainText('100,00');
 await page.getByRole('button',{name:'Limpar filtros'}).click();
 await page.getByLabel('Versão financeira',{exact:true}).selectOption(legacy.id);await expect(page.getByTestId('retained-cost')).toHaveText('Indisponível');
 await page.getByRole('button',{name:'Posição atual',exact:true}).click();await expect(page.getByTestId('retained-cost')).toContainText('50,00');
 for(const width of [1920,1024,390]){await page.setViewportSize({width,height:1080});await expect(page.getByTestId('retained-cost')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.setViewportSize({width:1920,height:1080});await page.locator('.cost-indicator').screenshot({path:'.local/screenshots/retention-cost.png'});
});
