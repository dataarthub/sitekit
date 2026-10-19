import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const source = resolve(import.meta.dirname, '..');
test('actual core build preserves its owning changelog instead of copying root history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sitekit-core-history-'));
  try {
    for (const name of ['README.md','LICENSE','CHANGELOG.md','THIRD_PARTY_NOTICES.json','docs.manifest.json','llms.txt','llms-full.txt','schema','skills','examples','docs']) {
      await cp(join(source,name),join(directory,name),{recursive:true});
    }
    await mkdir(join(directory,'scripts')); await mkdir(join(directory,'packages/core'),{recursive:true});
    for (const name of ['build-core.mjs','package-readme.mjs']) await cp(join(source,'scripts',name),join(directory,'scripts',name));
    for (const name of ['src','package.json','tsconfig.json']) await cp(join(source,'packages/core',name),join(directory,'packages/core',name),{recursive:true});
    // Only this disposable build fixture borrows installed public dependencies; packed consumers remain isolated.
    await symlink(join(source,'node_modules'),join(directory,'node_modules'),'dir');
    const history = '# Changelog\n\n## 0.1.0\n\n- Package-specific release history.\n';
    await writeFile(join(directory,'packages/core/CHANGELOG.md'),history);
    execFileSync('bun',['scripts/build-core.mjs'],{cwd:directory,encoding:'utf8',stdio:'pipe',timeout:60_000});
    assert.equal(await readFile(join(directory,'packages/core/CHANGELOG.md'),'utf8'),history);
    const output = JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--dry-run','--json'],{cwd:join(directory,'packages/core'),encoding:'utf8',env:{...process.env,NPM_CONFIG_USERCONFIG:'/dev/null',NPM_CONFIG_CACHE:join(directory,'npm-cache')}}));
    assert(output[0].files.some(file=>file.path==='CHANGELOG.md'));
  } finally { await rm(directory,{recursive:true,force:true}); }
});
