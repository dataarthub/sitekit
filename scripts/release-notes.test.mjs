import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { changelogEntry, releaseNotes, validateChangeRecords, introducedChangesets, preparedChangeRecords } from './release-notes.mjs';
const core = { kind: 'core', name: '@alneas/sitekit', version: '0.1.0' };
test('release notes contain only the exact selected version and retain its migration guidance', () => {
  const text = '# Changelog\n\n## 0.2.0\n\n- Future change.\n\n## 0.1.0 — prepared locally, not published\n\n### Added\n\n- Build from one publication.\n\nUpgrade: keep the host revision pinned.\n\n## 0.0.1\n\n- Older version.\n';
  const notes = releaseNotes(core, text);
  assert.match(notes, /^# @alneas\/sitekit 0\.1\.0\n/);
  assert.match(notes, /keep the host revision pinned/);
  assert.doesNotMatch(notes, /Future change|Older version/);
  assert.match(changelogEntry('# History\n\n## [0.1.0]\n\n- Fix loading.\n', '0.1.0'), /Fix loading/);
});
test('missing, duplicate, empty and placeholder version entries block release', () => {
  for (const text of ['# Changelog\n', '## 0.1.0\n\n## 0.0.1\n- Older.', '## 0.1.0\n\nTBD\n', '## 0.1.0\n- First.\n## 0.1.0\n- Duplicate.']) {
    assert.throws(() => changelogEntry(text, '0.1.0'));
  }
  assert.throws(() => changelogEntry('## 0.1.01\n- Wrong version.\n', '0.1.0'));
});
test('release-impacting changes require a fragment for every affected package or an explicit no-release rationale', () => {
  const targets = [core, {kind:'cloudflare',name:'@alneas/sitekit-cloudflare',version:'0.1.0'}];
  const paths = ['packages/core/src/config/index.ts', 'packages/cloudflare/src/handler.ts'];
  const changesets = [{id:'core-fix',summary:'Fix config validation.',releases:[{name:core.name,type:'patch'}]}];
  assert.throws(() => validateChangeRecords({paths,targets,changesets}), /sitekit-cloudflare/);
  assert.doesNotThrow(() => validateChangeRecords({paths,targets,changesets:[...changesets,{id:'adapter-fix',summary:'Fix handler.',releases:[{name:targets[1].name,type:'patch'}]}]}));
  assert.doesNotThrow(() => validateChangeRecords({paths,targets,changesets:[],rationale:'No release: only verification fixtures changed; no delivered runtime or metadata changes.'}));
  assert.throws(() => validateChangeRecords({paths,targets,changesets:[],rationale:'No release: TODO'}));
  assert.throws(() => validateChangeRecords({paths,targets,changesets:[{...changesets[0],summary:'',releases:[{name:core.name,type:'patch'}]}]}));
});
test('shipped README and generated documentation count as consumer changes; test-only files do not', () => {
  const targets = [core, {kind:'cloudflare',name:'@alneas/sitekit-cloudflare',version:'0.1.0'}];
  for (const path of ['README.md','docs/api.md','scripts/prepare-docs.mjs','packages/cloudflare/README.md','packages/core/CHANGELOG.md']) {
    assert.throws(() => validateChangeRecords({paths:[path],targets,changesets:[]}));
  }
  assert.doesNotThrow(() => validateChangeRecords({paths:['packages/core/src/config/index.test.ts','CONTRIBUTING.md','scripts/release-notes.test.mjs'],targets,changesets:[]}));
});

test('an unchanged pending fragment cannot cover a later introducing PR', () => {
  const old = {id:'earlier-fix',summary:'Earlier change.',releases:[{name:core.name,type:'patch'}]};
  const incoming = {id:'current-fix',summary:'Current fix.',releases:[{name:core.name,type:'patch'}]};
  assert.deepEqual(introducedChangesets([old,incoming],['packages/core/src/config/index.ts','.changeset/current-fix.md']),[incoming]);
  assert.throws(()=>validateChangeRecords({paths:['packages/core/src/config/index.ts'],targets:[core],changesets:introducedChangesets([old],['packages/core/src/config/index.ts'])}), /Missing change fragment/);
});

test('no-release placeholders cannot hide behind whitespace or unrelated following paragraphs', () => {
  for (const rationale of [
    'No release: TODO provide a rationale here later',
    'No release:     TBD explain the release impact later',
    'No release: <specific rationale goes here>',
    'No release:\n\nThis unrelated paragraph is at least twenty characters.',
    'No release:   \nThis unrelated paragraph is at least twenty characters.',
  ]) assert.throws(()=>validateChangeRecords({paths:['packages/core/src/config/index.ts'],targets:[core],changesets:[],rationale}), /Missing change fragment/);
});

test('shipped examples, license, notices and adapter build inputs require their owning change record', () => {
  const cloud = {kind:'cloudflare',name:'@alneas/sitekit-cloudflare',version:'0.1.0'};
  for (const path of ['examples/basic/src/pages/index.astro','LICENSE','THIRD_PARTY_NOTICES.json','scripts/build-cloudflare.mjs']) {
    assert.throws(()=>validateChangeRecords({paths:[path],targets:[core,cloud],changesets:[]}), /Missing change fragment/);
  }
  assert.deepEqual(validateChangeRecords({paths:['scripts/build-cloudflare.mjs'],targets:[core,cloud],changesets:[{id:'adapter-build',summary:'Correct adapter payload metadata.',releases:[{name:cloud.name,type:'patch'}]}]}),[cloud.name]);
});
test('version-preparation records require an advance and the exact matching cumulative entry', async () => {
  const root = await mkdtemp(join(tmpdir(),'sitekit-prepared-notes-'));
  const prefix='packages/core/';
  const paths=[prefix+'package.json',prefix+'CHANGELOG.md'];
  const git = args => execFileSync('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-c','user.name=Release fixture','-c','user.email=fixture@example.invalid',...args],{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();
  try {
    await mkdir(join(root,prefix),{recursive:true});
    await writeFile(join(root,prefix,'package.json'),JSON.stringify({name:core.name,version:'0.1.0'}));
    await writeFile(join(root,prefix,'CHANGELOG.md'),'# Changelog\n\n## 0.1.0\n\n- Original release.\n');
    git(['-c','init.templateDir=','init','--quiet']);git(['add','.']);git(['commit','--quiet','-m','Synthetic release baseline']);
    const base=git(['rev-parse','HEAD']);
    assert.deepEqual(await preparedChangeRecords(root,base,paths,[core]),[]);
    const target={...core,version:'0.1.1'};
    await writeFile(join(root,prefix,'package.json'),JSON.stringify(target));
    await assert.rejects(preparedChangeRecords(root,base,paths,[target]), /changelog entry/);
    const history='# Changelog\n\n## 0.1.1\n\n- Preserve the selected package history.\n\n## 0.1.0\n\n- Original release.\n';
    await writeFile(join(root,prefix,'CHANGELOG.md'),history);
    const records=await preparedChangeRecords(root,base,paths,[target]);
    assert.equal(records[0].releases[0].name,core.name);assert.equal(records[0].releases[0].type,'patch');
    assert.match(records[0].summary,/Preserve the selected package history/);
    assert.equal(await readFile(join(root,prefix,'CHANGELOG.md'),'utf8'),history);
    assert.deepEqual(await preparedChangeRecords(root,base,[prefix+'package.json'],[target]),[]);
    await assert.rejects(preparedChangeRecords(root,base,paths,[{...core,version:'0.0.9'}]), /advance/);
  } finally {await rm(root,{recursive:true,force:true});}
});
