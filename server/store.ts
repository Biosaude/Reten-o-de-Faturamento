import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import type { Dataset } from '../src/lib/domain.js';
const localDir=()=>resolve(process.env.LOCAL_DATA_DIR||'.local');
export function supabaseAdmin(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Configure um projeto Supabase independente antes de publicar.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function encryptionKey(){
 await fs.mkdir(localDir(),{recursive:true,mode:0o700});const file=resolve(localDir(),'encryption.key');
 try{return await fs.readFile(file);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const key=randomBytes(32);await fs.writeFile(file,key,{mode:0o600,flag:'wx'});return key;}
}
export async function readDataset(local:boolean):Promise<Dataset|null>{
 if(local){try {const data=await fs.readFile(resolve(localDir(),'dataset.enc'));const cipher=createDecipheriv('aes-256-gcm',await encryptionKey(),data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
 const {data,error}=await supabaseAdmin().from('retention_current').select('payload').eq('singleton',true).maybeSingle();if(error)throw error;return data?.payload??null;
}
let writing=false;
export async function saveDataset(ds:Dataset,local:boolean,expectedId:string|null,actor:string){
 if(local){if(writing)throw new Error('CONFLICT');writing=true;try {const current=await readDataset(true);if((current?.id??null)!==expectedId)throw new Error('CONFLICT');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(ds)),cipher.final()]);const temp=resolve(localDir(),`${ds.id}.tmp`);await fs.writeFile(temp,Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{mode:0o600});await fs.rename(temp,resolve(localDir(),'dataset.enc'));}finally{writing=false;}return;}
 const {error}=await supabaseAdmin().rpc('replace_retention_dataset',{new_payload:ds,expected_id:expectedId,actor_id:actor});if(error){if(error.message.includes('CONFLICT'))throw new Error('CONFLICT');throw error;}
}
