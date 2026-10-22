import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFilePath,verifyPackages,verifyPackedManifest} from './boundary.mjs';
test('packed manifests contain installable dependency versions',()=>{
 verifyPackedManifest({license:'MIT',devDependencies:{'@alneas/sitekit':'0.1.0'},peerDependencies:{'@alneas/sitekit':'^0.1.0'}});
 for(const section of ['dependencies','devDependencies','peerDependencies','optionalDependencies']){
  for(const version of ['workspace:*','file:../../core','link:../core']){
   assert.throws(()=>verifyPackedManifest({license:'MIT',[section]:{'@alneas/sitekit':version}}));
  }
 }
});
test('distribution files exclude test files and source maps',()=>{
 for(const path of ['dist/config/index.test.js','dist/content/foo.spec.d.ts','dist/config/index.d.ts.map','packages/core/dist/config/index.js.map','packages/cloudflare/dist/studio.test.js'])assert.throws(()=>verifyFilePath(path));
 verifyFilePath('package/dist/studio/BasicStudioApp.js');
 verifyFilePath('package/src/studio/studio.css');
 verifyFilePath('package/dist/studio-handler.d.ts','cloudflare');
});
test('private sibling paths and packages are rejected',()=>{
 assert.throws(()=>verifyFilePath('sitekit-private/package.json'));
 assert.throws(()=>verifyFilePath('package/.verification/logs/receipt.txt'));
 assert.throws(()=>verifyPackages('@alneas/'+'sitekit-private','fixture'));
});
test('release packages are publishable only with the full validation hook', async()=>{
 const {verifyReleasePackageManifest}=await import('./boundary.mjs');
 const release={version:'0.1.0',license:'MIT',publishConfig:{registry:'https://registry.npmjs.org',access:'public'},scripts:{prepublishOnly:'bun run --cwd ../.. release:check'}};
 verifyReleasePackageManifest(release);
 for(const invalid of [
  {...release,private:true},
  {...release,scripts:{}},
  {...release,scripts:{prepublishOnly:'bun ../../scripts/block-publication.mjs'}},
  {...release,publishConfig:{registry:'https://registry.npmjs.org',access:'restricted'}},
 ])assert.throws(()=>verifyReleasePackageManifest(invalid));
});
test('packed release manifests cannot retain private publication blockers',()=>{
 assert.throws(()=>verifyPackedManifest({license:'MIT',private:true}));
});
test('release validation follows each manifest version instead of freezing the initial release',async()=>{
 const {verifyReleasePackageManifest}=await import('./boundary.mjs');
 const meta={version:'0.1.1',license:'MIT',publishConfig:{registry:'https://registry.npmjs.org',access:'public'},scripts:{prepublishOnly:'bun run --cwd ../.. release:check'}};
 verifyReleasePackageManifest(meta);assert.throws(()=>verifyReleasePackageManifest({...meta,version:'invalid'}));
});
test('task caches and replay logs cannot enter public package payloads', () => {
  for (const path of ['package/.turbo/cache/result.json','package/docs/.turbo/turbo-build.log']) assert.throws(() => verifyFilePath(path));
});

test('credential tokens remain blocked while task requirement identifiers are accepted', async () => {
  const {verifyCredentialPatterns} = await import('./boundary.mjs');
  assert.doesNotThrow(() => verifyCredentialPatterns('development.task-' + 'a'.repeat(30), 'catalog.json'));
  for (const token of [['sk', 'a'.repeat(30)].join('-'), ['ghp', 'a'.repeat(30)].join('_'), ['AKIA', 'A'.repeat(16)].join('')]) {
    assert.throws(() => verifyCredentialPatterns(JSON.stringify({token}), 'fixture.json'), /Credential pattern/);
  }
});
