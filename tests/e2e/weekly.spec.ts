import {test,expect} from '@playwright/test';
import {HEADERS,validateBase,type Dataset} from '../../src/lib/domain';
import {publicDataset} from '../../server/public-data';
import {publicationMetadata} from '../../server/publication';
const row=(amount:number,billing:string|null=null)=>['A','PARCIAL','2026-09-20','Eletiva','Cliente','SP','Hospital','SP','Médico',null,'Representante',billing,'Nota privada',amount];
test('publica duas semanas pela interface sem segunda data e consulta a versão de duas semanas atrás',async({page})=>{
 let instant=new Date('2026-10-02T15:00:00Z'),current=validateBase([...HEADERS],[row(100)],'2026-09-25','anterior.xlsx'),logged=false,writes=0;
 const versions=new Map<string,Dataset>();
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/public/dataset')return route.fulfill({json:publicDataset(current)});
  if(path==='/api/auth/config')return route.fulfill({json:{local:true,supabaseUrl:null,anonKey:null}});
  if(path==='/api/auth/local'){logged=true;return route.fulfill({json:{role:'admin',email:'Admin fictício'}});}
  if(path==='/api/auth/logout'){logged=false;return route.fulfill({status:204});}
  const list=[...versions.values()].reverse().map(({id,asOf,updatedAt})=>({id,asOf,updatedAt}));
  if(path==='/api/public/versions')return route.fulfill({json:list});
  if(path.startsWith('/api/public/versions/'))return route.fulfill({json:publicDataset(versions.get(path.split('/').at(-1)!)!)});
  if(!logged)return route.fulfill({status:401,json:{error:'Autenticação necessária.'}});
  if(path==='/api/dataset')return route.fulfill({json:current});
  if(path==='/api/versions')return route.fulfill({json:list});
  if(path.startsWith('/api/versions/'))return route.fulfill({json:versions.get(path.split('/').at(-1)!)});
  if(path==='/api/audit/versions')return route.fulfill({json:[]});
  if(path==='/api/validate'||path==='/api/import'){
   const body=req.postDataJSON(),metadata=publicationMetadata(instant);const next={...validateBase(body.headers,body.rows,metadata.asOf,body.fileName),...metadata};
   if(path==='/api/import'){expect(body).not.toHaveProperty('asOf');expect(body).not.toHaveProperty('updatedAt');expect(body.confirmed).toBe(true);expect(body.expectedId).toBe(current.id);current=next;versions.set(next.id,next);writes++;}
   return route.fulfill({json:next});
  }
  return route.abort();
 });
 await page.goto('/');await page.getByRole('button',{name:'Acesso administrativo'}).click();await page.getByRole('button',{name:'Entrar no ambiente local'}).click();await page.getByLabel('Base compartilhada (Supabase)').check();await expect(page.getByLabel('Data de corte da nova base')).toHaveCount(0);
 const publish=async(rows:unknown[][])=>{const buffer=Buffer.from([HEADERS,...rows].map(r=>r.map(v=>v??'').join(',')).join('\n'));await page.getByLabel('Selecionar planilha da base').setInputFiles({name:'semanal.csv',mimeType:'text/csv',buffer});await page.getByLabel(/Confirmo a substituição/).check();await page.getByRole('button',{name:/Salvar Base Compartilhada/}).click();await expect(page.getByRole('status')).toContainText('Base compartilhada salva');};
 await publish([row(100,'2026-09-30'),row(200),row(300)]);const first=current.id;await expect(page.getByTestId('financial-reference')).toContainText('02/10/2026');await expect(page.locator('.kpi').first()).toContainText('500,00');
 instant=new Date('2026-10-16T16:45:00Z');await publish([row(100,'2026-09-30'),row(200,'2026-10-09'),row(300)]);await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await expect(page.locator('.kpi').first()).toContainText('300,00');expect(writes).toBe(2);
 await page.getByLabel('Data específica').fill('2026-10-02');await expect(page.locator('.kpi').first()).toContainText('500,00');await page.getByLabel('Versão financeira',{exact:true}).selectOption(first);await expect(page.locator('.badge')).toHaveText('VERSÃO HISTÓRICA');await expect(page.locator('.kpi').first()).toContainText('500,00');
 await page.getByRole('button',{name:'Posição atual',exact:true}).click();await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await expect(page.getByLabel('Versão financeira',{exact:true})).toHaveValue('');await expect(page.locator('.kpi').first()).toContainText('300,00');
 await page.getByRole('button',{name:'Sair',exact:true}).click();await page.reload();await expect(page.locator('.badge')).toHaveText('BASE COMPARTILHADA');await expect(page.getByTestId('financial-reference')).toContainText('16/10/2026');await page.getByLabel('Versão financeira',{exact:true}).selectOption(first);await expect(page.locator('.kpi').first()).toContainText('500,00');expect(writes).toBe(2);await expect(page.getByRole('button',{name:/Atualizar Dashboard/})).toBeDisabled();
 for(const width of [1920,1024,390]){await page.setViewportSize({width,height:1080});await expect(page.getByLabel('Versão financeira',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
