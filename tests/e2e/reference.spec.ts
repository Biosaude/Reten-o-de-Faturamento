import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {parseFile} from '../../src/lib/import';
import {HEADERS,validateBase,type Dataset} from '../../src/lib/domain';
import {publicDataset} from '../../server/public-data';
const row=(id:string,amount:number,billing:string|null=null)=>['A',id,'2025-12-01','Eletiva','Cliente','SP','Hospital','SP','Médico',null,'Representante',billing,null,amount];
function fixture(){const ds=validateBase([...HEADERS],[row('PARCIAL',100,'2026-10-10'),row('PARCIAL',200),row('PENDENTE',50)],'2026-10-16','ficticia.xlsx');ds.updatedAt='2026-10-16T15:00:00Z';return ds;}
async function setup(page:Page,initial=fixture()){
 let ds=initial,logged=false,writes=0;
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/public/dataset')return route.fulfill({json:publicDataset(ds)});
  if(path==='/api/auth/config')return route.fulfill({json:{local:true,supabaseUrl:null,anonKey:null}});
  if(path==='/api/auth/local'){logged=true;return route.fulfill({json:{role:'admin',email:'Administrador fictício'}});}
  if(path==='/api/auth/logout'){logged=false;return route.fulfill({status:204});}
  if(!logged)return route.fulfill({status:401,json:{error:'Autenticação necessária.'}});
  if(path==='/api/dataset')return route.fulfill({json:ds});
  if(path==='/api/validate'||path==='/api/import'){
   const body=request.postDataJSON(),next=validateBase(body.headers,body.rows,body.asOf,body.fileName);
   if(path==='/api/import'){expect(body.expectedId).toBe(ds.id);expect(body.confirmed).toBe(true);ds=next;writes++;}
   return route.fulfill({json:next});
  }
  return route.abort();
 });
 await page.goto('/');return {writes:()=>writes};
}
async function login(page:Page){await page.getByRole('button',{name:'Acesso administrativo'}).click();await page.getByRole('button',{name:'Entrar no ambiente local'}).click();await expect(page.getByRole('button',{name:'Sair',exact:true})).toBeVisible();}
test('consulta pública abre no corte atual, reconstrói períodos e retorna à posição atual sem perder dimensões',async({page})=>{
 await setup(page);await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await expect(page.locator('.update')).toContainText('Última atualização da base:');await expect(page.locator('.update')).toContainText('16/10/2026');await expect(page.locator('.kpi').first()).toContainText('250,00');
 await expect(page.getByRole('button',{name:/Selecionar Nova Base/})).toBeDisabled();
 await page.getByLabel('Empresa',{exact:true}).click();await page.getByText('A',{exact:true}).first().click();await page.getByLabel('Empresa',{exact:true}).click();
 await page.getByLabel('Data específica').fill('2026-10-09');await expect(page.getByTestId('financial-reference')).toContainText('09/10/2026');await expect(page.locator('.kpi').first()).toContainText('350,00');
 await page.getByLabel('Mês',{exact:true}).click();await page.getByText('Setembro',{exact:true}).click();await page.getByLabel('Mês',{exact:true}).click();await expect(page.getByTestId('financial-reference')).toContainText('30/09/2026');
 await page.getByRole('button',{name:'Posição atual',exact:true}).click();await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await expect(page.getByLabel('Empresa',{exact:true})).toContainText('A');await expect(page.getByLabel('Data específica')).toHaveValue('');
 await page.getByLabel('Ano',{exact:true}).selectOption('2025');await expect(page.getByTestId('financial-reference')).toContainText('31/12/2025');await page.getByRole('button',{name:'Posição atual',exact:true}).click();
 for(const width of [1920,1024,390]){await page.setViewportSize({width,height:1080});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByLabel('Data específica')).toBeVisible();}
});
for(const historical of [false,true])test(`atualização administrativa ${historical?'preserva data histórica explícita':'move a posição corrente'} em novas versões`,async({page})=>{
 const initial=fixture();initial.asOf='2026-10-09';const state=await setup(page,initial);await expect(page.getByTestId('financial-reference')).toContainText('09/10/2026');if(historical)await page.getByLabel('Data específica').fill('2026-10-09');await login(page);
 await page.getByLabel('Base compartilhada (Supabase)').check();await page.getByLabel('Data de corte da nova base').fill('2026-10-16');
 const csv=Buffer.from([HEADERS,row('PARCIAL',100,'2026-10-10'),row('PARCIAL',200),row('PENDENTE',50)].map(r=>r.map(v=>v??'').join(',')).join('\n'));
 await page.getByLabel('Selecionar planilha da base').setInputFiles({name:'atualizada.csv',mimeType:'text/csv',buffer:csv});await page.getByLabel(/Confirmo a substituição/).check();await page.getByRole('button',{name:/Salvar Base Compartilhada/}).click();
 if(historical){await expect(page.getByTestId('financial-reference')).toContainText('09/10/2026');await expect(page.locator('.kpi').first()).toContainText('350,00');await page.getByRole('button',{name:'Posição atual',exact:true}).click();}
 await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await expect(page.locator('.kpi').first()).toContainText('250,00');expect(state.writes()).toBe(1);
 await page.getByLabel('Data específica').fill('2026-10-09');await expect(page.locator('.kpi').first()).toContainText('350,00');await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.getByTestId('financial-reference')).toContainText('09/10/2026');
 await page.getByRole('button',{name:'Posição atual',exact:true}).click();await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await page.reload();await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');expect(state.writes()).toBe(1);
});
test('corte ausente não é deduzido das datas nem da última atualização',async({page})=>{
 const ds=fixture();ds.asOf='';await setup(page,ds);await expect(page.getByTestId('financial-reference')).toContainText('—');await expect(page.getByRole('alert')).toContainText('Data de corte financeiro não confirmada');await expect(page.getByLabel('Data específica')).toBeDisabled();
});

