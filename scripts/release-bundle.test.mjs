import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyBundleIdentity, requiredTags } from './release-bundle-core.mjs';
const commit = 'a'.repeat(40);
const targets = [
  { name: '@alneas/sitekit', version: '0.1.0' },
  { name: '@alneas/sitekit-cloudflare', version: '0.1.0' },
];
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'sitekit-release-identity-'));
  try {
    const artifacts = [];
    for (const [i, target] of targets.entries()) {
      const bytes = Buffer.from('reviewed archive ' + i),
        archive = 'package-' + i + '.tgz';
      await writeFile(join(directory, archive), bytes);
      const notes = 'notes-' + i + '.notes.md';
      const noteBytes = Buffer.from('# ' + target.name + ' ' + target.version + '\n\n- Reviewed change.\n');
      await writeFile(join(directory, notes), noteBytes);
      artifacts.push({
        ...target,
        archive,
        notes,
        notesSha256: createHash('sha256').update(noteBytes).digest('hex'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        integrity:
          'sha512-' + createHash('sha512').update(bytes).digest('base64'),
      });
    }
    await run(directory, {
      schemaVersion: 1,
      commit,
      targets: targets.map((target) => target.name),
      artifacts,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test('binds every selected package and exact bytes to the reviewed source commit', () =>
  fixture(async (directory, manifest) => {
    await verifyBundleIdentity(manifest, {
      directory,
      expectedCommit: commit,
      targets,
    });
  }));
test('rejects stale commits, changed bytes, missing targets and duplicate targets', () =>
  fixture(async (directory, manifest) => {
    await assert.rejects(
      verifyBundleIdentity(manifest, {
        directory,
        expectedCommit: 'b'.repeat(40),
        targets,
      }),
    );
    await assert.rejects(
      verifyBundleIdentity(
        { ...manifest, artifacts: manifest.artifacts.slice(0, 1) },
        { directory, expectedCommit: commit, targets },
      ),
    );
    await assert.rejects(
      verifyBundleIdentity(
        {
          ...manifest,
          artifacts: [manifest.artifacts[0], manifest.artifacts[0]],
        },
        { directory, expectedCommit: commit, targets },
      ),
    );
    await writeFile(
      join(directory, manifest.artifacts[0].archive),
      'changed bytes',
    );
    await assert.rejects(
      verifyBundleIdentity(manifest, {
        directory,
        expectedCommit: commit,
        targets,
      }),
    );
  }));
test('rejects archive traversal and symlink substitution', () =>
  fixture(async (directory, manifest) => {
    await assert.rejects(
      verifyBundleIdentity(
        {
          ...manifest,
          artifacts: [
            { ...manifest.artifacts[0], archive: '../escape.tgz' },
            manifest.artifacts[1],
          ],
        },
        { directory, expectedCommit: commit, targets },
      ),
    );
    const archive = manifest.artifacts[0].archive;
    await rm(join(directory, archive));
    await symlink(
      join(directory, manifest.artifacts[1].archive),
      join(directory, archive),
    );
    await assert.rejects(
      verifyBundleIdentity(manifest, {
        directory,
        expectedCommit: commit,
        targets,
      }),
    );
  }));
test('pre-1.0 releases require both beta and latest without changing version strings', () => {
  assert.deepEqual(requiredTags('0.1.0'), ['beta', 'latest']);
  assert.deepEqual(requiredTags('0.9.0-beta.1'), ['beta', 'latest']);
  assert.deepEqual(requiredTags('1.0.0'), ['latest']);
  assert.throws(() => requiredTags('not-a-version'));
});
test('publication selection cannot invent targets or hide missing support archives', () =>
  fixture(async (directory, manifest) => {
    await verifyBundleIdentity(
      { ...manifest, targets: ['@alneas/sitekit'] },
      { directory, expectedCommit: commit, targets },
    );
    for (const selected of [
      [],
      ['@example/unknown'],
      ['@alneas/sitekit', '@alneas/sitekit'],
    ])
      await assert.rejects(
        verifyBundleIdentity(
          { ...manifest, targets: selected },
          { directory, expectedCommit: commit, targets },
        ),
      );
  }));
test('SemVer pre-1.0 also includes 1.0.0 prereleases and rejects invalid identifiers', () => {
  assert.deepEqual(requiredTags('1.0.0-rc.1'), ['beta', 'latest']);
  assert.deepEqual(requiredTags('1.0.1-rc.1'), ['latest']);
  for (const version of ['0.1.0-01', '0.1.0-a..b', '0.1.0+..'])
    assert.throws(() => requiredTags(version));
});
test('handoff rejects dirty source even when HEAD and package versions match', () =>
  fixture(async (directory, manifest) => {
    const { mkdir } = await import('node:fs/promises');
    const { execFileSync } = await import('node:child_process');
    const { readBundle } = await import('./release-bundle-core.mjs');
    for (const [i, kind] of ['core', 'cloudflare'].entries()) {
      await mkdir(join(directory, 'packages', kind), { recursive: true });
      await writeFile(
        join(directory, 'packages', kind, 'package.json'),
        JSON.stringify(targets[i]),
      );
    }
    await writeFile(join(directory, '.gitignore'), '*.tgz\nrelease.json\n');
    await writeFile(join(directory, 'source.txt'), 'reviewed');
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    git('init', '--quiet');
    git('add', '.');
    git(
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    );
    manifest.commit = git('rev-parse', 'HEAD');
    await writeFile(join(directory, 'release.json'), JSON.stringify(manifest));
    await readBundle(directory, directory);
    await writeFile(join(directory, 'source.txt'), 'uncommitted edits');
    await assert.rejects(
      readBundle(directory, directory),
      /clean|committed|source/i,
    );
  }));

test('handoff binds release notes and rejects changed, missing or escaping notes', () => fixture(async (directory, manifest) => {
  const artifact = manifest.artifacts[0];
  await writeFile(join(directory, artifact.notes), 'Unexpected substituted release notes');
  await assert.rejects(verifyBundleIdentity(manifest, {directory,expectedCommit:commit,targets}), /notes/i);
  artifact.notes = '../outside.md';
  await assert.rejects(verifyBundleIdentity(manifest, {directory,expectedCommit:commit,targets}), /notes/i);
  delete artifact.notes;
  await assert.rejects(verifyBundleIdentity(manifest, {directory,expectedCommit:commit,targets}), /notes/i);
}));
