import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Exercise the real production bundle. Never read/delete/copy the development store.
export default function prepare(){
 execFileSync('npm',['run','build'],{cwd:resolve(dirname(fileURLToPath(import.meta.url)),'..'),stdio:'inherit'});
}
