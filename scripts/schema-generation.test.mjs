import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync,existsSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {checkGenerated} from './check-generated.mjs';
const generator=resolve(import.meta.dirname,'generate-site-schema.mjs');
test('actual schema generator detects root/mirror drift, missing and obsolete files without repairing output',()=>{
 const root=mkdtempSync(join(tmpdir(),'sitekit-schema-freshness-'));
 try{
  const command=['bun',generator,'--output-dir',root];const run=spawnSync(command[0],command.slice(1),{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const config={schemaVersion:1,jobs:[{name:'schema',command:['bun',generator,'--output-dir','{outputDir}'],outputs:['schema/site.schema.json','packages/core/schema']}]};
  assert.deepEqual(checkGenerated(root,config)[0].differences,[]);
  const canonical=join(root,'schema/site.schema.json'),mirror=join(root,'packages/core/schema/site.schema.json');
  assert.equal(readFileSync(canonical,'utf8'),readFileSync(mirror,'utf8'));
  writeFileSync(canonical,'{}');unlinkSync(mirror);writeFileSync(join(root,'packages/core/schema/obsolete.json'),'{}');
  const changes=checkGenerated(root,config)[0].differences.map(x=>x.kind).sort();assert.deepEqual(changes,['changed','extra','missing']);
  assert.equal(readFileSync(canonical,'utf8'),'{}');assert(!existsSync(mirror));assert(existsSync(join(root,'packages/core/schema/obsolete.json')));
 }finally{rmSync(root,{recursive:true,force:true});}
});