test('regressão visual dos saldos da planilha geral no acesso público e administrativo',async({page})=>{
 test.skip(!process.env.OFFICIAL_RECONCILIATION_PATH,'Planilha privada não fornecida.');test.setTimeout(120000);
 const path=process.env.OFFICIAL_RECONCILIATION_PATH!;const {dataset}=await parseFile(new File([await readFile(path)],'geral.xlsx'),'2026-10-16');await setup(page,dataset);
 await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await expect(page.locator('.kpi').first()).toContainText('12.407.370,81');
 await page.getByLabel('Data específica').fill('2026-10-09');await expect(page.locator('.kpi').first()).toContainText('15.279.934,18');
 for(const [month,date,amount] of [['Setembro','30/09/2026','14.172.342,77'],['Agosto','31/08/2026','13.865.911,99']]){
  await page.getByRole('button',{name:'Posição atual',exact:true}).click();await page.getByLabel('Mês',{exact:true}).click();await page.getByText(month,{exact:true}).click();await page.getByLabel('Mês',{exact:true}).click();await expect(page.getByTestId('financial-reference')).toContainText(date);await expect(page.locator('.kpi').first()).toContainText(amount);
 }
 await page.getByRole('button',{name:'Posição atual',exact:true}).click();await page.getByLabel('Quarter',{exact:true}).click();await page.getByText('Q2',{exact:true}).first().click();await page.getByLabel('Quarter',{exact:true}).click();await expect(page.getByTestId('financial-reference')).toContainText('30/06/2026');await expect(page.locator('.kpi').first()).toContainText('11.874.767,67');
 await login(page);await expect(page.getByTestId('financial-reference')).toContainText('30/06/2026');await page.getByRole('button',{name:'Posição atual',exact:true}).click();await expect(page.locator('.kpi').first()).toContainText('12.407.370,81');await page.reload();await expect(page.locator('.kpi').first()).toContainText('12.407.370,81');
});
