import express from 'express';
import {realpath,access} from 'node:fs/promises';
import {basename,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server/app';
import {saveDataset} from '../server/store';
import {syntheticDataset} from '../tests/e2e/synthetic-data';

// This helper refuses all shared/development paths, even when invoked manually.
const dir=await realpath(process.env.LOCAL_DATA_DIR??'');
if(dirname(dir)!==await realpath(tmpdir())||!basename(dir).startsWith('retention-e2e-'))throw new Error('E2E exige diretório temporário exclusivo.');
if(process.env.SUPABASE_URL||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY)throw new Error('Credenciais Supabase proibidas no servidor E2E.');
try{await access(resolve(dir,'dataset.enc'));}catch(error){
 if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
 await saveDataset(syntheticDataset(),true,null,'e2e-synthetic');
}
const app=createApp(true);
app.use(express.static(resolve('dist')));
app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
const server=app.listen(0,'127.0.0.1',()=>process.send?.({port:(server.address() as {port:number}).port}));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('disconnect',()=>server.close(()=>process.exit(0)));
