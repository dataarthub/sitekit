import {cp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {packageReadme} from './package-readme.mjs';
const root=resolve(import.meta.dirname,'..'),core=resolve(root,'packages/core');
const manifest=JSON.parse(await readFile(resolve(root,'docs.manifest.json'),'utf8'));
await rm(resolve(core,'dist'),{recursive:true,force:true});
const child=Bun.spawn(['bun','x','--no-install','tsc','-p','tsconfig.json'],{cwd:core,stdout:'inherit',stderr:'inherit'});
if(await child.exited!==0)process.exit(1);
// Package-facing copies are generated only from this repository's curated public sources.
for(const name of ['README.md','LICENSE','THIRD_PARTY_NOTICES.json','docs.manifest.json','llms.txt','llms-full.txt','schema','skills','examples']){
 await rm(resolve(core,name),{recursive:true,force:true});await cp(resolve(root,name),resolve(core,name),{recursive:true});
 if(name==='README.md'){const text=await readFile(resolve(core,name),'utf8');await writeFile(resolve(core,name),packageReadme(text,manifest));}
}


await rm(resolve(core,'docs'),{recursive:true,force:true});
for(const doc of manifest.documents){
 if(!doc.source.startsWith('docs/'))continue;
 const target=resolve(core,doc.source);await mkdir(resolve(target,'..'),{recursive:true});await cp(resolve(root,doc.source),target);
}
