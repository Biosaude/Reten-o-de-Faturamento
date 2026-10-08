import {validateBase,type Dataset} from './domain';
export async function parseFile(file:File,asOf:string):Promise<{dataset:Dataset;headers:string[];rows:(string|number|null)[][]}>{
 if(file.size>10*1024*1024)throw new Error('Limite de arquivo: 10 MB.');let raw:unknown[][];
 if(/\.xlsx$/i.test(file.name)){
  const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());
  if(book.worksheets.length!==1)throw new Error('Use um arquivo com uma única aba de dados.');raw=[];
  book.worksheets[0].eachRow({includeEmpty:true},r=>raw.push(Array.from({length:Math.max(14,r.cellCount)},(_,i)=>{const v=r.getCell(i+1).value;return v instanceof Date?v.toISOString().slice(0,10):v&&typeof v==='object'&&'result' in v?v.result:v;})));
 }else if(/\.csv$/i.test(file.name)){
  const {default:Papa}=await import('papaparse');const result=Papa.parse<unknown[]>(await file.text(),{skipEmptyLines:'greedy'});if(result.errors.length)throw new Error('CSV inválido: confira separadores e aspas.');raw=result.data;
 }else throw new Error('Selecione um arquivo Excel (.xlsx) ou CSV (.csv).');
 const headers=raw[0].map(String);const rows=raw.slice(1).map(r=>r.map((v,i)=>i===9?null:v===null||v===undefined?null:typeof v==='number'?v:String(v)));
 const dataset=validateBase(headers,rows,asOf,file.name);return {dataset,headers,rows};
}
