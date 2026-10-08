export const HEADERS = ['Empresa','Agendamento','Data da Cirurgia','Tipo da Cirurgia','Cliente de Faturamento','UF do Cliente','Hospital','UF do Hospital','Médico','Paciente','Representante Principal','Data Faturamento Vale','Nota de Cobrança','Valor total'] as const;
export const DIMENSIONS = {company:'Empresa',type:'Tipo da Cirurgia',customer:'Cliente de Faturamento',customerUF:'UF do Cliente',hospital:'Hospital',hospitalUF:'UF do Hospital',doctor:'Médico',representative:'Representante Principal'} as const;
export type Dimension = keyof typeof DIMENSIONS;
export const BANDS = ['0 a 45 dias','46 a 90 dias','91 a 135 dias','136 a 180 dias','Acima de 180 dias'];
export const COLORS = ['#cbd5e1','#94a3b8','#64748b','#d98686','#b91c1c'];
export const STATUSES = ['Totalmente pendente','Parcialmente faturada','Totalmente faturada'] as const;
export type Status = typeof STATUSES[number];
export type FinancialRecord = Record<Dimension,string> & {id:string;sourceRow:number;appointment:string;surgeryDate:string;billingDate:string|null;note:string;cents:number;key:string};
export type Issue = {row:number;code:string;severity:'error'|'warning';message:string;key?:string};
export type Dataset = {id:string;fileName:string;updatedAt:string;asOf:string;records:FinancialRecord[];issues:Issue[];audit:{sourceRows:number;validRows:number;quarantinedRows:number;totalCents:number;validCents:number;quarantinedCents:number;distinctAppointments:number;repeatedAppointments:number;companies:number;globalCollisions:number;exactDuplicateRows:number;invalidDates:number;billingBeforeSurgery:number;notesWithoutDate:number;inconsistentRecords:number}};
export type Filters = Partial<Record<Dimension,string[]>> & {year:number;quarters:number[];months:number[];statuses:Status[];bands:number[]};
export const defaultFilters = ():Filters => ({year:2026,quarters:[],months:[],statuses:[],bands:[]});
export const keyOf = (company:string,appointment:string) => JSON.stringify([company,appointment]);
export const fmtMoney = (cents:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const fmtNumber = (v:number,decimals=0) => new Intl.NumberFormat('pt-BR',{maximumFractionDigits:decimals}).format(v);
export const isoToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const day = (s:string) => Date.parse(s+'T00:00:00Z')/86400000;
export const daysBetween = (a:string,b:string) => day(b)-day(a);
export const addDays = (s:string,n:number) => new Date((day(s)+n)*86400000).toISOString().slice(0,10);
export const monthEnd = (year:number,month:number) => new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
export const bandOf = (days:number) => {if(days<0||!Number.isFinite(days)) throw new Error('Retenção inválida'); return days<=45?0:days<=90?1:days<=135?2:days<=180?3:4;};
export function normalizeDate(v:unknown):string|null {
 if(v===null||v===undefined||v==='') return null;
 if(v instanceof Date) return Number.isFinite(v.getTime())?v.toISOString().slice(0,10):null;
 if(typeof v==='number') return v>=1&&v<2958466?new Date((Math.floor(v)-25569)*86400000).toISOString().slice(0,10):null;
 const text=String(v).trim(); const m=/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text); const br=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
 if(!m&&!br) return null;
 const [y,mo,d]=m?[+m[1],+m[2],+m[3]]:[+br![3],+br![2],+br![1]];
 const out=new Date(Date.UTC(y,mo-1,d)); return out.getUTCFullYear()===y&&out.getUTCMonth()===mo-1&&out.getUTCDate()===d?out.toISOString().slice(0,10):null;
}
export function moneyCents(v:unknown):number|null {
 if(typeof v!=='string'&&typeof v!=='number') return null;
 let text=String(v).trim().replace(/R\$\s*/g,'').replace(/\s/g,'');
 if(text.includes(',')) text=text.replace(/\./g,'').replace(',','.');
 if(!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
 const negative=text.startsWith('-');const [whole,decimal='']=text.replace(/^-/, '').split('.');
 const magnitude=BigInt(whole)*100n+BigInt((decimal+'00').slice(0,2))+(Number(decimal[2]??'0')>=5?1n:0n);
 const cents=Number(negative?-magnitude:magnitude);return Number.isSafeInteger(cents)?cents:null;
}
const norm=(v:unknown)=>String(v??'').trim();
const headerNorm=(v:unknown)=>norm(v).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\s+/g,' ');
export function validateBase(headers:unknown[], input:unknown[][], asOf:string, fileName:string):Dataset {
 if(headers.length!==14||HEADERS.some((h,i)=>headerNorm(headers[i])!==headerNorm(h))) throw new Error('Arquivo incompatível: são exigidas as 14 colunas oficiais, na ordem A–N. Nenhuma base foi substituída.');
 if(!normalizeDate(asOf)||asOf>isoToday()) throw new Error('Informe uma data de corte válida, sem fechamento futuro.');
 if(input.length>25000) throw new Error('Limite de 25.000 registros por importação.');
 const records:FinancialRecord[]=[]; const issues:Issue[]=[]; let sourceRows=0,totalCents=0,quarantinedCents=0,exactDuplicateRows=0;
 const seen=new Set<string>();const sourceGroups=new Map<string,number>(); const globalIds=new Map<string,Set<string>>();
 input.forEach((r,index)=>{
  if(!r.some(v=>v!==null&&v!==undefined&&v!=='')) return;
  sourceRows++; const row=index+2;
  const company=norm(r[0]).toUpperCase(),appointment=norm(r[1]); const key=keyOf(company,appointment);
  if(company&&appointment){sourceGroups.set(key,(sourceGroups.get(key)||0)+1); const cs=globalIds.get(appointment)||new Set();cs.add(company);globalIds.set(appointment,cs);}
  const cents=moneyCents(r[13]); const surgeryDate=normalizeDate(r[2]);const billingDate=normalizeDate(r[11]);
  const fail=(code:string,message:string)=>issues.push({row,key,code,severity:'error',message});
  if(r.length!==14) fail('columns','Registro com quantidade de colunas incompatível.');
  if(!company||!appointment) fail('identity','Empresa ou agendamento ausente.');
  if(!surgeryDate) fail('surgery_date','Data da cirurgia ausente ou inválida.');
  if(r[11]!==null&&r[11]!==undefined&&norm(r[11])&&!billingDate) fail('billing_date','Data de faturamento inválida; não tratada como pendente.');
  if(surgeryDate&&billingDate&&billingDate<surgeryDate) fail('billing_before_surgery','Faturamento anterior à cirurgia. Registro em quarentena.');
  if(cents===null||cents<0) fail('amount','Valor ausente, inválido ou negativo.');
  if(cents!==null) totalCents+=cents;
  if(norm(r[12])&&!norm(r[11])) issues.push({row,key,code:'note_without_date',severity:'warning',message:'Nota sem data: registro permanece pendente.'});
  // Patient names are intentionally discarded before hashing, storage, UI, and export.
  const fingerprint=JSON.stringify(r.map((v,i)=>i===9?'':v));
  if(seen.has(fingerprint)){exactDuplicateRows++;issues.push({row,key,code:'possible_duplicate',severity:'warning',message:'Possível duplicidade. Registro preservado para conferência.'});}seen.add(fingerprint);
  if(issues.some(i=>i.row===row&&i.severity==='error')) {quarantinedCents+=cents??0;return;}
  records.push({id:`row-${row}`,sourceRow:row,key,company,appointment,surgeryDate:surgeryDate!,billingDate,cents:cents!,note:norm(r[12]),type:norm(r[3])||'Não informado',customer:norm(r[4])||'Não informado',customerUF:norm(r[5]).toUpperCase()||'Não informado',hospital:norm(r[6])||'Não informado',hospitalUF:norm(r[7]).toUpperCase()||'Não informado',doctor:norm(r[8])||'Não informado',representative:norm(r[10])||'Não informado'});
 });
 const groups=groupRecords(records);const badDateKeys=new Set<string>();
 for(const [key,rs] of groups){
  if(new Set(rs.map(r=>r.surgeryDate)).size>1){badDateKeys.add(key);for(const r of rs)issues.push({row:r.sourceRow,key,code:'conflicting_surgery_dates',severity:'error',message:'Datas distintas na mesma cirurgia. Agendamento inteiro em quarentena.'});}
  for(const dim of Object.keys(DIMENSIONS) as Dimension[]) if(new Set(rs.map(r=>r[dim])).size>1) for(const r of rs) issues.push({row:r.sourceRow,key,code:`conflicting_${dim}`,severity:'warning',message:`${DIMENSIONS[dim]} divergente no agendamento. Dimensões preservadas por registro.`});
 }
 const valid=records.filter(r=>!badDateKeys.has(r.key)); quarantinedCents+=records.filter(r=>badDateKeys.has(r.key)).reduce((a,r)=>a+r.cents,0);
 if(!Number.isSafeInteger(totalCents)||!Number.isSafeInteger(quarantinedCents)) throw new Error('Limite de precisão financeira excedido. A base anterior foi preservada.');
 if(!sourceRows||!valid.length) throw new Error('Não há registros financeiros válidos. A base anterior foi preservada.');
 return {id:crypto.randomUUID(),fileName,updatedAt:new Date().toISOString(),asOf,records:valid,issues,audit:{sourceRows,validRows:valid.length,quarantinedRows:sourceRows-valid.length,totalCents,validCents:valid.reduce((a,r)=>a+r.cents,0),quarantinedCents,distinctAppointments:sourceGroups.size,repeatedAppointments:[...sourceGroups.values()].filter(v=>v>1).length,companies:new Set([...sourceGroups.keys()].map(k=>JSON.parse(k)[0])).size,globalCollisions:[...globalIds.values()].filter(v=>v.size>1).length,exactDuplicateRows,invalidDates:issues.filter(i=>['surgery_date','billing_date'].includes(i.code)).length,billingBeforeSurgery:issues.filter(i=>i.code==='billing_before_surgery').length,notesWithoutDate:issues.filter(i=>i.code==='note_without_date').length,inconsistentRecords:new Set(issues.map(i=>i.row)).size}};
}
export const groupRecords=(records:FinancialRecord[])=>{const g=new Map<string,FinancialRecord[]>();for(const r of records)g.set(r.key,[...(g.get(r.key)||[]),r]);return g;};
export type Surgery = Record<Dimension,string> & {key:string;appointment:string;surgeryDate:string;total:number;billed:number;pending:number;days:number;band:number|null;status:Status;records:FinancialRecord[]};
export function snapshot(records:FinancialRecord[], at:string, f:Pick<Filters,'statuses'|'bands'>={statuses:[],bands:[]}):Surgery[] {
 return [...groupRecords(records.filter(r=>r.surgeryDate<=at)).entries()].map(([key,rs])=>{
  const p=rs.filter(r=>!r.billingDate||r.billingDate>at), b=rs.filter(r=>r.billingDate&&r.billingDate<=at);const days=daysBetween(rs[0].surgeryDate,at);
  const dims=Object.fromEntries((Object.keys(DIMENSIONS) as Dimension[]).map(k=>[k,[...new Set(rs.map(r=>r[k]))].sort().join(' • ')])) as Record<Dimension,string>;
  return {...dims,key,appointment:rs[0].appointment,surgeryDate:rs[0].surgeryDate,total:rs.reduce((s,r)=>s+r.cents,0),pending:p.reduce((s,r)=>s+r.cents,0),billed:b.reduce((s,r)=>s+r.cents,0),days,band:p.length?bandOf(days):null,status:p.length?(b.length?STATUSES[1]:STATUSES[0]):STATUSES[2],records:rs};
 }).filter(s=>(!f.statuses.length||f.statuses.includes(s.status))&&(!f.bands.length||(s.band!==null&&f.bands.includes(s.band))));
}
export const matchesDimensions=(r:FinancialRecord,f:Filters)=> (Object.keys(DIMENSIONS) as Dimension[]).every(k=>!f[k]?.length||f[k]!.includes(r[k]));
export function period(f:Filters,asOf:string){
 const months=Array.from({length:12},(_,i)=>i+1).filter(m=>(!f.months.length||f.months.includes(m))&&(!f.quarters.length||f.quarters.includes(Math.ceil(m/3))));
 const eligible=months.filter(m=>`${f.year}-${String(m).padStart(2,'0')}-01`<=asOf);
 const last=eligible.at(-1); const end=last?monthEnd(f.year,last)<asOf?monthEnd(f.year,last):asOf:null;
 const previous=end?(f.months.length?monthEnd(f.year,last!-1):f.quarters.length?monthEnd(f.year,(Math.ceil(last!/3)-1)*3):monthEnd(f.year,last!-1)):null;
 return {months:eligible,end,previous,partial:end!==null&&end!==monthEnd(f.year,last!),year:f.year};
}
export function summarize(surgeries:Surgery[]) {
 const p=surgeries.filter(s=>s.band!==null);const pending=p.reduce((a,s)=>a+s.pending,0);const mean=p.length?p.reduce((a,s)=>a+s.days,0)/p.length:0;
 const bands=BANDS.map((label,i)=>{const g=p.filter(s=>s.band===i);return {label,cents:g.reduce((a,s)=>a+s.pending,0),count:g.length,mean:g.length?g.reduce((a,s)=>a+s.days,0)/g.length:0,share:pending?g.reduce((a,s)=>a+s.pending,0)/pending:0};});
 return {pending,count:p.length,mean,bands,partial:surgeries.filter(s=>s.status===STATUSES[1]).length,billed:surgeries.filter(s=>s.status===STATUSES[2]).length};
}
export function ranking(surgeries:Surgery[],dim:Dimension) {
 const groups=new Map<string,{name:string;cents:number;keys:Map<string,number>}>();
 for(const s of surgeries) for(const r of s.records.filter(r=>!r.billingDate||r.billingDate>addDays(r.surgeryDate,s.days))){const g=groups.get(r[dim])||{name:r[dim],cents:0,keys:new Map<string,number>()};g.cents+=r.cents;g.keys.set(s.key,s.days);groups.set(r[dim],g);}
 return [...groups.values()].map(g=>({name:g.name,cents:g.cents,count:g.keys.size,mean:g.keys.size?[...g.keys.values()].reduce((a,n)=>a+n,0)/g.keys.size:0})).sort((a,b)=>b.cents-a.cents||a.name.localeCompare(b.name));
}
export function movements(before:Surgery[],after:Surgery[]) {
 const b=new Map(before.filter(s=>s.band!==null).map(s=>[s.key,s]));const a=new Map(after.filter(s=>s.band!==null).map(s=>[s.key,s]));
 const result=[{name:'Permaneceram na faixa',count:0,cents:0},{name:'Migraram de faixa',count:0,cents:0},{name:'Totalmente faturadas',count:0,cents:0},{name:'Novas pendências no recorte',count:0,cents:0},{name:'Faturamento parcial liberado',count:0,cents:0}];
 for(const [k,s] of a){const prev=b.get(k);if(!prev){result[3].count++;result[3].cents+=s.pending;}else {const i=prev.band===s.band?0:1;result[i].count++;result[i].cents+=Math.min(prev.pending,s.pending);if(prev.pending>s.pending){result[4].count++;result[4].cents+=prev.pending-s.pending;}}}
 for(const [k,s] of b)if(!a.has(k)){result[2].count++;result[2].cents+=s.pending;}
 return result;
}
export function buildView(ds:Dataset,f:Filters){
 const p=period(f,ds.asOf);const records=ds.records.filter(r=>matchesDimensions(r,f));
 const surgeries=p.end?snapshot(records,p.end,f):[];const previous=p.previous?snapshot(records,p.previous,f):[];const summary=summarize(surgeries),prev=summarize(previous);
 const flow=surgeries.flatMap(s=>s.records).filter(r=>r.billingDate&&r.billingDate<=p.end!&&Number(r.billingDate.slice(0,4))===f.year&&p.months.includes(Number(r.billingDate.slice(5,7))));
 const monthly=p.months.map(m=>{const planned=monthEnd(f.year,m),at=planned>ds.asOf?ds.asOf:planned;const ss=snapshot(records,at,f);return {month:m,at,isPartial:at!==planned,...summarize(ss)};});
 const quarterly=[1,2,3,4].filter(q=>(!f.quarters.length||f.quarters.includes(q))&&p.months.some(m=>Math.ceil(m/3)===q)).map(q=>{const planned=monthEnd(f.year,q*3),at=planned>ds.asOf?ds.asOf:planned;const ss=snapshot(records,at,f);const prior=summarize(snapshot(records,monthEnd(f.year,(q-1)*3),f));return {quarter:q,at,isPartial:planned>ds.asOf,...summarize(ss),delta:summarize(ss).pending-prior.pending};});
 return {period:p,surgeries,summary,previous:prev,flowCents:flow.reduce((a,r)=>a+r.cents,0),flowCount:new Set(flow.map(r=>r.key)).size,monthly,quarterly,movements:movements(previous,surgeries),rankings:Object.fromEntries((Object.keys(DIMENSIONS) as Dimension[]).map(d=>[d,ranking(surgeries,d)])) as Record<Dimension,ReturnType<typeof ranking>>};
}
