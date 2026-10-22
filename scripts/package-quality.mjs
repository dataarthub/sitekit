import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {readSelectedPlan,inputHash} from './workflow-supply/public/quality.mjs';
import {turboTaskArguments} from './workflow-supply/public/impact.mjs';
export function selectedCommands(root,selection,mode){
 assert(['source','compatibility'].includes(mode),'Use source or compatibility');
 const task=names=>{const args=turboTaskArguments(root,selection,names);return args?[process.execPath,...args]:null;};
 if(mode==='compatibility')return [['bun','run','build:all'],task(['typecheck','test'])].filter(Boolean);
 const scripts=JSON.parse(readFileSync(join(root,'package.json'))).scripts;
 const original=scripts['release:check'].split(' && ').map(text=>{assert(/^bun run [\w:-]+$/.test(text),'Unknown release gate syntax; select conservatively by updating adapter');return text.slice('bun run '.length);});
 for(const required of ['quality:checks','release:registry','test:boundary','verify:public','typecheck:all','docs:check','test:all','test:site-build','test:consumer','test:npm','test:example'])assert(original.includes(required),'Missing mandatory original gate: '+required);
 return original.map(name=>name==='typecheck:all'?task(['typecheck']):name==='test:all'?task(['test']):['bun','run',name]).filter(Boolean);
}
export function executeCommands(root,commands,{run=(command,args)=>spawnSync(command,args,{cwd:root,stdio:'inherit'})}={}){
 for(const [command,...args]of commands){const result=run(command,args);if(result.error)throw result.error;assert.equal(result.status,0,'Selected required gate failed: '+args.join(' '));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const root=resolve(import.meta.dirname,'..'),plan=readSelectedPlan(root),before=inputHash(root);executeCommands(root,selectedCommands(root,plan.packageImpact,process.argv[2]));assert.equal(inputHash(root),before,'Source changed during selected verification');console.log(JSON.stringify({packageTests:plan.packageImpact.test,omittedPackageTests:plan.packageImpact.omitted,coupledArchiveAndSiteChecks:'preserved'}));}
