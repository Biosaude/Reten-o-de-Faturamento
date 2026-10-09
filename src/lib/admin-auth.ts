import type {SupabaseClient} from '@supabase/supabase-js';
import {adminRequest,type AdminSession} from './api';
export type AuthConfig={local:boolean;supabaseUrl:string|null;anonKey:string|null};
export async function signInAdmin(config:AuthConfig,email:string,password:string):Promise<{session:AdminSession;client:SupabaseClient|null}>{
 if(config.local){
  await adminRequest('/auth/local',{role:'admin',email:'Desenvolvimento local',local:true},{method:'POST'});
  return {session:{role:'admin',email:'Desenvolvimento local',local:true},client:null};
 }
 if(!config.supabaseUrl||!config.anonKey)throw new Error('Acesso administrativo indisponível. Configure a autenticação Supabase no servidor.');
 const {createClient}=await import('@supabase/supabase-js');
 const client=createClient(config.supabaseUrl,config.anonKey,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
 const {data,error}=await client.auth.signInWithPassword({email,password});
 if(error||!data.session){client.auth.stopAutoRefresh();throw new Error('E-mail ou senha inválidos, ou autenticação indisponível.');}
 const session:AdminSession={role:'admin',email:data.user?.email??email,local:false,accessToken:data.session.access_token};
 try{
  const identity=await adminRequest<{role:string}>('/me',session);
  if(identity.role!=='admin')throw new Error('Seu usuário não possui permissão administrativa neste dashboard.');
  return {session,client};
 }catch(error){await client.auth.signOut({scope:'local'}).catch(()=>{});client.auth.stopAutoRefresh();throw error;}
}
