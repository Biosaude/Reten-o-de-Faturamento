import {test,expect} from '@playwright/test';
import ExcelJS from 'exceljs';
import {HEADERS,validateBase,keyOf} from '../../src/lib/domain';
import {normalizeAudit} from '../../src/lib/audit';
import {publicDataset} from '../../server/public-data';

function fixture(){
 const row=(appointment:string,type='Eletiva',billing:string|null=null,note:string|null=null)=>['EMPRESA FICTÍCIA',appointment,'2026-09-01',type,'Cliente','SP','Hospital','SP','Médico Original',null,'Representante Original',billing,note,100];
 const rows=Array.from({length:40},(_,i)=>[row(`ORIGINAL-${i}`),row(`ORIGINAL-${i}`,'Urgência')]).flat();
 rows.push(row('QUARENTENA ORIGINAL','Eletiva','2026-08-01'),row('NOTA NORMAL','Eletiva',null,'NOTA OPERACIONAL'));
 const ds=validateBase([...HEADERS],rows,'2026-09-30','ficticia.xlsx');
 ds.issues.push({row:83,key:keyOf('EMPRESA FICTÍCIA','NOTA NORMAL'),code:'note_without_date',severity:'warning',message:'Nota sem data: registro permanece pendente.'});
 ds.audit.notesWithoutDate=1;ds.audit.inconsistentRecords++;
 return ds;
}
test('auditoria pesquisa todas as ocorrências, associa agendamentos e exporta resultados fora da rolagem',async({page})=>{
 const ds=fixture();
 await page.route('**/api/public/dataset',r=>r.fulfill({json:publicDataset(ds)}));
 await page.route('**/api/dataset',r=>r.fulfill({json:normalizeAudit(ds)}));
 await page.goto('/');await expect(page.locator('.kpi').first()).toContainText('8.100,00');
 await page.getByRole('button',{name:'Acesso administrativo'}).click();await page.getByRole('button',{name:'Entrar no ambiente local'}).click();
 await expect(page.locator('.analytical')).toContainText('Médico Original');
 const audit=page.locator('#auditoria');await audit.locator('summary').click();
 await expect(audit.getByRole('columnheader',{name:'Agendamento',exact:true})).toBeVisible();await expect(audit).not.toContainText('Nota sem data');
 await expect(audit.locator('summary')).toContainText('81 ocorrências');await expect(audit.locator('.audit-grid')).toContainText('Registros para conferência');
 const search=page.getByLabel('Pesquisar ocorrência');
 for(const [query,count] of [['quarentena original',1],['82',1],['ANTERIOR',1],['ConFeRiR',80]]){await search.fill(String(query));await expect(audit.locator('tbody tr')).toHaveCount(Number(count));}
 await page.getByRole('button',{name:'Limpar pesquisa'}).click();await page.getByLabel('Severidade das ocorrências').selectOption('warning');await expect(audit.locator('tbody tr')).toHaveCount(80);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Ocorrências (.xlsx)'}).click();const file=await download;
 expect(file.suggestedFilename()).toBe('Auditoria_Retencao_Faturamento_2026-09-30.xlsx');
 const book=new ExcelJS.Workbook();await book.xlsx.readFile((await file.path())!);const sheet=book.worksheets[0];
 expect(sheet.rowCount).toBe(81);expect(sheet.getRow(1).values).toEqual([undefined,'Linha','Agendamento','Severidade','Ocorrência']);expect(sheet.getCell('B81').value).toBe('ORIGINAL-39');expect(sheet.autoFilter).toBe('A1:D81');
 await search.fill('inexistente');await expect(audit.getByText('Nenhuma ocorrência encontrada.')).toBeVisible();await expect(audit.locator('tbody tr')).toHaveCount(0);
 await search.fill('QUARENTENA ORIGINAL');await page.getByLabel('Severidade das ocorrências').selectOption('all');await expect(audit.locator('tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('.badge')).toContainText('BASE ANONIMIZADA');await expect(search).toHaveValue('');
 await expect(page.locator('main')).not.toContainText('QUARENTENA ORIGINAL');await expect(page.locator('main')).not.toContainText('Médico Original');await expect(page.locator('.kpi').first()).toContainText('8.100,00');
});

test('consulta pública mantém controles bloqueados mesmo após manipulação do DOM',async({page})=>{
 await page.goto('/');await expect(page.locator('.kpi').first()).toContainText('8.489.909,79');
 for(const name of ['Baixar Modelo da Base','Selecionar Nova Base','Atualizar Dashboard'])await expect(page.getByRole('button',{name:new RegExp(name)})).toBeDisabled();
 await expect(page.getByLabel('Selecionar planilha da base')).toBeDisabled();await expect(page.getByText('Gerenciamento disponível somente para administradores.')).toBeVisible();
 const calls:string[]=[];page.on('request',r=>{if(/\/api\/(template|validate|import)/.test(r.url()))calls.push(r.url());});
 for(const name of ['Baixar Modelo da Base','Selecionar Nova Base','Atualizar Dashboard']){const button=page.getByRole('button',{name:new RegExp(name)});await button.evaluate(el=>el.removeAttribute('disabled'));await button.click();}
 expect(calls).toEqual([]);
 for(const path of ['/api/template','/api/dataset'])expect((await page.request.get(path)).status()).toBe(401);
 for(const path of ['/api/validate','/api/import'])expect((await page.request.post(path,{data:{}})).status()).toBe(401);
 await page.getByLabel('Mês',{exact:true}).click();await page.getByText('Setembro',{exact:true}).click();await page.getByLabel('Mês',{exact:true}).click();await expect(page.locator('.kpi').first()).toContainText('8.489.909,79');
});

test('base pública autorizada usa originais em tabelas, pesquisa, filtros e Excel após reabrir',async({page,context})=>{
 const ds=fixture();
 const mock=async(p:typeof page)=>p.route('**/api/public/dataset',r=>r.fulfill({json:publicDataset(ds,true)}));
 await mock(page);await page.goto('/');
 const verify=async(p:typeof page)=>{
  await expect(p.locator('.analytical')).toContainText('ORIGINAL-0');await expect(p.locator('.analytical')).toContainText('Médico Original');await expect(p.locator('.analytical')).toContainText('Representante Original');
  for(const name of ['Baixar Modelo da Base','Selecionar Nova Base','Atualizar Dashboard'])await expect(p.getByRole('button',{name:new RegExp(name)})).toBeDisabled();
 };
 await verify(page);
 for(const [dimension,name] of [['Médico','Médico Original'],['Representante Principal','Representante Original']]){
  await page.getByLabel(dimension,{exact:true}).click();await expect(page.getByText(name,{exact:true}).first()).toBeVisible();await page.getByText(name,{exact:true}).first().click();await page.getByLabel(dimension,{exact:true}).click();await expect(page.locator('.kpi').first()).toContainText('8.100,00');
 }
 await page.getByRole('button',{name:'Expandir ORIGINAL-0',exact:true}).click();await expect(page.locator('.record-detail')).toContainText('Representante Original');
 const audit=page.locator('#auditoria');await audit.locator('summary').click();await page.getByLabel('Pesquisar ocorrência').fill('quarentena original');await expect(audit.locator('tbody tr')).toHaveCount(1);await expect(audit.locator('tbody')).toContainText('QUARENTENA ORIGINAL');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Ocorrências (.xlsx)'}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await (await downloaded).path())!);expect(book.worksheets[0].getCell('B2').value).toBe('QUARENTENA ORIGINAL');
 await page.reload();await verify(page);await page.close();const reopened=await context.newPage();await mock(reopened);await reopened.goto('/');await verify(reopened);await expect(reopened.locator('.kpi').first()).toContainText('8.100,00');
 for(const width of [1920,1024,390]){await reopened.setViewportSize({width,height:1080});expect(await reopened.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
