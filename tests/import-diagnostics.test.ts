import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {Server} from 'node:http';
import type {Response} from 'express';
import {createApp} from '../server/app';
import * as store from '../server/store';
import {COST_HEADERS,validateBase,type Dataset} from '../src/lib/domain';
const saveWithRealStore=store.saveDataset;

const marker='PRIVATE-MARKER-NEVER-LOG';
const row=(cost=30,value=100,billing:string|null=null,id='A')=>['FICTÍCIA',id,'2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico',marker,'Representante',billing,null,cost,value];
const body=()=>({headers:COST_HEADERS,rows:[row()],fileName:marker+'.xlsx',expectedId:current!.id,confirmed:true});
let server:Server,url:string,current:Dataset|null,readError:unknown,historyError:unknown,rpcError:unknown,rpcThrow:unknown,commitThenDisconnect:boolean,role:string,valid:boolean;
let app:ReturnType<typeof createApp>;
let rpcStatus:number;
let info:ReturnType<typeof vi.spyOn>,errors:ReturnType<typeof vi.spyOn>,rpc:ReturnType<typeof vi.fn>;
const logs=()=>info.mock.calls.flat().filter((v):v is string=>typeof v==='string').map(v=>JSON.parse(v));
const failures=()=>errors.mock.calls.flat().filter((v):v is string=>typeof v==='string').map(v=>JSON.parse(v));
const publish=(payload=body(),headers:Record<string,string>={})=>fetch(url+'/api/import?ignored='+marker,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+marker,...headers},body:JSON.stringify(payload)});

beforeEach(async()=>{
 info=vi.spyOn(console,'info').mockImplementation(()=>{});errors=vi.spyOn(console,'error').mockImplementation(()=>{});
 readError=historyError=rpcError=rpcThrow=null;commitThenDisconnect=false;role='admin';valid=true;rpcStatus=400;
 current=validateBase(COST_HEADERS,[row(20,90)],'2026-10-16','prior.xlsx');
 rpc=vi.fn(async(_name:string,args:{new_payload:Dataset})=>{
  if(rpcThrow)throw rpcThrow;
  if(rpcError)return {error:rpcError,status:rpcStatus};
  current=args.new_payload;
  if(commitThenDisconnect)throw new TypeError(marker,{cause:{code:'UND_ERR_HEADERS_TIMEOUT'}});
  return {error:null,status:204};
 });
 const client={
  auth:{getUser:async()=>({data:{user:valid?{id:'00000000-0000-4000-8000-000000000001'}:null},error:null})},
  from:(table:string)=>({select:()=>({
   eq:()=>({maybeSingle:async()=>table==='retention_roles'?{data:{role},error:null}:{data:{payload:current},error:readError}}),
   limit:async()=>({data:[],error:historyError,status:historyError?400:200}),
  })}),rpc,
 } as unknown as ReturnType<typeof store.supabaseAdmin>;
 vi.spyOn(store,'supabaseAdmin').mockReturnValue(client);
 vi.spyOn(store,'readDataset').mockImplementation(async()=>{if(readError)throw readError;return current;});
 vi.spyOn(store,'saveDataset').mockImplementation((ds,local,expectedId,actor,trace)=>saveWithRealStore(ds,local,expectedId,actor,trace,client));
 app=createApp(false,()=>new Date('2026-11-09T20:01:08.822Z'));
 server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.on('listening',resolve));url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterEach(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));vi.restoreAllMocks();});

it('aviso Forwarded não interrompe validação 200 nem publicação 200 de 15 colunas',async()=>{
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+marker,Forwarded:'for=203.0.113.1','X-Forwarded-For':'203.0.113.1'};
 const validated=await fetch(url+'/api/validate',{method:'POST',headers,body:JSON.stringify({...body(),asOf:'2026-11-09'})});
 expect(validated.status).toBe(200);
 expect(errors.mock.calls.flat().some(v=>(v as {code?:string})?.code==='ERR_ERL_FORWARDED_HEADER')).toBe(true);
 expect(errors.mock.calls.flat().some(v=>(v as {code?:string})?.code==='ERR_ERL_UNEXPECTED_X_FORWARDED_FOR')).toBe(true);
 const response=await publish(body(),headers);expect(response.status).toBe(200);
 expect((await response.json()).records[0]).toMatchObject({costCents:3000,cents:10000});
 expect(rpc).toHaveBeenCalledTimes(1);
 expect(logs().some(v=>v.event==='retention_import_persisted')).toBe(true);
 expect(logs().at(-1)).toMatchObject({event:'retention_import_finished',stage:'respond',status:200});
});

it.each(['57014','42501','PGRST202'])('registra código %s de falha RPC sem expor mensagem, detalhes, token ou planilha',async code=>{
 const priorId=current!.id;rpcError={code,message:marker,details:marker,hint:marker};
 const response=await publish();expect(response.status).toBe(500);expect(await response.text()).not.toContain(marker);
 expect(current!.id).toBe(priorId);
 expect(failures()).toEqual([expect.objectContaining({event:'retention_import_failed',stage:'replace_rpc',code})]);
 expect(logs()).toContainEqual(expect.objectContaining({event:'retention_import_backend_response',stage:'replace_rpc',backendStatus:400}));
 const importId=response.headers.get('x-retention-import-id');expect(importId).toMatch(/^[\da-f-]{36}$/);
 for(const entry of [...logs(),...failures()]){
  expect(entry.importId).toBe(importId);
  expect(entry.elapsedMs).toBeGreaterThanOrEqual(0);expect(entry.rssMiB).toBeGreaterThan(0);
  expect(Object.keys(entry).every(key=>['event','importId','stage','elapsedMs','stageMs','rssMiB','heapUsedMiB','code','errorClass','backendStatus','status'].includes(key))).toBe(true);
 }
 expect(JSON.stringify([...logs(),...failures()])).not.toContain(marker);
 expect(JSON.stringify([...logs(),...failures()])).not.toContain('00000000-0000-4000-8000-000000000001');
 expect(logs().some(v=>v.event==='retention_import_persisted')).toBe(false);
});

