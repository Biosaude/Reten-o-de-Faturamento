import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import {once} from 'node:events';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createApp} from '../server/app';
import {signInAdmin,type AuthConfig} from '../src/lib/admin-auth';
import {adminRequest,adminResponse,request,type AdminSession} from '../src/lib/api';
import {HEADERS,type Dataset} from '../src/lib/domain';

let database:Server,api:Server,config:AuthConfig,current:Dataset|null=null,writes=0;
const clients:SupabaseClient[]=[];
const nativeFetch=globalThis.fetch;
const users={
 admin:{id:'00000000-0000-4000-8000-000000000001',role:'admin'},
 analyst:{id:'00000000-0000-4000-8000-000000000002',role:'analyst'},
 viewer:{id:'00000000-0000-4000-8000-000000000003',role:'viewer'},
 unassigned:{id:'00000000-0000-4000-8000-000000000004',role:null}
};
const tokens=new Map<string,string>();
const body={headers:[...HEADERS],rows:[['FICTÍCIA','AGENDAMENTO PRIVADO','2026-09-01','Eletiva','Cliente fictício','SP','Hospital fictício','SP','MÉDICO PRIVADO','PACIENTE OMITIDO','REP PRIVADO',null,null,100]],asOf:'2026-09-30',fileName:'teste-ficticio.xlsx',expectedId:null as string|null,confirmed:true};
beforeAll(async()=>{
 database=createServer(async(req,res)=>{
  const url=new URL(req.url!,'http://test.invalid');
  const send=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  let raw='';for await(const chunk of req)raw+=chunk;
  if(url.pathname==='/auth/v1/token'){
   const credentials=JSON.parse(raw),name=credentials.email?.split('@')[0] as keyof typeof users;
   if(!users[name]||credentials.password!=='fictitious-password')return send(400,{error_code:'invalid_credentials',msg:'Invalid login credentials'});
   const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:users[name].id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test-signature'].join('.');tokens.set(token,name);
   return send(200,{access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:{id:users[name].id,email:credentials.email,aud:'authenticated',role:'authenticated'}});
  }
  const name=tokens.get(req.headers.authorization?.replace('Bearer ','')??'') as keyof typeof users|undefined;
  if(url.pathname==='/auth/v1/user')return name?send(200,{id:users[name].id,email:name+'@test.invalid',aud:'authenticated',role:'authenticated'}):send(401,{msg:'Invalid token'});
  if(url.pathname==='/auth/v1/logout'){res.writeHead(204);return res.end();}
  if(req.headers.apikey!=='server-test-only')return send(403,{message:'Server key required'});
  if(url.pathname==='/rest/v1/retention_roles'){
   const user=Object.values(users).find(u=>'eq.'+u.id===url.searchParams.get('user_id'));
   return send(200,user?.role?[{role:user.role}]:[]);
  }
  if(url.pathname==='/rest/v1/retention_current')return send(200,current?[{payload:current}]:[]);
  if(url.pathname==='/rest/v1/rpc/replace_retention_dataset'){
   const args=JSON.parse(raw);
   if(args.expected_id!==(current?.id??null))return send(409,{code:'P0001',message:'CONFLICT'});
   if(args.actor_id!==users.admin.id)return send(403,{message:'Invalid actor'});
   current=args.new_payload;writes++;return send(200,null);
  }
  return send(404,{message:'Unexpected test endpoint'});
 }).listen(0,'127.0.0.1');await once(database,'listening');
 const url=`http://127.0.0.1:${(database.address() as {port:number}).port}`;
 vi.stubEnv('SUPABASE_URL',url);vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','server-test-only');vi.stubEnv('SUPABASE_ANON_KEY','public-test-only');
 api=createApp(false).listen(0,'127.0.0.1');await once(api,'listening');
 const apiURL=`http://127.0.0.1:${(api.address() as {port:number}).port}`;
 vi.stubGlobal('fetch',(input:Parameters<typeof fetch>[0],options?:RequestInit)=>nativeFetch(typeof input==='string'&&input.startsWith('/api')?apiURL+input:input,options));
 config=await adminRequest<AuthConfig>('/auth/config',null);
});
afterAll(async()=>{
 for(const client of clients){await client.auth.signOut({scope:'local'});client.auth.stopAutoRefresh();}
 await new Promise<void>(resolve=>api.close(()=>resolve()));await new Promise<void>(resolve=>database.close(()=>resolve()));
 vi.unstubAllGlobals();vi.unstubAllEnvs();
});

