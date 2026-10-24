import {verifyPackedDocumentation} from './packed-docgen.mjs';
// Prepare once, retain the exact archives, then perform read-only identity checks at handoff.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { captureProcess } from './process-capture.mjs';
import {
  digest,
  readBundle,
  sourceCommit,
  sourceTargets,
  registry,
  requiredTags,
} from './release-bundle-core.mjs';
import {
  verifyFilePath,
  verifyPackages,
  verifyPackedManifest,
  verifyPackedExports,
} from './boundary.mjs';
import { releaseNotes, assertPreparedNotes } from './release-notes.mjs';
import { releaseContext, assertReleaseSelection } from './release-context.mjs';
import {packageRoot, recoverySelection, readFresh, candidates} from './release-recovery.mjs';
const controlRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = packageRoot(controlRoot);
function run(command, args, { capture = false } = {}) {
  return captureProcess(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    env: { ...process.env, NODE_PATH: '', NPM_CONFIG_USERCONFIG: '/dev/null' },
  });
}
function argument(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  assert(
    process.argv[index + 1] && !process.argv[index + 1].startsWith('--'),
    'Missing ' + flag,
  );
  return process.argv[index + 1];
}
function cleanSource() {
  assert(
    run('git', ['status', '--porcelain', '--untracked-files=normal'], {
      capture: true,
    }).trim().length === 0,
    'Commit the reviewed source before preparing a release bundle',
  );
}
async function audit(directory) {
  const manifest = await readBundle(directory, root);
  for (const artifact of manifest.artifacts) {
    const archive = join(directory, artifact.archive),
      paths = run('tar', ['-tzf', archive], { capture: true })
        .trim()
        .split('\n');
    assert(
      paths.length &&
        paths.every(
          (p) => p.startsWith('package/') && !p.split('/').includes('..'),
        ),
      'Unsafe archive member',
    );
    for (const path of paths)
      verifyFilePath(
        path,
        artifact.name.endsWith('-cloudflare') ? 'cloudflare' : 'core',
      );
    const meta = JSON.parse(
      run('tar', ['-xOzf', archive, 'package/package.json'], { capture: true }),
    );
    assert.equal(meta.name, artifact.name);
    assert.equal(meta.version, artifact.version);
    assert.equal(meta.publishConfig?.registry, registry);
    assert.equal(meta.publishConfig?.access, 'public');
    verifyPackedManifest(meta);
    verifyPackedExports(meta, paths);
    const target = (await sourceTargets(root)).find(target => target.name === artifact.name);
    const canonical = await readFile(join(root,'packages',target.kind,'CHANGELOG.md'),'utf8');
    assert.equal(run('tar', ['-xOzf', archive, 'package/CHANGELOG.md'], {capture:true}), canonical, 'Packed changelog differs from owning package');
    assert.equal(await readFile(join(directory,artifact.notes),'utf8'), releaseNotes(target,canonical), 'Release notes differ from canonical package changelog');
    verifyPackages(
      run('tar', ['-xOzf', archive], { capture: true }),
      'release archive',
    );
    assert.equal(
      run('tar', ['-xOzf', archive, 'package/LICENSE'], { capture: true }),
      await readFile(join(root, 'LICENSE'), 'utf8'),
    );
  }
  return manifest;
}
async function prepare() {
  cleanSource();
  const commit = sourceCommit(root);
  const directory = resolve(
    argument('--output-dir') ?? join(root, '.verification/releases', commit),
  );
  assert(
    directory !== root && relative(directory, root).startsWith('..'),
    'Bundle directory must not contain the source checkout',
  );
  await mkdir(resolve(root, '.verification/releases'), { recursive: true });
  await mkdir(directory, { recursive: true });
  // Never overwrite retained evidence; callers select another empty destination when intentionally preparing again.
  const { readdir } = await import('node:fs/promises');
  assert.equal(
    (await readdir(directory)).length,
    0,
    'Release destination is not empty',
  );
  try {
    const recovery=process.env.RECOVER_RELEASE ? await recoverySelection(controlRoot,root) : null;
    const fresh=process.env.PUBLISH_PACKAGE_ROOT ? readFresh(controlRoot,root) : null;
    const sourceProof=fresh
      ?await (await import('./workflow-supply/public/quality.mjs')).requireSource(root,{imagePolicy:'authenticate'})
      :process.env.GITHUB_ACTIONS==='true'
      ?await (await import('./workflow-supply/public/quality.mjs')).releaseProof(root):null;
    if(sourceProof){
      // Source tests are established by exact main evidence; inspect the newly built payload below.
      run('node',['scripts/quality-gates.mjs','secrets:history']);
      run('bun',['run','build:all']);
      run('bun',['run','release:registry']);
    }else run('bun', ['run', 'quality:push']);
    cleanSource();
    assert.equal(
      sourceCommit(root),
      commit,
      'Source changed during verification',
    );
    const selected = (argument('--targets') ?? 'core,cloudflare').split(',');
    assert(
      selected.length > 0 &&
        new Set(selected).size === selected.length &&
        selected.every((kind) => ['core', 'cloudflare'].includes(kind)),
      'Targets must be core, cloudflare, or core,cloudflare',
    );
    const selection=recovery??(process.env.GITHUB_ACTIONS==='true'?releaseContext({root}):undefined);
    if(selection)assert.deepEqual(selected,[selection.kind],'Release selects one owning package');
    const sourcePackages = await sourceTargets(root);
    await assertPreparedNotes(root, sourcePackages.filter(target => selected.includes(target.kind)).map(target => target.name));
    const artifacts = [];
    for (const target of await sourceTargets(root)) {
      const output = JSON.parse(
        execFileSync(
          'npm',
          [
            'pack',
            '--ignore-scripts',
            '--json',
            '--pack-destination',
            directory,
          ],
          {
            cwd: join(root, 'packages', target.kind),
            encoding: 'utf8',
            env: { ...process.env, NPM_CONFIG_USERCONFIG: '/dev/null' },
          },
        ),
      )[0];
      const bytes = await readFile(join(directory, output.filename));
      const notes = output.filename.replace(/\.tgz$/, '.notes.md');
      const noteBytes = releaseNotes(target, await readFile(join(root,'packages',target.kind,'CHANGELOG.md'),'utf8'));
      await writeFile(join(directory, notes), noteBytes);
      artifacts.push({
        notes,
        notesSha256: digest(Buffer.from(noteBytes)).sha256,
        name: target.name,
        version: target.version,
        archive: output.filename,
        ...digest(bytes),
        files: output.files.length,
      });
    }
    const manifest = {
      schemaVersion: 1,
      ...(selection?{release:{id:selection.releaseId,tag:selection.tag}}:{}),
      ...(process.env.GITHUB_ACTIONS === 'true' ? { staging: { runId: Number(process.env.GITHUB_RUN_ID), attempt: Number(process.env.GITHUB_RUN_ATTEMPT) } } : {}),
      ...(recovery?{recovery:{candidate:candidates[process.env.RECOVER_RELEASE],freshVerification:fresh}}:{}),
      ...(fresh?{freshVerification:fresh}:{}),
      commit,
      targets: (await sourceTargets(root))
        .filter((target) => selected.includes(target.kind))
        .map((target) => target.name),
      repository: 'https://github.com/dataarthub/sitekit',
      toolchain: {
        node: process.version,
        bun: run('bun', ['--version'], { capture: true }).trim(),
        npm: run('npm', ['--version'], { capture: true }).trim(),
      },
      artifacts,
    };
    if(selection)assertReleaseSelection(manifest,selection);
    await writeFile(
      join(directory, 'release.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    await audit(directory);
    run('bun', [
      'scripts/public-consumer-smoke.mjs',
      '--artifacts-dir',
      directory,
    ]);
    run('bun', [
      'scripts/npm-consumer-smoke.mjs',
      '--artifacts-dir',
      directory,
    ]);
    const packedDocumentation=await verifyPackedDocumentation(directory,{root});
    cleanSource();
    assert.equal(
      sourceCommit(root),
      commit,
      'Source changed during artifact verification',
    );
    manifest.verification = {
      qualityPush: true,
      sourceEvidence:sourceProof?{run:sourceProof.run.id,attempt:sourceProof.run.run_attempt,commit:sourceProof.run.head_sha}:null,
      packedDocumentation,
      bunSelectedArchives: true,
      npmSelectedArchives: true,
    };
    await writeFile(
      join(directory, 'release.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    console.log('Verified release bundle: ' + relative(root, directory));
  } catch (error) {
    await rm(join(directory, 'release.json'), { force: true });
    throw error;
  }
}
async function registryCheck(directory) {
  const manifest = await audit(directory);
  for (const artifact of manifest.artifacts.filter((item) =>
    manifest.targets.includes(item.name),
  )) {
    const meta = JSON.parse(
      run(
        'npm',
        [
          'view',
          `${artifact.name}@${artifact.version}`,
          '--json',
          '--registry=' + registry,
        ],
        { capture: true },
      ),
    );
    assert.equal(meta.name, artifact.name);
    assert.equal(meta.version, artifact.version);
    assert.equal(
      meta.dist?.integrity,
      artifact.integrity,
      'Registry integrity differs from the reviewed archive',
    );
    const url = new URL(meta.dist.tarball);
    assert.equal(url.origin, registry, 'Unexpected tarball origin');
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    assert(response.ok, 'Registry tarball is unavailable');
    assert.equal(
      digest(Buffer.from(await response.arrayBuffer())).sha256,
      artifact.sha256,
      'Delivered tarball differs from the reviewed archive',
    );
    const tags = JSON.parse(
      run(
        'npm',
        [
          'view',
          artifact.name,
          'dist-tags',
          '--json',
          '--registry=' + registry,
        ],
        { capture: true },
      ),
    );
    for (const tag of requiredTags(artifact.version))
      assert.equal(
        tags[tag],
        artifact.version,
        'Missing/conflicting npm distribution tag: ' + tag,
      );
    console.log(
      artifact.name +
        '@' +
        artifact.version +
        ': registry archive and distribution tags verified',
    );
  }
}
const command = process.argv[2];
try {
  if (command === 'prepare') await prepare();
  else if (command === 'verify') {
    const directory = resolve(argument('--bundle') ?? '');
    assert(argument('--bundle'), 'Missing --bundle');
    const manifest = await audit(directory);
    assert(
      manifest.verification?.qualityPush &&
        manifest.verification?.bunSelectedArchives &&
        manifest.verification?.npmSelectedArchives,
      'Bundle lacks successful verification evidence',
    );
    console.log('Commit and exact release archives verified');
  } else if (command === 'registry') {
    assert(argument('--bundle'), 'Missing --bundle');
    await registryCheck(resolve(argument('--bundle')));
  } else
    throw Error(
      'Usage: release-bundle.mjs prepare [--output-dir directory] [--targets core,cloudflare] | verify --bundle directory | registry --bundle directory',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
