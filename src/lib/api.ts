import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let sb:SupabaseClient|null=null;
export async function authConfig(){const cfg=await request<{local:boolean;supabaseUrl:string|null;anonKey:string|null}>('/auth/config');if(!cfg.local&&cfg.supabaseUrl&&cfg.anonKey)sb=createClient(cfg.supabaseUrl,cfg.anonKey,{auth:{persistSession:false}});return cfg;}
export async function login(email:string,password:string){if(!sb)throw new Error('Configure o projeto Supabase independente no servidor.');const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw new Error('E-mail ou senha inválidos.');}
export async function logout(){if(sb)await sb.auth.signOut();await request('/auth/logout',{method:'POST'});}
export async function request<T=unknown>(path:string,options:RequestInit={}):Promise<T>{
 const token=(await sb?.auth.getSession())?.data.session?.access_token;
 const res=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{}) ,...options.headers}});
 if(!res.ok){const message=await res.json().catch(()=>({error:'Operação indisponível.'}));throw new Error(message.error||'Operação indisponível.');}
 if(res.status===204)return undefined as T;return res.json();
}
export async function downloadReport(format:'xlsx'|'pdf',filters:unknown){
 const token=(await sb?.auth.getSession())?.data.session?.access_token;
 const res=await fetch('/api/export/'+format,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(filters)});
 if(!res.ok){const message=await res.json();throw new Error(message.error);}
 const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`retencao.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
