import express,{type Request,type Response,type NextFunction} from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {readDataset,saveDataset,supabaseAdmin,readAuditVersions,readAuditVersion,readFinancialVersions,readFinancialVersion} from './store.js';
import {validateBase,DIMENSIONS,STATUSES,type Filters} from '../src/lib/domain.js';
import {excelReport,pdfReport,excelTemplate} from './reports.js';
import {publicDataset} from './public-data.js';
import {publicationMetadata} from './publication.js';
import {normalizeAudit,auditSnapshot} from '../src/lib/audit.js';
const baseSchema=z.object({headers:z.array(z.string()).length(14),rows:z.array(z.array(z.union([z.string(),z.number().finite(),z.null()])).length(14)).max(25000),asOf:z.string(),fileName:z.string().max(200)});
const filtersSchema=z.object({year:z.number().int().min(2000).max(2100).optional(),referenceDate:z.string().date().optional(),months:z.array(z.number().int().min(1).max(12)),quarters:z.array(z.number().int().min(1).max(4)),bands:z.array(z.number().int().min(0).max(4)),statuses:z.array(z.enum(STATUSES)),...Object.fromEntries(Object.keys(DIMENSIONS).map(d=>[d,z.array(z.string().max(500)).max(5000).optional()]))});
export function createApp(local=false,clock:()=>Date=()=>new Date()){
 if(local&&process.env.VERCEL)throw new Error('Modo local proibido na Vercel');
 const app=express();const sessions=new Map<string,number>();
 app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],connectSrc:["'self'",'https://*.supabase.co'],imgSrc:["'self'",'data:'],objectSrc:["'none'"],frameAncestors:["'none'"]}}}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 if(local)app.use((req,res,next)=>{
  const host=req.hostname;const origin=req.get('origin');
  if(!['127.0.0.1','localhost','::1'].includes(host))return res.status(403).json({error:'Acesso local restrito.'});
  if(origin&&!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))return res.status(403).json({error:'Origem não permitida.'});next();
 });
 app.use(express.json({limit:'4mb'}));
 app.use('/api',rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
 app.get('/api/public/dataset',async(_req,res)=>{
  if(!local&&(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY))return res.json(null);
  const ds=await readDataset(local);return res.json(ds?publicDataset(ds,process.env.RETENTION_PUBLIC_IDENTIFIERS!=='false'):null);
 });
 app.get('/api/public/versions',async(_req,res)=>{const versions=await readFinancialVersions(local);res.json(versions.map(({id,asOf,updatedAt})=>({id,asOf,updatedAt})));});
 app.get('/api/public/versions/:id',async(req,res)=>{const ds=await readFinancialVersion(z.string().uuid().parse(req.params.id),local);if(!ds)return res.status(404).json({error:'Versão financeira completa indisponível.'});res.json(publicDataset(ds,process.env.RETENTION_PUBLIC_IDENTIFIERS!=='false'));});
 app.get('/api/auth/config',(_req,res)=>res.json({local,supabaseUrl:local?null:process.env.SUPABASE_URL??null,anonKey:local?null:process.env.SUPABASE_ANON_KEY??null}));
 app.post('/api/auth/local',(_req,res)=>{if(!local)return res.sendStatus(404);const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);res.cookie('retention_local',token,{httpOnly:true,sameSite:'strict',maxAge:8*3600000,path:'/api'});return res.json({role:'admin',email:'Desenvolvimento local'});});
 app.post('/api/auth/logout',(req,res)=>{const token=/retention_local=([^;]+)/.exec(req.get('cookie')||'')?.[1];if(token)sessions.delete(token);res.clearCookie('retention_local',{path:'/api'}).sendStatus(204);});
 app.use('/api',async(req:Request,res:Response,next:NextFunction)=>{
  if(local){const token=/retention_local=([^;]+)/.exec(req.get('cookie')||'')?.[1]??'';if(!token||![...sessions].some(([t,expires])=>expires>Date.now()&&t.length===token.length&&timingSafeEqual(Buffer.from(t),Buffer.from(token))))return res.status(401).json({error:'Autenticação necessária.'});res.locals.role='admin';res.locals.actor='local';return next();}
  const bearer=req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!bearer)return res.status(401).json({error:'Autenticação necessária.'});
  try {const sb=supabaseAdmin();const {data,error}=await sb.auth.getUser(bearer);if(error||!data.user)return res.status(401).json({error:'Sessão inválida.'});const {data:role,error:roleError}=await sb.from('retention_roles').select('role').eq('user_id',data.user.id).maybeSingle();if(roleError||!role)return res.status(403).json({error:'Usuário sem permissão neste dashboard.'});res.locals.role=role.role;res.locals.actor=data.user.id;next();}catch{return res.status(503).json({error:'Autenticação indisponível. Verifique a configuração do ambiente.'});}
 });
 app.get('/api/me',(_req,res)=>res.json({role:res.locals.role}));
 app.get('/api/dataset',async(_req,res)=>{const ds=await readDataset(local);res.json(ds?normalizeAudit(ds):null);});
 app.get('/api/audit/versions',async(_req,res)=>{if(res.locals.role!=='admin')return res.status(403).json({error:'Somente administradores podem consultar versões da auditoria.'});res.json(await readAuditVersions(local));});
 app.get('/api/audit/versions/:id',async(req,res)=>{if(res.locals.role!=='admin')return res.status(403).json({error:'Somente administradores podem consultar versões da auditoria.'});const id=z.string().uuid().parse(req.params.id);const ds=await readAuditVersion(id,local);if(!ds)return res.status(404).json({error:'Detalhes históricos indisponíveis para esta versão.'});res.json(auditSnapshot(ds));});
 app.get('/api/versions',async(_req,res)=>res.json(await readFinancialVersions(local)));
 app.get('/api/versions/:id',async(req,res)=>{const ds=await readFinancialVersion(z.string().uuid().parse(req.params.id),local);if(!ds)return res.status(404).json({error:'Versão financeira completa indisponível.'});res.json(normalizeAudit(ds));});
 app.get('/api/template',async(_req,res)=>{
  if(res.locals.role!=='admin')return res.status(403).json({error:'Somente administradores podem baixar o modelo.'});
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').set('Content-Disposition','attachment; filename="modelo-retencao-faturamento.xlsx"').send(await excelTemplate());
 });
 app.post('/api/validate',async(req,res)=>{
  if(res.locals.role!=='admin')return res.status(403).json({error:'Somente administradores podem validar arquivos.'});
  const body=baseSchema.extend({asOf:z.string().optional(),publication:z.boolean().optional()}).parse(req.body);const asOf=body.publication||!body.asOf?publicationMetadata(clock()).asOf:body.asOf;res.json(validateBase(body.headers,body.rows,asOf,body.fileName));
 });
 app.post('/api/import',async(req,res)=>{
  if(res.locals.role!=='admin')return res.status(403).json({error:'Somente administradores podem importar.'});
  const body=baseSchema.omit({asOf:true}).extend({expectedId:z.string().uuid().nullable(),confirmed:z.literal(true)}).parse(req.body);
  const prior=await readDataset(local);const metadata=publicationMetadata(clock());
  const ds={...validateBase(body.headers,body.rows,metadata.asOf,body.fileName),...metadata};
  if(prior&&JSON.stringify(prior.records)===JSON.stringify(ds.records)&&prior.asOf===ds.asOf&&JSON.stringify(prior.auditRecords??null)===JSON.stringify(ds.auditRecords??null))return res.status(409).json({error:'Esta versão já está carregada. Nenhum registro foi duplicado.'});
  if(prior&&ds.asOf<prior.asOf)return res.status(400).json({error:'Data de corte anterior à base vigente. Utilize um ambiente separado para regressão.'});
  await saveDataset(ds,local,body.expectedId,res.locals.actor);return res.json(ds);
 });
 app.post('/api/export/:format',async(req,res)=>{
  if(!['admin','analyst'].includes(res.locals.role))return res.status(403).json({error:'Seu perfil não permite exportação.'});
  const f=filtersSchema.parse(req.body) as Filters;const ds=await readDataset(local);if(!ds)return res.status(404).json({error:'Base não importada.'});
  const format=req.params.format;if(!['xlsx','pdf'].includes(format))return res.sendStatus(404);
  const data=format==='xlsx'?await excelReport(ds,f):await pdfReport(ds,f);
  res.type(format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf').set('Content-Disposition',`attachment; filename="retencao-${ds.asOf}.${format}"`).send(data);
 });
 app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  if(err instanceof z.ZodError)return res.status(400).json({error:'Requisição inválida. Verifique os campos e filtros.'});
  const message=err instanceof Error?err.message:'';
  if(message==='AUDIT_HISTORY_UNAVAILABLE')return res.status(503).json({error:'Histórico da auditoria indisponível. Contate o suporte; os dados atuais foram preservados.'});
  if(message==='CONFLICT')return res.status(409).json({error:'Outra importação atualizou a base. Recarregue antes de confirmar.'});
  if(/Arquivo incompatível|Informe uma data|Não há registros|Limite de/.test(message))return res.status(400).json({error:message});
  return res.status(500).json({error:'Operação indisponível. Verifique a configuração ou o arquivo.'});
 });
 return app;
}
