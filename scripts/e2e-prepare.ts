import {mkdir,copyFile,rm} from 'node:fs/promises';
const target='.local/e2e';await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true,mode:0o700});
for(const file of ['dataset.enc','encryption.key'])await copyFile(`.local/${file}`,`${target}/${file}`);
