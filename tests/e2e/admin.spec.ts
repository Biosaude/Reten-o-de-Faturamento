import {test,expect,type Page} from '@playwright/test';
import {HEADERS,validateBase,type Dataset} from '../../src/lib/domain';
import {normalizeAudit} from '../../src/lib/audit';
import {publicDataset} from '../../server/public-data';

const row=['FICTÍCIA','AGENDAMENTO PRIVADO','2026-09-01','Eletiva','Cliente fictício','SP','Hospital fictício','SP','MÉDICO PRIVADO','PACIENTE OMITIDO','REP PRIVADO',null,null,100];
const csv=Buffer.from([HEADERS,row].map(values=>values.map(v=>v??'').join(',')).join('\n'));
async function setup(page:Page,role='admin',conflict=false,initial:Dataset|null=null){
 let shared:Dataset|null=initial,writes=0;
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:'00000000-0000-4000-8000-000000000001',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test-signature'].join('.');
 await page.route('https://auth-test.supabase.co/auth/v1/**',async route=>{
  const req=route.request(),headers={'Access-Control-Allow-Origin':'http://127.0.0.1:5173','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(new URL(req.url()).pathname==='/auth/v1/logout')return route.fulfill({status:204,headers});
  const credentials=req.postDataJSON();
  if(credentials.password!=='fictitious-password')return route.fulfill({status:400,headers,json:{error_code:'invalid_credentials',msg:'Invalid login credentials'}});
  return route.fulfill({headers,json:{access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user:{id:'00000000-0000-4000-8000-000000000001',email:'admin@test.invalid',aud:'authenticated',role:'authenticated'}}});
 });
 // Every API request is intercepted: these tests cannot write to the local or official database.
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/auth/config')return route.fulfill({json:{local:false,supabaseUrl:'https://auth-test.supabase.co',anonKey:'public-test-only'}});
  if(path==='/api/auth/logout')return route.fulfill({status:204});
  if(path==='/api/public/dataset')return route.fulfill({json:shared?publicDataset(shared,false):null});
  if(req.headers().authorization!=='Bearer '+token)return route.fulfill({status:401,json:{error:'Sessão inválida.'}});
  if(path==='/api/me')return route.fulfill({json:{role}});
  if(path==='/api/dataset')return route.fulfill({json:shared?normalizeAudit(shared):null});
  if(path==='/api/validate'){const body=req.postDataJSON();return route.fulfill({json:validateBase(body.headers,body.rows,body.asOf,body.fileName)});}
  if(path==='/api/import'){
   if(role!=='admin')return route.fulfill({status:403,json:{error:'Somente administradores podem importar.'}});
   const body=req.postDataJSON();
   expect(body.confirmed).toBe(true);expect(body.rows[0][9]).toBeNull();expect(body.expectedId).toBe(shared?.id??null);
   if(conflict)return route.fulfill({status:409,json:{error:'Outra importação atualizou a base. Recarregue antes de confirmar.'}});
   shared=validateBase(body.headers,body.rows,body.asOf,body.fileName);writes++;
   return route.fulfill({json:shared});
  }
  return route.abort();
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Gerenciamento da Base de Dados'})).toBeVisible();
 return {writes:()=>writes};
}
async function login(page:Page,password='fictitious-password'){
 await page.getByRole('button',{name:'Acesso administrativo'}).click();
 await page.getByLabel('E-mail administrativo').fill('admin@test.invalid');
 await page.getByLabel('Senha',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
}
async function select(page:Page){
 await page.locator('.base-cut input[type=date]').fill('2026-09-30');
 await page.getByLabel('Selecionar planilha da base').setInputFiles({name:'ficticia.csv',mimeType:'text/csv',buffer:csv});
 await expect(page.getByRole('status')).toContainText('Arquivo validado');
}

test('login inválido e usuário sem autorização não habilitam persistência',async({page})=>{
 const state=await setup(page,'viewer');await login(page,'incorrect');
 await expect(page.getByRole('alert')).toContainText('E-mail ou senha inválidos');await expect(page.getByLabel('Senha',{exact:true})).toHaveValue('');
 await page.getByLabel('Senha',{exact:true}).fill('fictitious-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('permissão administrativa');await expect(page.getByLabel('Base compartilhada (Supabase)')).toHaveCount(0);
 expect(state.writes()).toBe(0);await page.getByRole('button',{name:'Acesso administrativo'}).click();
 for(const label of ['Baixar Modelo da Base','Selecionar Nova Base','Atualizar Dashboard'])await expect(page.getByRole('button',{name:new RegExp(label)})).toBeDisabled();expect(state.writes()).toBe(0);
});

test('administrador confirma gravação e base pública permanece após recarga e saída',async({page})=>{
 const initial=validateBase([...HEADERS],[row.map((v,i)=>i===13?250:v)],'2026-09-30','inicial-ficticia.xlsx');
 const state=await setup(page,'admin',false,initial);await expect(page.locator('.kpi').first()).toContainText('250,00');
 await login(page);await expect(page.getByRole('button',{name:'Sair',exact:true})).toBeVisible();
 await expect(page.getByLabel('Somente neste navegador')).toBeChecked();await page.getByLabel('Base compartilhada (Supabase)').check();await select(page);
 await expect(page.getByRole('button',{name:/Salvar Base Compartilhada/})).toBeDisabled();expect(state.writes()).toBe(0);
 await page.getByLabel(/Confirmo a substituição/).check();await page.getByRole('button',{name:/Salvar Base Compartilhada/}).click();
 await expect(page.getByRole('status')).toContainText('Base compartilhada salva no Supabase');await expect(page.locator('.kpi').first()).toContainText('100,00');
 await expect(page.locator('.badge')).toContainText('BASE ADMINISTRATIVA');await expect(page.locator('.base-info')).toContainText('ficticia.csv');
 await expect(page.locator('.analytical')).toContainText('AGENDAMENTO PRIVADO');await expect(page.locator('.analytical')).toContainText('MÉDICO PRIVADO');await expect(page.locator('.analytical')).toContainText('REP PRIVADO');
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('.badge')).toContainText('BASE ANONIMIZADA');
 for(const value of ['AGENDAMENTO PRIVADO','MÉDICO PRIVADO','REP PRIVADO','PACIENTE OMITIDO'])await expect(page.locator('main')).not.toContainText(value);
 await expect(page.getByLabel('Base compartilhada (Supabase)')).toHaveCount(0);await expect(page.locator('.kpi').first()).toContainText('100,00');
 await page.reload();await expect(page.locator('.kpi').first()).toContainText('100,00');await expect(page.locator('.badge')).toContainText('BASE ANONIMIZADA');expect(state.writes()).toBe(1);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sb-')))).toEqual([]);
});

test('conflito de versão preserva base ativa e não informa sucesso',async({page})=>{
 const state=await setup(page,'admin',true);await login(page);await page.getByLabel('Base compartilhada (Supabase)').check();await select(page);await page.getByLabel(/Confirmo a substituição/).check();
 await page.getByRole('button',{name:/Salvar Base Compartilhada/}).click();await expect(page.getByRole('alert')).toContainText('Outra importação atualizou a base');
 await expect(page.locator('.base-info')).toContainText('Nenhuma base carregada');await expect(page.locator('.badge')).toContainText('BASE ADMINISTRATIVA');expect(state.writes()).toBe(0);
});

test('administrador mantém importação temporária como padrão e controles responsivos',async({page})=>{
 const state=await setup(page);await login(page);await select(page);await page.getByRole('button',{name:/Atualizar Dashboard/}).click();await expect(page.locator('.kpi').first()).toContainText('100,00');await expect(page.locator('.badge')).toContainText('BASE DA SESSÃO');expect(state.writes()).toBe(0);
 for(const width of [1920,1024,390]){await page.setViewportSize({width,height:1080});await page.locator('.base-management').scrollIntoViewIfNeeded();await expect(page.getByLabel('Base compartilhada (Supabase)')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.reload();await expect(page.locator('.base-info')).toContainText('Nenhuma base carregada');expect(state.writes()).toBe(0);
});

test('resposta privada atrasada não restaura identificadores depois da saída',async({page})=>{
 const initial=validateBase([...HEADERS],[row],'2026-09-30','inicial-ficticia.xlsx');await setup(page,'admin',false,initial);
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/dataset',async route=>{await gate;await route.fulfill({json:initial});});
 const requested=page.waitForRequest('**/api/dataset');await login(page);await requested;
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('.badge')).toContainText('BASE ANONIMIZADA');
 const response=page.waitForResponse('**/api/dataset');release();await response;
 await page.getByLabel('Mês',{exact:true}).click();await page.getByLabel('Mês',{exact:true}).click();
 await expect(page.locator('.analytical')).not.toContainText('AGENDAMENTO PRIVADO');await expect(page.locator('.analytical')).not.toContainText('MÉDICO PRIVADO');
 await expect(page.locator('.badge')).toContainText('BASE ANONIMIZADA');await expect(page.locator('.kpi').first()).toContainText('100,00');
});
