export async function request<T>(path:string):Promise<T>{
 const res=await fetch('/api'+path,{credentials:'omit'});
 if(!res.ok)throw new Error('Não foi possível carregar a base compartilhada. Você pode selecionar uma planilha nesta sessão.');
 return res.json();
}

export type AdminSession={role:'admin';email:string;local:boolean;accessToken?:string};
export async function adminRequest<T>(path:string,session:AdminSession|null,options:RequestInit={}):Promise<T>{
 const headers=new Headers(options.headers);
 if(session?.accessToken)headers.set('Authorization',`Bearer ${session.accessToken}`);
 if(options.body)headers.set('Content-Type','application/json');
 const res=await fetch('/api'+path,{...options,headers,credentials:session?.local?'same-origin':'omit'});
 if(!res.ok){const body=await res.json().catch(()=>null);throw new Error(body?.error??'Não foi possível concluir a operação administrativa.');}
 return res.status===204?undefined as T:res.json();
}
