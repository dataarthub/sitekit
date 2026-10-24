// Shared guard is copied unchanged; this project launcher owns its fixed budgets.
import {realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {runGuarded} from './testing/guarded-process.mjs';
const root=resolve(import.meta.dirname,'..');
const entry=realpathSync(resolve(root,process.argv[2]??''));
if(!relative(root,entry).startsWith('scripts/'))throw Error('Use an owned browser test entrypoint');
const budgets={memoryLimitMiB:3072,timeoutMs:600000,intervalMs:500};
const result=await runGuarded(process.execPath,[entry,...process.argv.slice(3)],{cwd:root,...budgets});
mkdirSync(resolve(root,'.verification/browser-guard'),{recursive:true});
writeFileSync(resolve(root,'.verification/browser-guard/result.json'),JSON.stringify({...budgets,...result},null,2)+'\n');
console.log(`Browser check ${result.ok?'passed':'failed'}; peak ${result.peakMiB} MiB; limit ${budgets.memoryLimitMiB} MiB; deadline ${budgets.timeoutMs} ms.`);
if(result.reason)console.error(result.reason);
process.exitCode=result.ok?0:1;
