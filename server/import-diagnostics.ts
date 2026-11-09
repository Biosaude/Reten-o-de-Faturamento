import {randomUUID} from 'node:crypto';
import type {Request,Response,NextFunction} from 'express';

type Stage='body'|'authenticate'|'authorize'|'validate_request'|'read_current'|'validate_base'|'compare_versions'|'history_preflight'|'replace_rpc'|'persist_local'|'respond';

// Only technical codes are allowed. Never log message/details/hint, headers or payloads.
function technicalCode(error:unknown):string {
 let value=error;
 for(let depth=0;depth<3&&value&&typeof value==='object';depth++){
  const item=value as {code?:unknown;cause?:unknown;type?:unknown};
  if(typeof item.code==='string'&&/^(?:[A-Z0-9]{5}|PGRST\d{3}|E[A-Z_]{1,40}|UND_ERR_[A-Z_]{1,40})$/.test(item.code))return item.code;
  if(item.type==='entity.too.large')return 'BODY_TOO_LARGE';
  value=item.cause;
 }
 return 'UNCLASSIFIED';
}
function errorClass(error:unknown):string {
 if(error instanceof Error)return ['Error','TypeError','RangeError','SyntaxError','ZodError','PayloadTooLargeError'].includes(error.name)?error.name:'Error';
 return error&&typeof error==='object'?'BackendError':'UnknownError';
}

export class ImportTrace {
 private started=performance.now();
 private stepStarted=this.started;
 private current:Stage='body';
 private failed=false;
 readonly id=randomUUID();
 constructor(){this.log('retention_import_started');}
 private fields(){
  const memory=process.memoryUsage();
  return {importId:this.id,stage:this.current,elapsedMs:Math.round(performance.now()-this.started),
   stageMs:Math.round(performance.now()-this.stepStarted),rssMiB:Math.round(memory.rss/1048576),heapUsedMiB:Math.round(memory.heapUsed/1048576)};
 }
 private log(event:string,fields:Record<string,string|number>={}){
  console.info(JSON.stringify({event,...this.fields(),...fields}));
 }
 stage(stage:Stage){this.current=stage;this.stepStarted=performance.now();this.log('retention_import_stage');}
 backend(status:number){if(Number.isInteger(status)&&(status===0||status>=100&&status<=599))this.log('retention_import_backend_response',{backendStatus:status});}
 persisted(){this.log('retention_import_persisted');}
 failure(error:unknown){
  if(this.failed)return;this.failed=true;
  console.error(JSON.stringify({event:'retention_import_failed',...this.fields(),code:technicalCode(error),errorClass:errorClass(error)}));
 }
 finished(status:number){this.log('retention_import_finished',{status});}
 closed(){this.log('retention_import_connection_closed');}
}

export function importTrace(res:Response):ImportTrace|undefined{return res.locals.importTrace;}
export function importStage(res:Response,stage:Stage){importTrace(res)?.stage(stage);}
export function importFailure(res:Response,error:unknown){importTrace(res)?.failure(error);}
export function importDiagnostics(req:Request,res:Response,next:NextFunction){
 if(req.method!=='POST'||req.path!=='/api/import')return next();
 const trace=new ImportTrace();res.locals.importTrace=trace;
 res.set('X-Retention-Import-Id',trace.id);
 res.once('finish',()=>trace.finished(res.statusCode));
 res.once('close',()=>{if(!res.writableFinished)trace.closed();});
 next();
}
