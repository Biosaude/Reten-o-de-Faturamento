import {useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {adminRequest,type AdminSession} from '../lib/api';
import {signInAdmin,type AuthConfig} from '../lib/admin-auth';

export function AdminAccess({session,onSession,disabled}:{session:AdminSession|null;onSession:(session:AdminSession|null)=>void;disabled:boolean}){
 const [open,setOpen]=useState(false),[config,setConfig]=useState<AuthConfig|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const client=useRef<SupabaseClient|null>(null),unsubscribe=useRef<(()=>void)|null>(null),current=useRef(session);
 current.current=session;
 useEffect(()=>()=>{unsubscribe.current?.();client.current?.auth.stopAutoRefresh();},[]);
 async function show(){setOpen(true);setBusy(true);setError('');try{setConfig(await adminRequest<AuthConfig>('/auth/config',null));}catch{setError('Não foi possível carregar o acesso administrativo.');}finally{setBusy(false);}}
 async function login(){if(!config)return;setBusy(true);setError('');try{
  const result=await signInAdmin(config,email.trim(),password);client.current=result.client;current.current=result.session;onSession(result.session);setOpen(false);
  if(result.client){const {data}=result.client.auth.onAuthStateChange((event,next)=>{
   if(event==='SIGNED_OUT'){current.current=null;onSession(null);}
   if(event==='TOKEN_REFRESHED'&&next&&current.current){const refreshed={...current.current,accessToken:next.access_token};current.current=refreshed;onSession(refreshed);}
  });unsubscribe.current=()=>data.subscription.unsubscribe();}
 }catch(e){setError(e instanceof Error?e.message:'Não foi possível entrar.');}finally{setPassword('');setBusy(false);}}
 async function logout(){setBusy(true);setError('');try{unsubscribe.current?.();unsubscribe.current=null;await client.current?.auth.signOut({scope:'local'});await adminRequest('/auth/logout',session,{method:'POST'});}catch{setError('Sessão encerrada neste navegador. Não foi possível confirmar a saída no servidor.');}finally{client.current?.auth.stopAutoRefresh();client.current=null;current.current=null;onSession(null);setBusy(false);}}
 return <div className="admin-access">
  {session?<div className="admin-session"><span>Administrador: {session.email}</span><button disabled={disabled||busy} onClick={()=>void logout()}>Sair</button></div>:<button disabled={disabled||busy} aria-expanded={open} aria-controls="admin-login" onClick={()=>open?setOpen(false):void show()}>Acesso administrativo</button>}
  {open&&!session&&<form id="admin-login" className="admin-login" onSubmit={e=>{e.preventDefault();void login();}}>
   <p>Use sua conta autorizada para atualizar a base compartilhada.</p>
   {config?.local?<p>Ambiente local de desenvolvimento.</p>:<><label>E-mail administrativo<input type="email" autoComplete="username" required value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label></>}
   <button disabled={busy||!config||disabled} type="submit">{busy?'Aguarde…':config?.local?'Entrar no ambiente local':'Entrar'}</button>
  </form>}
  {error&&<p className="base-feedback error" role="alert">{error}</p>}
 </div>;
}