describe('Autenticação e persistência com Supabase HTTP simulado',()=>{
 it('não entrega a chave administrativa na configuração pública',()=>{expect(config.anonKey).toBe('public-test-only');expect(JSON.stringify(config)).not.toContain('server-test-only');});
 it('recusa credenciais inválidas',async()=>{await expect(signInAdmin(config,'admin@test.invalid','incorrect')).rejects.toThrow('E-mail ou senha inválidos');expect(writes).toBe(0);});
 it.each(['analyst','viewer','unassigned'])('bloqueia gerenciamento e gravação para %s',async name=>{
  await expect(signInAdmin(config,name+'@test.invalid','fictitious-password')).rejects.toThrow(/permissão/);
  const token=[...tokens].find(([,user])=>user===name)![0];
  const session={role:'admin',email:name,local:false,accessToken:token} as AdminSession;
  await expect(adminRequest('/import',session,{method:'POST',body:JSON.stringify(body)})).rejects.toThrow(/administradores|permissão/);
  await expect(adminRequest('/validate',session,{method:'POST',body:JSON.stringify(body)})).rejects.toThrow(/administradores|permissão/);
  await expect(adminResponse('/template',session)).rejects.toThrow(/administradores|permissão/);
  expect(writes).toBe(0);
 });
 it('recusa importação anônima e sessão inválida',async()=>{
  await expect(adminRequest('/import',null,{method:'POST',body:JSON.stringify(body)})).rejects.toThrow('Autenticação necessária');
  await expect(adminResponse('/template',null)).rejects.toThrow('Autenticação necessária');
  await expect(adminRequest('/validate',null,{method:'POST',body:JSON.stringify(body)})).rejects.toThrow('Autenticação necessária');
  await expect(adminRequest('/import',{role:'admin',email:'',local:false,accessToken:'invalid'},{method:'POST',body:JSON.stringify(body)})).rejects.toThrow('Sessão inválida');
 });
 it('salva dados fictícios pela RPC existente e lê projeção pública em novas consultas',async()=>{
  expect(await request('/public/dataset')).toBeNull();
  const {session,client}=await signInAdmin(config,'admin@test.invalid','fictitious-password');clients.push(client!);
  const template=await adminResponse('/template',session);expect(template.headers.get('content-type')).toContain('spreadsheetml.sheet');expect((await template.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  const preview=await adminRequest<Dataset>('/validate',session,{method:'POST',body:JSON.stringify(body)});expect(preview.records[0].appointment).toBe('AGENDAMENTO PRIVADO');expect(writes).toBe(0);
  await expect(adminRequest('/import',session,{method:'POST',body:JSON.stringify({...body,confirmed:false})})).rejects.toThrow('Requisição inválida');
  const saved=await adminRequest<Dataset>('/import',session,{method:'POST',body:JSON.stringify(body)});
  const privateBase=await adminRequest<Dataset>('/dataset',session);expect(privateBase.records[0].appointment).toBe('AGENDAMENTO PRIVADO');expect(privateBase.records[0].doctor).toBe('MÉDICO PRIVADO');expect(privateBase.records[0].representative).toBe('REP PRIVADO');
  expect(writes).toBe(1);expect(saved.audit.totalCents).toBe(10000);
  const first=await request<Dataset>('/public/dataset'),reloaded=await request<Dataset>('/public/dataset');
  expect(reloaded).toEqual(first);expect(first.id).toBe(saved.id);expect(first.audit).toEqual(saved.audit);
  for(const privateValue of ['AGENDAMENTO PRIVADO','MÉDICO PRIVADO','REP PRIVADO','PACIENTE OMITIDO','teste-ficticio.xlsx'])expect(JSON.stringify(first)).not.toContain(privateValue);
  expect(JSON.stringify(current)).not.toContain('PACIENTE OMITIDO');
  await expect(adminRequest('/import',session,{method:'POST',body:JSON.stringify({...body,rows:[body.rows[0].map((v,i)=>i===13?200:v)]})})).rejects.toThrow('Outra importação');
  expect(writes).toBe(1);
  const updated=await adminRequest<Dataset>('/import',session,{method:'POST',body:JSON.stringify({...body,expectedId:saved.id,rows:[body.rows[0].map((v,i)=>i===13?200:v)]})});
  expect(writes).toBe(2);expect(updated.id).not.toBe(saved.id);
  const shared=await request<Dataset>('/public/dataset');expect(shared.id).toBe(updated.id);expect(shared.audit.totalCents).toBe(20000);
 });
});
