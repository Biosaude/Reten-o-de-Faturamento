import {test,expect,type Page} from '@playwright/test';
import ExcelJS from 'exceljs';
import {HEADERS,validateBase,type Dataset} from '../../src/lib/domain';
import {publicDataset} from '../../server/public-data';
import {auditSnapshot} from '../../src/lib/audit';
const row=(id:string,amount:number,billing:string|null=null,company='A')=>[company,id,'2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico','PACIENTE NÃO MOSTRAR','Representante',billing,'NOTA ORIGINAL',amount];
function version(cut:string,corrected=false){return validateBase([...HEADERS],[row('001',30,corrected?'2026-09-02':'2026-08-01'),row('002',20,'2026-08-01','B'),row('VALIDO',100)],cut,'oficial.xlsx');}
async function setup(page:Page,current:Dataset,history:Dataset[]=[]){
 let published=current,logged=false,failRefresh=false,writes=0,reads=0;
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/public/dataset'){reads++;return route.fulfill({json:publicDataset(published)});}
  if(path==='/api/auth/config')return route.fulfill({json:{local:true,supabaseUrl:null,anonKey:null}});
  if(path==='/api/auth/local'){logged=true;return route.fulfill({json:{role:'admin',email:'Admin fictício'}});}
  if(path==='/api/auth/logout'){logged=false;return route.fulfill({status:204});}
  if(!logged)return route.fulfill({status:401,json:{error:'Autenticação necessária.'}});
  if(path==='/api/dataset')return failRefresh?route.fulfill({status:503,json:{error:'Leitura indisponível; base anterior preservada.'}}):route.fulfill({json:published});
  if(path==='/api/audit/versions')return route.fulfill({json:[published,...history].map(d=>({id:d.id,asOf:d.asOf,updatedAt:d.updatedAt,fileName:d.fileName,audit:d.audit,available:true}))});
  if(path.startsWith('/api/audit/versions/')){const ds=history.find(d=>d.id===path.split('/').at(-1));return ds?route.fulfill({json:auditSnapshot(ds)}):route.fulfill({status:404,json:{error:'Indisponível.'}});}
  if(path==='/api/validate'){const b=req.postDataJSON();return route.fulfill({json:validateBase(b.headers,b.rows,b.asOf,b.fileName)});}
  if(path==='/api/import'){writes++;return route.abort();}
  return route.abort();
 });
 await page.goto('/');return {publish:(ds:Dataset)=>published=ds,fail:()=>failRefresh=true,writes:()=>writes,reads:()=>reads};
}
async function login(page:Page){await page.getByRole('button',{name:'Acesso administrativo'}).click();await page.getByRole('button',{name:'Entrar no ambiente local'}).click();await expect(page.getByRole('button',{name:'Sair',exact:true})).toBeVisible();}
test('Posição atual descarta o recorte temporário e recarrega dados e corte oficiais',async({page})=>{
 const current=validateBase([...HEADERS],[row('P',100,'2026-10-10'),row('P',200)],'2026-10-16','publicada.xlsx');const state=await setup(page,current);await login(page);
 await page.getByLabel('Data de corte da nova base').fill('2026-10-09');const csv=Buffer.from([HEADERS,row('P',100,'2026-10-10'),row('P',200)].map(r=>r.map(v=>v??'').join(',')).join('\n'));
 await page.getByLabel('Selecionar planilha da base').setInputFiles({name:'temporaria.csv',mimeType:'text/csv',buffer:csv});await page.getByRole('button',{name:/Atualizar Dashboard/}).click();await expect(page.locator('.badge')).toHaveText('BASE DA SESSÃO');await expect(page.getByTestId('financial-reference')).toContainText('09/10/2026');await expect(page.locator('.kpi').first()).toContainText('300,00');
 await page.getByRole('button',{name:'Posição atual',exact:true}).click();await expect(page.locator('.badge')).toHaveText('BASE ADMINISTRATIVA');await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await expect(page.locator('.kpi').first()).toContainText('200,00');expect(state.writes()).toBe(0);
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('.badge')).toHaveText('BASE COMPARTILHADA');await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await page.reload();await expect(page.locator('.kpi').first()).toContainText('200,00');
});
test('consulta pública busca nova versão ao retornar à posição atual e mantém filtros de dimensão',async({page})=>{
 const old=version('2026-10-09'),next=version('2026-10-16',true),state=await setup(page,old);await expect(page.getByTestId('financial-reference')).toContainText('09/10/2026');
 await page.getByLabel('Empresa',{exact:true}).click();await page.getByText('A',{exact:true}).first().click();await page.getByLabel('Empresa',{exact:true}).click();state.publish(next);
 await page.getByRole('button',{name:'Posição atual',exact:true}).click();await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await expect(page.getByLabel('Empresa',{exact:true})).toContainText('A');expect(state.reads()).toBeGreaterThan(1);expect(state.writes()).toBe(0);
});
test('falha no refresh não troca dados nem referência da consulta anterior',async({page})=>{
 const state=await setup(page,version('2026-10-16',true));await login(page);await page.getByLabel('Data específica').fill('2026-10-09');state.fail();await page.getByRole('button',{name:'Posição atual',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Leitura indisponível');await expect(page.getByTestId('financial-reference')).toContainText('09/10/2026');expect(state.writes()).toBe(0);
});
test('quarentena detalhada pública é sanitizada; histórico e Excel administrativos preservam linhas e motivos',async({page})=>{
 const old=version('2026-10-09'),current=version('2026-10-16',true);await setup(page,current,[old]);const audit=page.locator('#auditoria');await expect(audit).toContainText('Valor dos registros em quarentena');await audit.locator('summary').click();await page.getByLabel('Classificação da auditoria').selectOption('error');await page.getByLabel('Empresa da auditoria').selectOption('B');await expect(audit.locator('.issues tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Detalhes da linha 3'}).click();await expect(audit).toContainText('Hospital');await expect(audit).not.toContainText('PACIENTE NÃO MOSTRAR');await expect(audit).not.toContainText('NOTA ORIGINAL');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Ocorrências (.xlsx)'}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await (await download).path())!);expect(book.getWorksheet('Registros')!.getCell('F2').value).toBe('002');expect(book.getWorksheet('Registros')!.getCell('P2').value).not.toBe('NOTA ORIGINAL');
 await login(page);await expect(page.locator('.kpi').first()).toContainText('100,00');await page.getByLabel('Versão da auditoria').selectOption(old.id);await audit.locator('summary').click();await page.getByLabel('Pesquisar ocorrência').fill('001');await expect(audit.locator('.issues tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'Detalhes da linha 2'}).click();await expect(audit).toContainText('Válido na versão atual');await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await expect(page.locator('.kpi').first()).toContainText('100,00');
 const archived=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Ocorrências (.xlsx)'}).click();const historyBook=new ExcelJS.Workbook();await historyBook.xlsx.readFile((await (await archived).path())!);const sheet=historyBook.getWorksheet('Registros')!;expect(sheet.getCell('A2').value).toBe(old.id);expect(sheet.getCell('F2').value).toBe('001');expect(sheet.getCell('P2').value).toBe('NOTA ORIGINAL');expect(sheet.getCell('Q2').value).toBe(30);expect(JSON.stringify(sheet.getSheetValues())).not.toContain('PACIENTE NÃO MOSTRAR');
 for(const width of [1920,1024,390]){await page.setViewportSize({width,height:1080});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.getByLabel('Versão da auditoria')).toHaveCount(0);await expect(audit).not.toContainText('NOTA ORIGINAL');
});
