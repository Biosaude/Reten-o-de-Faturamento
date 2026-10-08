import ExcelJS from 'exceljs';
import {validateBase} from '../src/lib/domain';
import {saveDataset,readDataset} from '../server/store';
const [file,asOf]=process.argv.slice(2);
if(!file||!asOf)throw new Error('Uso: npm run seed:local -- arquivo.xlsx AAAA-MM-DD');
const book=new ExcelJS.Workbook();await book.xlsx.readFile(file);if(book.worksheets.length!==1)throw new Error('Use uma única aba de dados.');const sheet=book.worksheets[0];
const rows:unknown[][]=[];sheet.eachRow({includeEmpty:true},r=>rows.push(Array.from({length:Math.max(14,r.cellCount)},(_,i)=>{const v=r.getCell(i+1).value;return v instanceof Date?v.toISOString().slice(0,10):v&&typeof v==='object'&&'result' in v?v.result:v;})));
const ds=validateBase(rows[0],rows.slice(1),asOf,file.split('/').at(-1)!);const prior=await readDataset(true);
await saveDataset(ds,true,prior?.id??null,'local');console.log(JSON.stringify(ds.audit,null,2));
