import {it,expect,vi} from 'vitest';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {HEADERS,validateBase} from '../src/lib/domain';
import {saveDataset,readDataset,readAuditVersions,readAuditVersion} from '../server/store';
it('arquivo local cifrado publica estado e histórico juntos, preservando versão anterior e conflito',async()=>{
 const dir=await mkdtemp(tmpdir()+'/retention-local-history-');vi.stubEnv('LOCAL_DATA_DIR',dir);
 try{
  const row=['A','001','2026-09-01','Eletiva','Cliente','SP','Hospital','SP','Médico','PACIENTE REMOVER','Representante',null,null,100];
  const a=validateBase([...HEADERS],[row],'2026-10-09','a.xlsx'),b=validateBase([...HEADERS],[row],'2026-10-16','b.xlsx');
  await saveDataset(a,true,null,'local');await saveDataset(b,true,a.id,'local');expect((await readDataset(true))!.id).toBe(b.id);expect((await readAuditVersions(true)).map(v=>v.id)).toEqual([b.id,a.id]);expect((await readAuditVersion(a.id,true))!.asOf).toBe('2026-10-09');
  await expect(saveDataset(a,true,a.id,'local')).rejects.toThrow('CONFLICT');expect((await readDataset(true))!.asOf).toBe('2026-10-16');expect((await stat(dir+'/dataset.enc')).mode&0o777).toBe(0o600);
 }finally{vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
});
