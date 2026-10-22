import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {selectedCommands,executeCommands} from './package-quality.mjs';
import {packageImpact} from './workflow-supply/public/impact.mjs';
const root=resolve(import.meta.dirname,'..'),config={packages:['packages/core','packages/cloudflare']};
test('Cloudflare edits omit core tests and typechecks while retaining coupled strong gates',()=>{
 const selection=packageImpact(root,config,{trusted:true,changes:['packages/cloudflare/src/studio.ts']});
 assert.deepEqual(selection.test,['packages/cloudflare']);const commands=selectedCommands(root,selection,'source');const turbo=commands.filter(c=>c.includes('scripts/task-runtime.mjs'));
 assert.equal(turbo.length,2);for(const c of turbo){assert(c.includes('--filter=@alneas/sitekit-cloudflare'));assert(!c.includes('--filter=@alneas/sitekit'));}
 for(const name of ['test:contracts','quality:checks','release:registry','test:boundary','verify:public','docs:check','test:site-build','test:consumer','test:npm','test:example'])assert(commands.some(c=>c[2]===name),name);
});
test('core edits include adapter consumers on both Node compatibility and primary gates',()=>{const selection=packageImpact(root,config,{trusted:true,changes:['packages/core/src/config.ts']});assert.deepEqual(selection.test,config.packages);const command=selectedCommands(root,selection,'compatibility').find(c=>c.includes('scripts/task-runtime.mjs'));assert(command.includes('--filter=@alneas/sitekit'));assert(command.includes('--filter=@alneas/sitekit-cloudflare'));});
test('selected required command failure stops before later gates',()=>{const calls=[];assert.throws(()=>executeCommands(root,[['node','first'],['node','failure'],['node','never']],{run:(_command,args)=>{calls.push(args[0]);return {status:args[0]==='failure'?1:0};}}),/required gate failed/);assert.deepEqual(calls,['first','failure']);});

test('unchanged compatibility restores required outputs without launching package tests',()=>{assert.deepEqual(selectedCommands(root,{test:[]},'compatibility'),[['bun','run','build:all']]);});

import {readFileSync} from 'node:fs';
test('both runtime jobs reach the shared gate and full verification stays available',()=>{const p=JSON.parse(readFileSync(new URL('./workflow-project/roles.json',import.meta.url)));assert.equal(p.source.jobs.verify.steps.find(s=>s.name==='Verify Node 26 runtime compatibility').run,'bun run quality:ci');assert.deepEqual(p.quality.tasks.find(t=>t.id==='source').command,['node','scripts/package-quality.mjs','source']);const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));assert.equal(pkg.scripts['quality:full'],'bun run release:check');});

test('contract changes select their owning packages while the receipt gate remains mandatory', () => {
 for (const file of ['packages/cloudflare/src/projection.ts', 'packages/cloudflare/src/projection.test.ts', 'packages/core/src/ai/representation.test.ts', 'scripts/verify-contracts.mjs', 'scripts/verify-contracts.test.mjs']) {
  const selection = packageImpact(root, config, { trusted: true, changes: [file] });
  const commands = selectedCommands(root, selection, 'source');
  assert(commands.some(command => command[2] === 'test:contracts'), file);
  assert(selection.test.includes(file.startsWith('packages/cloudflare/') ? 'packages/cloudflare' : 'packages/core'), file);
 }
});

test('the contract entrypoint builds Core before Cloudflare imports its published entrypoints', () => {
 const scripts=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).scripts;
 assert.equal(scripts['test:contracts'].split(' && ')[0], 'bun run build');
});
