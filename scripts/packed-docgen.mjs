// Public-only external documentation consumer; never resolves declarations from checkout source.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,realpath,readdir} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createRequire}from'node:module';
import {declarationTagIssues} from './declaration-tags.mjs';
export const documentationTools={typedoc:'0.28.20',typescript:'6.0.3'};
const names=new Set(['@alneas/sitekit','@alneas/sitekit-cloudflare']);
const peers=['astro','@alneas/appkit-core','@alneas/appkit-react','react','react-dom','@types/node','@types/react','@types/react-dom'];
export function declarationEntries(name,exports){
 assert(names.has(name),'Only public SiteKit targets are accepted');
 const result=[];
 for(const [key,target]of Object.entries(exports??{})){
  if(!target||typeof target!=='object'||!target.types)continue;
  assert((key==='.'||key.startsWith('./'))&&!key.includes('*')&&!key.split('/').includes('..'),'Unsupported declaration export');
  assert(typeof target.types==='string'&&/^\.\/[^\\]+\.d\.(?:ts|cts|mts)$/.test(target.types)&&!target.types.split('/').includes('..'),'Invalid declaration target');
  result.push({specifier:name+(key==='.'?'':key.slice(1)),declaration:target.types});
 }
 assert(result.length,'No declaration entrypoints');return result;
}
export async function readArchiveInputs(directory){
 const root=await realpath(directory),manifest=JSON.parse(await readFile(join(root,'release.json'),'utf8'));
 assert(/^[a-f0-9]{40}$/.test(manifest.commit),'Missing source binding');
 assert(Array.isArray(manifest.artifacts)&&manifest.artifacts.length>0,'No archives selected');
 const inputs={},seen=new Set();
 for(const artifact of manifest.artifacts){
  assert(names.has(artifact.name)&&!seen.has(artifact.name),'Unexpected or duplicate public target');seen.add(artifact.name);
  assert(typeof artifact.archive==='string'&&basename(artifact.archive)===artifact.archive&&artifact.archive.endsWith('.tgz'),'Invalid archive path');
  const file=await realpath(join(root,artifact.archive));assert(file.startsWith(root+'/'),'Archive escaped bundle');
  const bytes=await readFile(file);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256,'Archive SHA-256 mismatch');
  assert.equal('sha512-'+createHash('sha512').update(bytes).digest('base64'),artifact.integrity,'Archive integrity mismatch');
  inputs[artifact.name]={...artifact,file,bytes};
 }
 return {manifest,inputs};
}
export async function stageVerifiedArchives(inputs,directory){
 const dependencies={};let index=0;
 for(const [name,a]of Object.entries(inputs)){
  const target=join(directory,'verified-'+String(index++)+'.tgz');
  await writeFile(target,a.bytes,{flag:'wx',mode:0o400});dependencies[name]='file:'+target;
 }
 return dependencies;
}
function run(command,args,cwd,{failure=false}={}){
 const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,env:{...process.env,NPM_CONFIG_USERCONFIG:'/dev/null',NPM_CONFIG_REGISTRY:'https://registry.npmjs.org',NODE_PATH:'',NODE_AUTH_TOKEN:'',NPM_TOKEN:''}});
 assert(!result.error,'Documentation process failed: '+(result.error?.code??''));
 if(failure){assert.notEqual(result.status,0,'Invalid documentation must fail: '+failure);return result;}
 assert.equal(result.status,0,'Packed documentation consumer failed:\n'+result.stdout+'\n'+result.stderr);return result;
}
export async function verifyPackedDocumentation(directory,{root=resolve(import.meta.dirname,'..')}={}){
 const {manifest,inputs}=await readArchiveInputs(directory),scratch=await mkdtemp(join(tmpdir(),'sitekit-packed-docgen-'));
 try{
  const source=JSON.parse(await readFile(join(root,'package.json'),'utf8')),dependencies={...documentationTools};
  for(const name of peers){const version=source.devDependencies?.[name];assert(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version??''),'Exact public peer required: '+name);dependencies[name]=version;}
  Object.assign(dependencies,await stageVerifiedArchives(inputs,scratch));
  await writeFile(join(scratch,'package.json'),JSON.stringify({name:'sitekit-packed-documentation-consumer',private:true,type:'module',dependencies}));
  run('npm',['install','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],scratch);
  const ts=createRequire(join(scratch,'package.json'))('typescript');
  await mkdir(join(scratch,'entries'));const files=[],expectedModules=[];
  for(const [name,a]of Object.entries(inputs)){
   const installed=await realpath(join(scratch,'node_modules',name));assert(installed.startsWith((await realpath(scratch))+'/'),'Installed archive escaped consumer');
   async function inspect(directory){for(const item of await readdir(directory,{withFileTypes:true})){if(item.isDirectory()&&item.name!=='node_modules')await inspect(join(directory,item.name));else if(item.isFile()&&/\.d\.(?:ts|cts|mts)$/.test(item.name)){const path=join(directory,item.name),issues=declarationTagIssues(ts,await readFile(path,'utf8'),path);assert.equal(issues.length,0,'Duplicate or invalid declaration tags: '+JSON.stringify(issues));}}}
   await inspect(installed);
   const p=JSON.parse(await readFile(join(installed,'package.json'),'utf8'));assert.equal(p.name,name);assert.equal(p.version,a.version);
   for(const entry of declarationEntries(name,p.exports)){
    const declaration=await realpath(join(installed,entry.declaration));assert(declaration.startsWith(installed+'/'),'Declaration escaped installed archive');
    const file='entries/entry-'+files.length+'.ts';await writeFile(join(scratch,file),`export * from '${entry.specifier}';\n`);files.push(file);expectedModules.push(entry.specifier);
   }
  }
  await writeFile(join(scratch,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',jsx:'react-jsx',strict:true,skipLibCheck:true,noEmit:true},include:['entries/**/*.ts']}));
  // Ask the supported consumer compiler about actual default exports as well.
  await writeFile(join(scratch,'defaults.mjs'),`import ts from 'typescript';import fs from 'node:fs';const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,'.');const program=ts.createProgram(parsed.fileNames,parsed.options),checker=program.getTypeChecker();for(const file of parsed.fileNames){const s=program.getSourceFile(file),statement=s.statements[0],symbol=checker.getSymbolAtLocation(statement.moduleSpecifier);if(symbol&&checker.getExportsOfModule(symbol).some(s=>s.name==='default'))fs.appendFileSync(file,\"export {default} from \"+statement.moduleSpecifier.getText()+\";\\n\");}`);
  run(process.execPath,['defaults.mjs'],scratch);
  const options={name:'SiteKit archive declarations',entryPoints:files,tsconfig:'tsconfig.json',json:'api.json',treatWarningsAsErrors:true,validation:{invalidLink:true,notExported:true}};
  await writeFile(join(scratch,'typedoc.json'),JSON.stringify(options));
  run(process.execPath,['node_modules/typedoc/bin/typedoc','--options','typedoc.json'],scratch);
  const reflection=JSON.parse(await readFile(join(scratch,'api.json'),'utf8'));
  assert.equal(reflection.children?.length,files.length,'Missing documentation modules');
  for(const child of reflection.children)assert(child.children?.length,'Empty declaration module: '+child.name);
  // Prove the actual installed renderer rejects warnings instead of accepting empty output.
  for(const [kind,comment]of [['link','/** Broken {@link DefinitelyMissingSymbol}. */'],['tag','/** Broken.\n * @definitelyInvalidTag rejected\n */']]){
   await writeFile(join(scratch,'negative.ts'),comment+'\nexport function probe():string{return "fixture";}\n');
   await writeFile(join(scratch,'negative-tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,skipLibCheck:true,module:'NodeNext',moduleResolution:'NodeNext',target:'ES2022'},include:['negative.ts']}));
   await writeFile(join(scratch,'negative-options.json'),JSON.stringify({name:'Negative',tsconfig:'negative-tsconfig.json',entryPoints:['negative.ts'],json:'negative.json',treatWarningsAsErrors:true,validation:{invalidLink:true,notExported:true}}));
   const failed=run(process.execPath,['node_modules/typedoc/bin/typedoc','--options','negative-options.json'],scratch,{failure:kind});
   const diagnostic=failed.stdout+failed.stderr;assert(/warning/i.test(diagnostic),'Negative '+kind+' did not fail through warning enforcement');assert((kind==='link'?/DefinitelyMissingSymbol/:kind==='tag'?/definitelyInvalidTag/:/@returns/).test(diagnostic),'Wrong negative warning: '+kind+'\n'+diagnostic);
  }
  assert(declarationTagIssues(ts,'/** Fixture.\n * @returns One.\n * @returns Two.\n */ export declare function negative():string;','negative.d.ts').some(x=>x.tag==='returns'),'Duplicate-tag negative must fail');
  const result={sourceCommit:manifest.commit,tools:documentationTools,entrypoints:expectedModules.length,modules:reflection.children.length,negativeWarnings:['invalid-link','invalid-tag','duplicate-returns'],scope:'Installed public archive declarations; TypeScript 6 documentation consumer alongside unchanged production TypeScript 7.'};
  console.log(JSON.stringify(result));return result;
 }finally{await rm(scratch,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert(process.argv.length===4&&process.argv[2]==='--bundle','Usage: packed-docgen.mjs --bundle DIRECTORY');
 await verifyPackedDocumentation(resolve(process.argv[3]));
}
