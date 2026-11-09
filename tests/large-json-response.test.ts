import {afterEach,it,expect,vi} from 'vitest';
import express from 'express';
import {createServer,request as httpRequest,type Server} from 'node:http';
import {once} from 'node:events';
import {gunzipSync} from 'node:zlib';
import {largeJsonResponse} from '../server/large-json-response';
import * as transport from '../server/large-json-response';
import {createApp} from '../server/app';
import * as store from '../server/store';
import {COST_HEADERS,type Dataset} from '../src/lib/domain';
import {isDeepStrictEqual} from 'node:util';

const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.map(server=>new Promise<void>(done=>server.close(()=>done()))));servers.length=0;vi.restoreAllMocks();});
const large={id:'synthetic-only',records:[{cents:12345,costCents:3333,note:'x'.repeat(5_000_000)}]};
async function start(fixed:boolean,value:unknown=large){
 const app=express();if(fixed)app.use(largeJsonResponse);
 app.get('/',(_req,res)=>res.json(value));const server=app.listen(0,'127.0.0.1');servers.push(server);await once(server,'listening');
 return `http://127.0.0.1:${(server.address() as {port:number}).port}`;
}
function raw(url:string,acceptEncoding:string){return new Promise<{status:number;headers:import('node:http').IncomingHttpHeaders;body:Buffer}>((resolve,reject)=>{
 const request=httpRequest(url,{headers:{'Accept-Encoding':acceptEncoding}},res=>{const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body:Buffer.concat(chunks)}));});request.on('error',reject);request.end();
});}
async function capped(url:string){
 // Isolated model of the stated buffered-response limit; never a real Vercel deployment.
 const gateway=createServer((req,res)=>{
  const upstreamRequest=httpRequest(url+req.url,{method:req.method,headers:{...req.headers,host:new URL(url).host,'Accept-Encoding':'gzip'}},upstream=>{
   const chunks:Buffer[]=[];upstream.on('data',chunk=>chunks.push(chunk));upstream.on('end',()=>{
    const body=Buffer.concat(chunks);
    if(body.length>4_500_000){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'SIMULATED_RESPONSE_SIZE_LIMIT'}));}
    else{res.writeHead(upstream.statusCode!,upstream.headers);res.end(body);}
   });
  });req.pipe(upstreamRequest);
 });servers.push(gateway);gateway.listen(0,'127.0.0.1');await once(gateway,'listening');return `http://127.0.0.1:${(gateway.address() as {port:number}).port}`;
}
it('reproduz resposta acima de 4,5 MB e preserva o mesmo JSON após correção sob o limite',async()=>{
 const old=await capped(await start(false));expect((await fetch(old)).status).toBe(500);
 const fixed=await capped(await start(true));const response=await fetch(fixed);
 expect(response.status).toBe(200);expect(response.headers.get('content-encoding')).toBe('gzip');expect(Number(response.headers.get('content-length'))).toBeLessThan(4_500_000);
 expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
 expect(await response.json()).toEqual(large);
});
it('mantém JSON pequeno sem alterar codificação nem conteúdo',async()=>{
 const response=await raw(await start(true,{ok:true}),'gzip');expect(response.status).toBe(200);expect(response.headers['content-encoding']).toBeUndefined();expect(response.body.toString()).toBe('{"ok":true}');
});
it('não altera respostas binárias de relatórios',async()=>{
 const binary=Buffer.alloc(4_100_000,1),app=express();app.use(largeJsonResponse);app.get('/',(_req,res)=>res.type('application/pdf').send(binary));
 const server=app.listen(0,'127.0.0.1');servers.push(server);await once(server,'listening');
 const response=await raw(`http://127.0.0.1:${(server.address() as {port:number}).port}`,'gzip');
 expect(response.headers['content-encoding']).toBeUndefined();expect(response.headers['content-type']).toBe('application/pdf');expect(response.body.equals(binary)).toBe(true);
});
it.each(['identity','gzip;q=0, identity;q=1'])('respeita cliente que solicita %s',async encoding=>{
 const response=await raw(await start(true),encoding);expect(response.headers['content-encoding']).toBeUndefined();expect(JSON.parse(response.body.toString())).toEqual(large);
});
it('envia gzip real com negociação e preserva cada centavo após descompressão',async()=>{
 const response=await raw(await start(true),'br, gzip;q=0.8');expect(response.headers['content-encoding']).toBe('gzip');expect(response.headers.vary).toContain('Accept-Encoding');
 expect(JSON.parse(gunzipSync(response.body).toString())).toEqual(large);
});

it('importação autenticada só falha na entrega sem compressão; a correção preserva gravação, JSON e recarga',async()=>{
 let current:Dataset|null=null,writes=0;
 vi.spyOn(store,'supabaseAdmin').mockReturnValue({auth:{getUser:async()=>({data:{user:{id:'00000000-0000-4000-8000-000000000001'}},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'admin'},error:null})})})})} as unknown as ReturnType<typeof store.supabaseAdmin>);
 vi.spyOn(store,'readDataset').mockImplementation(async()=>current);
 vi.spyOn(store,'saveDataset').mockImplementation(async ds=>{current=ds;writes++;});
 const rows=Array.from({length:18031},(_,i)=>['FICTÍCIA','SINT-'+i,'2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico',null,'Rep',i<499?'2026-08-31':null,null,30,100]);
 const body=JSON.stringify({headers:COST_HEADERS,rows,fileName:'synthetic-only.csv',expectedId:null,confirmed:true});expect(Buffer.byteLength(body)).toBeLessThan(4_000_000);
 const headers={'Content-Type':'application/json',Authorization:'Bearer synthetic-only'};
 async function api(){const server=createApp(false,()=>new Date('2026-11-09T15:00:00Z')).listen(0,'127.0.0.1');servers.push(server);await once(server,'listening');return capped(`http://127.0.0.1:${(server.address() as {port:number}).port}`);}
 const disabled=vi.spyOn(transport,'largeJsonResponse').mockImplementation((_req,_res,next)=>next());
 expect((await fetch((await api())+'/api/import',{method:'POST',headers,body})).status).toBe(500);expect(writes).toBe(1);
 disabled.mockRestore();current=null;writes=0;
 const endpoint=await api();const response=await fetch(endpoint+'/api/import',{method:'POST',headers,body});
 expect(response.status).toBe(200);expect(writes).toBe(1);expect(Number(response.headers.get('content-length'))).toBeLessThan(4_500_000);
 const saved=await response.json() as Dataset;
 expect(isDeepStrictEqual(saved,current)).toBe(true);expect(Buffer.byteLength(JSON.stringify(saved))).toBeGreaterThan(4_500_000);
 expect(saved.audit).toMatchObject({sourceRows:18031,validRows:17532,quarantinedRows:499,validCents:17532*10000});
 expect(saved.records.every(r=>r.costCents===3000&&r.cents===10000)).toBe(true);
 const reloaded=await fetch(endpoint+'/api/dataset',{headers});expect(reloaded.status).toBe(200);expect(isDeepStrictEqual((await reloaded.json()).records,saved.records)).toBe(true);
},30000);
