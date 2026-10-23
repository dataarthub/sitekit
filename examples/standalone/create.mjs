#!/usr/bin/env node
import {cp,readFile,writeFile,stat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const source=fileURLToPath(new URL('.',import.meta.url)),core=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));
if(core.name!=='@alneas/sitekit')throw Error('Run this scaffold from the installed public SiteKit package.');
const require=createRequire(import.meta.url),entry=require.resolve('@alneas/sitekit-cloudflare/standalone');
const adapter=JSON.parse(await readFile(new URL('../../package.json',pathToFileURL(entry)),'utf8'));
const target=resolve(process.argv[2]??'sitekit-site');
try{await stat(target);throw Error('Target already exists; no files were changed.');}catch(e){if(e.code!=='ENOENT')throw e;}
await cp(source,target,{recursive:true});const manifest=JSON.parse(await readFile(resolve(target,'package.json'),'utf8'));
manifest.dependencies['@alneas/sitekit']=core.version;manifest.dependencies['@alneas/sitekit-cloudflare']=adapter.version;
await writeFile(resolve(target,'package.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(target,'.gitignore'),await readFile(resolve(target,'gitignore.template'),'utf8'));
console.log('Standalone project created. Configure sitekit.config.json, then npm install and npm run db:local.');
