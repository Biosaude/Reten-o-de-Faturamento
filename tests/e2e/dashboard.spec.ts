import {test,expect} from '@playwright/test';
const login=async(page:import('@playwright/test').Page)=>{await page.goto('/');await page.getByRole('button',{name:'Entrar no ambiente local'}).click();await expect(page.getByRole('heading',{name:'BIOSAÚDE | RETENÇÃO DE FATURAMENTO'})).toBeVisible();};
test('dashboard real: cortes, faixas, drill-down e exportações',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page);
 await expect(page.locator('.kpi').first()).toContainText('8.489.909,79');await expect(page.locator('.kpi').nth(1)).toContainText('504');
 await page.getByLabel('Quarter',{exact:true}).click();await page.getByText('Q2',{exact:true}).first().click();await page.getByLabel('Quarter',{exact:true}).click();
 await expect(page.locator('.toolbar')).toContainText('30/06/2026');await expect(page.locator('.kpi').first()).toContainText('8.127.399,40');
 await page.getByRole('button',{name:'Limpar filtros'}).click();
 await page.getByRole('button',{name:/Acima de 180 dias/}).first().click();await expect(page.locator('.kpi').first()).toContainText('187.446,00');await expect(page.locator('.kpi').nth(1)).toContainText('25');
 await page.getByRole('button',{name:/Expandir/}).first().click();await expect(page.locator('.record-detail')).toBeVisible();
 const xlsx=page.waitForEvent('download');await page.getByRole('button',{name:'Excel',exact:true}).click();const x=await xlsx;expect(x.suggestedFilename()).toBe('retencao.xlsx');expect(await x.failure()).toBeNull();
 const pdf=page.waitForEvent('download');await page.getByRole('button',{name:'PDF',exact:true}).click();const p=await pdf;expect(p.suggestedFilename()).toBe('retencao.pdf');expect(await p.failure()).toBeNull();
 await page.screenshot({path:'.local/screenshots/dashboard-desktop.png',fullPage:true});expect(errors).toEqual([]);
});
test('importação incompatível preserva a base e mostra erro',async({page})=>{
 await login(page);await page.getByRole('button',{name:'Importar base'}).click();await page.getByLabel('Arquivo Excel ou CSV').setInputFiles({name:'incompativel.csv',mimeType:'text/csv',buffer:Buffer.from('Empresa,Valor\nX,10')});await expect(page.getByRole('alert').last()).toContainText('14 colunas');await expect(page.getByRole('button',{name:'Confirmar substituição'})).toBeDisabled();await page.getByRole('button',{name:'Cancelar'}).click();await expect(page.locator('.kpi').first()).toContainText('8.489.909,79');
});
test('responsividade em celular e sessão restrita',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page);await expect(page.locator('.kpi').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'.local/screenshots/dashboard-mobile.png',fullPage:true});await page.getByRole('button',{name:'Sair'}).click();await expect(page.getByRole('button',{name:'Entrar no ambiente local'})).toBeVisible();
});

test('importa Excel válido e substitui por CSV sem duplicar registros legítimos',async({page})=>{
 await login(page);
 const {default:ExcelJS}=await import('exceljs');const {HEADERS}=await import('../../src/lib/domain');
 const rows=[['EMPRESA TESTE','999','2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico','PACIENTE NAO ARMAZENAR','Rep',null,null,100],['EMPRESA TESTE','999','2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico','PACIENTE NAO ARMAZENAR','Rep',null,null,200]];
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Dados');sheet.addRow([...HEADERS]);rows.forEach(r=>sheet.addRow(r));
 await page.getByRole('button',{name:'Importar base'}).click();await page.getByLabel('Arquivo Excel ou CSV').setInputFiles({name:'nova.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())});
 await expect(page.locator('.import-review')).toContainText('2 registros · 1 cirurgias');await page.getByRole('button',{name:'Confirmar substituição'}).click();
 await expect(page.locator('.kpi').first()).toContainText('300,00');await expect(page.locator('.kpi').nth(1)).toContainText('1');
 const response=await page.request.get('/api/dataset');expect(await response.text()).not.toContain('PACIENTE NAO ARMAZENAR');
 const csv=[HEADERS.join(';'),...rows.map(r=>r.map(v=>v??'').join(';'))].join('\n');
 await page.getByRole('button',{name:'Importar base'}).click();await page.getByLabel('Arquivo Excel ou CSV').setInputFiles({name:'mesma.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await expect(page.locator('.import-review')).toContainText('2 registros');await page.getByRole('button',{name:'Confirmar substituição'}).click();await expect(page.getByRole('alert').last()).toContainText('já está carregada');await page.getByRole('button',{name:'Cancelar'}).click();await expect(page.locator('.kpi').first()).toContainText('300,00');
});
