import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const adapter=resolve(import.meta.dirname,'../packages/cloudflare');
await rm(resolve(adapter,'dist'),{recursive:true,force:true});
const child=Bun.spawn(['bun','x','--no-install','tsc','-p','tsconfig.json'],{cwd:adapter,stdout:'inherit',stderr:'inherit'});
if(await child.exited!==0)process.exit(1);
