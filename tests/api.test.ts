import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createApp} from '../server/app';
import {HEADERS} from '../src/lib/domain';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import type {Server} from 'node:http';
let server:Server,url:string,cookie:string,dir:string;
beforeAll(async()=>{dir=await mkdtemp(tmpdir()+'/retention-api-');process.env.LOCAL_DATA_DIR=dir;server=createApp(true).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;});
afterAll(async()=>{server.close();await rm(dir,{recursive:true,force:true});});
describe('Proteção da API',()=>{
 it('abre leitura pública sem sessão e mantém gravação compartilhada protegida',async()=>{expect((await fetch(url+'/api/public/dataset')).status).toBe(200);expect((await fetch(url+'/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(401);});
 it('nega dados e exportação sem autenticação',async()=>{expect((await fetch(url+'/api/dataset')).status).toBe(401);expect((await fetch(url+'/api/export/xlsx',{method:'POST'})).status).toBe(401);});
 it('bloqueia origem externa no modo local',async()=>{expect((await fetch(url+'/api/auth/local',{method:'POST',headers:{Origin:'https://externo.example'}})).status).toBe(403);});
 it('autentica sessão HttpOnly e importa base sem paciente',async()=>{const auth=await fetch(url+'/api/auth/local',{method:'POST'});cookie=auth.headers.get('set-cookie')!.split(';')[0];expect(auth.headers.get('set-cookie')).toContain('HttpOnly');const body={headers:HEADERS,rows:[['EMPRESA','A','2026-01-01','Eletiva','Cliente','SP','Hospital','SP','Médico','SEGREDO PACIENTE','Rep',null,null,100]],asOf:'2026-09-30',fileName:'base.xlsx',expectedId:null,confirmed:true};const result=await fetch(url+'/api/import',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});expect(result.status).toBe(200);const dataset=await result.json();expect(JSON.stringify(dataset)).not.toContain('SEGREDO PACIENTE');expect(dataset.audit.totalCents).toBe(10000);const duplicate=await fetch(url+'/api/import',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({...body,expectedId:dataset.id})});expect(duplicate.status).toBe(409);});
 it('desativa totalmente modo local na Vercel',()=>{process.env.VERCEL='1';expect(()=>createApp(true)).toThrow('proibido');delete process.env.VERCEL;});
});
