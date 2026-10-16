import {it,expect,vi} from 'vitest';
import {createApp} from '../server/app';
import * as store from '../server/store';
import {HEADERS,validateBase,type Dataset} from '../src/lib/domain';
it('republicação explícita enriquece auditoria legada sem duplicar finanças e continua rejeitando repetição idêntica',async()=>{
 const rows=[['A','001','2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico',null,'Representante','2026-08-01','Nota',30],['A','002','2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico',null,'Representante',null,null,100]];
 let current=validateBase([...HEADERS],rows,'2026-10-16','oficial.xlsx');delete current.auditRecords;const old=current;
 vi.spyOn(store,'readDataset').mockImplementation(async()=>current);const saved=vi.spyOn(store,'saveDataset').mockImplementation(async next=>{current=next;});
 const app=createApp(true),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 try{const auth=await fetch(url+'/api/auth/local',{method:'POST'}),cookie=auth.headers.get('set-cookie')!.split(';')[0];
  const body={headers:HEADERS,rows,asOf:'2026-10-16',confirmedAsOf:'2026-10-16',fileName:'oficial.xlsx',confirmed:true,expectedId:old.id};
  const response=await fetch(url+'/api/import',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});expect(response.status).toBe(200);const enriched=await response.json() as Dataset;
  expect(enriched.records).toEqual(old.records);expect(enriched.audit.quarantinedRows).toBe(old.audit.quarantinedRows);expect(enriched.auditRecords![0].cells[1]).toBe('001');expect(old.auditRecords).toBeUndefined();expect(saved).toHaveBeenCalledTimes(1);
  const duplicate=await fetch(url+'/api/import',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({...body,expectedId:enriched.id})});expect(duplicate.status).toBe(409);expect(saved).toHaveBeenCalledTimes(1);
 }finally{server.close();vi.restoreAllMocks();}
});
