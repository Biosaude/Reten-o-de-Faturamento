import type {RequestHandler} from 'express';
import {gzipSync} from 'node:zlib';

// Keep the JSON contract; encode only responses approaching the buffered function limit.
const LARGE_JSON_BYTES=4_000_000;
export const largeJsonResponse:RequestHandler=(req,res,next)=>{
 const send=res.send;
 res.send=function(body){
  if(typeof body==='string'&&this.get('Content-Type')?.startsWith('application/json')&&Buffer.byteLength(body)>LARGE_JSON_BYTES){
   this.vary('Accept-Encoding');
   if(!this.get('Content-Encoding')&&req.acceptsEncodings('gzip')){
    this.set('Content-Type',this.get('Content-Type')!.replace(/;\s*charset\s*=\s*[^;]+/i,'')+'; charset=utf-8');
    this.set('Content-Encoding','gzip');this.removeHeader('Content-Length');
    return send.call(this,gzipSync(body,{level:1}));
   }
  }
  return send.call(this,body);
 };
 next();
};
