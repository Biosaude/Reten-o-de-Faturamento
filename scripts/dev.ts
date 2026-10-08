import {spawn} from 'node:child_process';
const processes=[spawn('npm',['run','dev:api'],{stdio:'inherit'}),spawn('npm',['run','dev:web'],{stdio:'inherit'})];
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{for(const p of processes)p.kill(signal);process.exit(0);});
for(const p of processes)p.on('exit',code=>{for(const other of processes)if(other!==p)other.kill();process.exit(code??1);});
