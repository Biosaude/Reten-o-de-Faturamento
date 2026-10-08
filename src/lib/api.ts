export async function request<T>(path:string):Promise<T>{
 const res=await fetch('/api'+path,{credentials:'omit'});
 if(!res.ok)throw new Error('Não foi possível carregar a base compartilhada. Você pode selecionar uma planilha nesta sessão.');
 return res.json();
}
