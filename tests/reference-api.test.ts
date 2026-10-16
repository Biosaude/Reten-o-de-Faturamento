import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import type {Server} from 'node:http';
import ExcelJS from 'exceljs';
import {createApp} from '../server/app';
import * as store from '../server/store';
import {HEADERS,validateBase,defaultFilters} from '../src/lib/domain';
let server:Server,url:string,cookie:string;
const row=(amount:number,billing:string|null)=>['A','PARCIAL','2026-01-01','Eletiva','Cliente','SP','Hospital','SP','Médico',null,'Representante',billing,null,amount];
beforeAll(async()=>{
 const ds=validateBase([...HEADERS],[row(100,'2026-10-10'),row(200,null)],'2026-10-16','ficticia.xlsx');vi.spyOn(store,'readDataset').mockResolvedValue(ds);
 server=createApp(true).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const auth=await fetch(url+'/api/auth/local',{method:'POST'});cookie=auth.headers.get('set-cookie')!.split(';')[0];
});
afterAll(()=>{server?.close();vi.restoreAllMocks();});
it('API pública e administrativa fornecem o mesmo corte sem confundir atualização',async()=>{
 const publicRes=await fetch(url+'/api/public/dataset');expect(publicRes.headers.get('cache-control')).toBe('no-store');const shared=await publicRes.json();const privateRes=await fetch(url+'/api/dataset',{headers:{Cookie:cookie}});const admin=await privateRes.json();
 expect(shared.asOf).toBe('2026-10-16');expect(admin.asOf).toBe(shared.asOf);expect(shared.updatedAt).toBe(admin.updatedAt);expect((await fetch(url+'/api/dataset')).status).toBe(401);
});
it('exportação aceita posição dinâmica ou data específica e não descarta o filtro de referência',async()=>{
 for(const [filters,amount] of [[defaultFilters(),200],[{...defaultFilters(),referenceDate:'2026-10-09'},300]] as const){
  const response=await fetch(url+'/api/export/xlsx',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(filters)});expect(response.status).toBe(200);const book=new ExcelJS.Workbook();await book.xlsx.load(await response.arrayBuffer());expect(book.getWorksheet('Resumo')!.getCell('B6').value).toBe(amount);
 }
 const bad=await fetch(url+'/api/export/xlsx',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({...defaultFilters(),referenceDate:'2026-02-31'})});expect(bad.status).toBe(400);
});
