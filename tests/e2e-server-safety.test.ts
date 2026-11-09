import {it,expect} from 'vitest';
import {mkdtemp,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
const run=(directory:string,extra:Record<string,string>={})=>execute(process.execPath,['--import','tsx','scripts/e2e-server.ts'],{
 env:{PATH:process.env.PATH,TMPDIR:tmpdir(),LOCAL_DATA_DIR:directory,NODE_ENV:'test',...extra},timeout:10000,
});
it('recusa armazenamento compartilhado antes de tocar nos arquivos existentes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'retention-shared-'));
 try{
  await writeFile(join(directory,'dataset.enc'),'sentinela-sem-dados-financeiros');
  await expect(run(directory)).rejects.toMatchObject({code:1,stderr:expect.stringContaining('diretório temporário exclusivo')});
  expect(await readFile(join(directory,'dataset.enc'),'utf8')).toBe('sentinela-sem-dados-financeiros');
  expect(await readdir(directory)).toEqual(['dataset.enc']);
 }finally{await rm(directory,{recursive:true,force:true});}
});
it('recusa qualquer configuração Supabase antes de iniciar ou persistir dados',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'retention-e2e-safety-'));
 try{
  await expect(run(directory,{SUPABASE_URL:'https://never-contact.invalid',SUPABASE_SERVICE_ROLE_KEY:'fictitious-never-send'})).rejects.toMatchObject({code:1,stderr:expect.stringContaining('Credenciais Supabase proibidas')});
  expect(await readdir(directory)).toEqual([]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
