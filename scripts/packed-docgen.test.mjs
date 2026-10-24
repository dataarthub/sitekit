import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm}from'node:fs/promises';
import {join}from'node:path';
import {tmpdir}from'node:os';
import {createHash}from'node:crypto';
import {declarationEntries,readArchiveInputs,stageVerifiedArchives}from'./packed-docgen.mjs';
test('selects exact declaration subpaths and leaves stylesheet assets to the payload gate',()=>{
 assert.deepEqual(declarationEntries('@alneas/sitekit',{'.':{types:'./dist/index.d.ts'},'./ui':{types:'./dist/ui.d.cts'},'./style.css':'./style.css'}),[{specifier:'@alneas/sitekit',declaration:'./dist/index.d.ts'},{specifier:'@alneas/sitekit/ui',declaration:'./dist/ui.d.cts'}]);
 for(const [name,exports]of [['@dataarthub/sitekit',{'.':{types:'./dist/index.d.ts'}}],['@alneas/sitekit',{'./*':{types:'./dist/*.d.ts'}}],['@alneas/sitekit',{'.':{types:'../private.d.ts'}}],['@alneas/sitekit',{}]])assert.throws(()=>declarationEntries(name,exports));
});
test('validates archive bytes and rejects private targets, duplicates and traversal',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'sitekit-docgen-input-'));t.after(()=>rm(dir,{recursive:true,force:true}));const bytes=Buffer.from('fixture');await writeFile(join(dir,'fixture.tgz'),bytes);
 const artifact={name:'@alneas/sitekit',version:'0.2.0',archive:'fixture.tgz',sha256:createHash('sha256').update(bytes).digest('hex'),integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64')};
 const write=artifacts=>writeFile(join(dir,'release.json'),JSON.stringify({commit:'a'.repeat(40),artifacts}));await write([artifact]);assert.equal((await readArchiveInputs(dir)).inputs[artifact.name].version,'0.2.0');
 for(const artifacts of [[],[{...artifact,name:'@dataarthub/sitekit'}],[artifact,artifact],[{...artifact,archive:'../fixture.tgz'}],[{...artifact,sha256:'0'.repeat(64)}],[{...artifact,integrity:'sha512-wrong'}]]){await write(artifacts);await assert.rejects(readArchiveInputs(dir));}
});

test('npm installs an owned snapshot even if the original bundle path changes after hash verification',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'sitekit-docgen-snapshot-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'original.tgz'),bytes=Buffer.from('verified bytes');await writeFile(file,bytes);await writeFile(file,'replaced after verification');const staged=await stageVerifiedArchives({'@alneas/sitekit':{file,bytes,archive:'original.tgz'}},dir);const copy=staged['@alneas/sitekit'].slice(5);assert.notEqual(copy,file);assert.deepEqual(await readFile(copy),bytes);
});
