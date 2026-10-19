// Read-only npmjs verification; never publish or change authentication settings.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {boundary} from './boundary.mjs';
const lock=await readFile(new URL('../bun.lock',import.meta.url),'utf8');
for(const [name,version] of Object.entries(boundary.publicAppkitVersions)){
 const meta=JSON.parse(execFileSync('npm',['view',`${name}@${version}`,'--json','--registry=https://registry.npmjs.org'],{encoding:'utf8',env:{...process.env,NPM_CONFIG_USERCONFIG:'/dev/null'},timeout:60000}));
 assert.equal(meta.name,name);assert.equal(meta.version,version);
 assert(meta.dist?.tarball.startsWith('https://registry.npmjs.org/'),'Unexpected registry tarball');
 assert(meta.dist?.integrity?.startsWith('sha512-'),'Missing registry integrity');
 assert(lock.includes(JSON.stringify(`${name}@${version}`))&&lock.includes(meta.dist.integrity),'Registry version/integrity differs from lockfile');
 console.log(`${name}@${version}: npmjs version and lockfile integrity verified`);
}
console.log('Public Appkit registry verification passed');
