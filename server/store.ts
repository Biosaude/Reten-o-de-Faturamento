import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import type { Dataset } from '../src/lib/domain.js';
import {normalizeAudit,type AuditVersionInfo} from '../src/lib/audit.js';
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
type LocalState={current:Dataset|null;versions:Dataset[]};
async function readLocalState():Promise<LocalState>{
 try {const data=await fs.readFile(resolve(localDir(),'dataset.enc'));const cipher=createDecipheriv('aes-256-gcm',await encryptionKey(),data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));const value=JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());return 'current' in value?value:{current:value,versions:[normalizeAudit(value)]};}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {current:null,versions:[]};throw e;}
}
export async function readDataset(local:boolean):Promise<Dataset|null>{
 if(local)return (await readLocalState()).current;
 const {data,error}=await supabaseAdmin().from('retention_current').select('payload').eq('singleton',true).maybeSingle();if(error)throw error;return data?.payload??null;
}
export async function readAuditVersions(local:boolean):Promise<AuditVersionInfo[]>{
 if(local)return (await readLocalState()).versions.map(ds=>({id:ds.id,asOf:ds.asOf,updatedAt:ds.updatedAt,fileName:ds.fileName,audit:ds.audit,available:true})).reverse();
 const sb=supabaseAdmin();
 const [{data:archives,error},{data:imports,error:importError}]=await Promise.all([sb.from('retention_audit_versions').select('dataset_id,as_of,source_file,published_at,payload->audit').order('published_at',{ascending:false}),sb.from('retention_imports').select('dataset_id,source_file,imported_at,audit').order('imported_at',{ascending:false})]);
 if(error||importError)throw new Error('AUDIT_HISTORY_UNAVAILABLE');
 const versions=new Map<string,AuditVersionInfo>();
 for(const r of imports??[])versions.set(r.dataset_id,{id:r.dataset_id,asOf:null,updatedAt:r.imported_at,fileName:r.source_file,audit:r.audit,available:false});
 for(const r of archives??[])versions.set(r.dataset_id,{id:r.dataset_id,asOf:r.as_of,updatedAt:r.published_at,fileName:r.source_file,audit:r.audit as Dataset['audit'],available:true});
 return [...versions.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
export async function readAuditVersion(id:string,local:boolean):Promise<Dataset|null>{
 if(local)return (await readLocalState()).versions.find(ds=>ds.id===id)??null;
 const {data,error}=await supabaseAdmin().from('retention_audit_versions').select('payload').eq('dataset_id',id).maybeSingle();if(error)throw new Error('AUDIT_HISTORY_UNAVAILABLE');return data?.payload??null;
}
let writing=false;
export async function saveDataset(ds:Dataset,local:boolean,expectedId:string|null,actor:string){
 if(local){if(writing)throw new Error('CONFLICT');writing=true;try {const state=await readLocalState();const current=state.current;if((current?.id??null)!==expectedId)throw new Error('CONFLICT');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify({current:ds,versions:[...new Map([...state.versions,...(current?[normalizeAudit(current)]:[]),normalizeAudit(ds)].map(v=>[v.id,v])).values()]})),cipher.final()]);const temp=resolve(localDir(),`${ds.id}.tmp`);await fs.writeFile(temp,Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{mode:0o600});await fs.rename(temp,resolve(localDir(),'dataset.enc'));}finally{writing=false;}return;}
 const sb=supabaseAdmin();const readiness=await sb.from('retention_audit_versions').select('dataset_id,financial_complete').limit(1);if(readiness.error)throw new Error('AUDIT_HISTORY_UNAVAILABLE');
 const {error}=await sb.rpc('replace_retention_dataset',{new_payload:ds,expected_id:expectedId,actor_id:actor});if(error){if(error.message.includes('CONFLICT'))throw new Error('CONFLICT');throw error;}
}

export type FinancialVersionInfo=Pick<AuditVersionInfo,'id'|'asOf'|'updatedAt'>;
const complete=(ds:Dataset)=>ds.records.length===ds.audit.validRows&&ds.audit.validRows>0;
export async function readFinancialVersions(local:boolean):Promise<FinancialVersionInfo[]>{
 if(local)return (await readLocalState()).versions.filter(complete).map(({id,asOf,updatedAt})=>({id,asOf,updatedAt})).reverse();
 const {data,error}=await supabaseAdmin().from('retention_audit_versions').select('dataset_id,as_of,published_at').eq('financial_complete',true).order('published_at',{ascending:false});
 if(error)throw new Error('AUDIT_HISTORY_UNAVAILABLE');return (data??[]).map(r=>({id:r.dataset_id,asOf:r.as_of,updatedAt:r.published_at}));
}
export async function readFinancialVersion(id:string,local:boolean):Promise<Dataset|null>{
 if(local){const ds=(await readLocalState()).versions.find(v=>v.id===id);return ds&&complete(ds)?ds:null;}
 const {data,error}=await supabaseAdmin().from('retention_audit_versions').select('payload').eq('dataset_id',id).eq('financial_complete',true).maybeSingle();
 if(error)throw new Error('AUDIT_HISTORY_UNAVAILABLE');return data?.payload&&complete(data.payload)?data.payload:null;
}