it('diferencia falha de leitura da base e não tenta a RPC',async()=>{
 readError={code:'57014',message:marker};expect((await publish()).status).toBe(500);
 expect(rpc).not.toHaveBeenCalled();expect(failures()[0]).toMatchObject({stage:'read_current',code:'57014'});
});
it('preserva código original do preflight de histórico e retorna 503 sem gravar',async()=>{
 historyError={code:'42703',message:marker};expect((await publish()).status).toBe(503);
 expect(rpc).not.toHaveBeenCalled();expect(failures()[0]).toMatchObject({stage:'history_preflight',code:'42703'});
});
it('preserva conflito 409 e seu SQLSTATE sem alterar a base',async()=>{
 const priorId=current!.id;rpcError={code:'P0001',message:'CONFLICT '+marker};expect((await publish()).status).toBe(409);
 expect(current!.id).toBe(priorId);expect(failures()[0]).toMatchObject({stage:'replace_rpc',code:'P0001'});
});
it('distingue timeout de transporte e não inventa um SQLSTATE',async()=>{
 rpcThrow=new TypeError(marker,{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});expect((await publish()).status).toBe(500);
 expect(failures()[0]).toMatchObject({stage:'replace_rpc',code:'UND_ERR_CONNECT_TIMEOUT'});
 expect(JSON.stringify(failures())).not.toContain(marker);
});
it('registra status zero do SDK como ausência de resposta HTTP sem expor detalhes de fetch',async()=>{
 rpcError={code:'',message:marker,details:marker};rpcStatus=0;
 expect((await publish()).status).toBe(500);
 expect(logs()).toContainEqual(expect.objectContaining({stage:'replace_rpc',backendStatus:0}));
 expect(failures()[0]).toMatchObject({stage:'replace_rpc',code:'UNCLASSIFIED',errorClass:'BackendError'});
 expect(JSON.stringify([...logs(),...failures()])).not.toContain(marker);
});
it('500 após perda da confirmação pode coexistir com gravação completa: não faz retry automático',async()=>{
 const priorId=current!.id;commitThenDisconnect=true;expect((await publish()).status).toBe(500);
 expect(current!.id).not.toBe(priorId);expect(current!.records[0].costCents).toBe(3000);expect(rpc).toHaveBeenCalledTimes(1);
 expect(failures()[0]).toMatchObject({stage:'replace_rpc',code:'UND_ERR_HEADERS_TIMEOUT'});
 expect(logs().some(v=>v.event==='retention_import_persisted')).toBe(false);
});
it('marca persistência reconhecida antes de uma falha simulada na resposta',async()=>{
 const priorId=current!.id,send=app.response.json;
 vi.spyOn(app.response,'json').mockImplementation(function(this:Response,value:unknown){
  if(value&&typeof value==='object'&&'records' in value)throw new Error(marker);
  return send.call(this,value);
 });
 expect((await publish()).status).toBe(500);expect(current!.id).not.toBe(priorId);expect(rpc).toHaveBeenCalledTimes(1);
 expect(logs().some(v=>v.event==='retention_import_persisted')).toBe(true);
 expect(failures()[0]).toMatchObject({stage:'respond',code:'UNCLASSIFIED'});
 expect(JSON.stringify(failures())).not.toContain(marker);
});
it('identifica corpo acima de 4 MB antes da autenticação sem tentar a RPC',async()=>{
 const response=await publish({...body(),padding:'x'.repeat(4*1024*1024)} as ReturnType<typeof body>);
 expect(response.ok).toBe(false);expect(rpc).not.toHaveBeenCalled();
 expect(failures()[0]).toMatchObject({stage:'body',code:'BODY_TOO_LARGE'});
});
it('preserva autenticação 401 e autorização 403 sem tentar persistência',async()=>{
 valid=false;expect((await publish()).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
 valid=true;role='viewer';expect((await publish()).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
});
it('mantém o rate limit de 120 e não permite contorná-lo trocando cabeçalhos de proxy',async()=>{
 for(let n=0;n<120;n++)expect((await fetch(url+'/api/auth/config',{headers:{Forwarded:`for=203.0.113.${n}`,'X-Forwarded-For':`203.0.113.${n}`}})).status).toBe(200);
 expect((await fetch(url+'/api/auth/config',{headers:{'X-Forwarded-For':'198.51.100.1'}})).status).toBe(429);
 expect(rpc).not.toHaveBeenCalled();
});

it('valida o lote de 18.031 linhas e identifica a falha simulada apenas na RPC',async()=>{
 const rows=Array.from({length:18031},(_,i)=>row(30,100,i<499?'2026-08-31':null,'SINT-'+i));
 const payload={...body(),rows};
 const validated=await fetch(url+'/api/validate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+marker},body:JSON.stringify({...payload,asOf:'2026-11-09'})});
 expect(validated.status).toBe(200);expect((await validated.json()).audit).toMatchObject({sourceRows:18031,validRows:17532,quarantinedRows:499});
 rpcError={code:'57014',message:marker};expect((await publish(payload)).status).toBe(500);
 expect(failures()[0]).toMatchObject({stage:'replace_rpc',code:'57014'});
 expect(JSON.stringify([...logs(),...failures()])).not.toContain(marker);
},20000);
