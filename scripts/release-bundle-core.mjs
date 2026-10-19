import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
export const registry = 'https://registry.npmjs.org';
export function digest(bytes) {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
  };
}
export function requiredTags(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(
      version,
    );
  assert(match, 'Invalid package version');
  if (match[4])
    assert(
      match[4]
        .split('.')
        .every(
          (part) =>
            part.length > 0 &&
            (!/^\d+$/.test(part) || part === '0' || !part.startsWith('0')),
        ),
      'Invalid prerelease identifier',
    );
  if (match[5])
    assert(
      match[5].split('.').every((part) => part.length > 0),
      'Invalid build identifier',
    );
  return match[1] === '0' ||
    (match[1] === '1' && match[2] === '0' && match[3] === '0' && match[4])
    ? ['beta', 'latest']
    : ['latest'];
}
export async function verifyBundleIdentity(
  manifest,
  { directory, expectedCommit, targets },
) {
  assert.equal(manifest.schemaVersion, 1, 'Unsupported release manifest');
  assert.match(manifest.commit, /^[a-f0-9]{40}$/, 'Missing source commit');
  assert.equal(
    manifest.commit,
    expectedCommit,
    'Release belongs to a different commit',
  );
  assert.equal(
    manifest.artifacts?.length,
    targets.length,
    'Missing or extra release targets',
  );
  {
    assert(
      Array.isArray(manifest.targets) && manifest.targets.length > 0,
      'No publication targets selected',
    );
    assert.equal(
      new Set(manifest.targets).size,
      manifest.targets.length,
      'Duplicate selected targets',
    );
    for (const name of manifest.targets)
      assert(
        targets.some((target) => target.name === name),
        'Unapproved selected target',
      );
  }
  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    assert(!seen.has(artifact.name), 'Duplicate release target');
    seen.add(artifact.name);
    const target = targets.find((t) => t.name === artifact.name);
    assert(target, 'Unapproved release target');
    assert.equal(
      artifact.version,
      target.version,
      'Release version differs from source',
    );
    assert.equal(
      artifact.archive,
      basename(artifact.archive),
      'Archive escaped bundle',
    );
    assert.match(artifact.archive, /^[a-zA-Z0-9._-]+\.tgz$/);
    const path = join(directory, artifact.archive),
      stat = await lstat(path);
    assert(
      stat.isFile() && !stat.isSymbolicLink(),
      'Archive must be a regular file',
    );
    const actual = digest(await readFile(path));
    assert.equal(actual.sha256, artifact.sha256, 'Archive SHA-256 mismatch');
    assert.equal(
      actual.integrity,
      artifact.integrity,
      'Archive SHA-512 mismatch',
    );
    assert.equal(typeof artifact.notes, 'string', 'Missing release notes');
    assert.equal(artifact.notes, basename(artifact.notes), 'Release notes escaped bundle');
    assert.match(artifact.notes, /^[a-zA-Z0-9._-]+\.notes\.md$/, 'Invalid release notes filename');
    const notesPath = join(directory, artifact.notes), notesStat = await lstat(notesPath);
    assert(notesStat.isFile() && !notesStat.isSymbolicLink(), 'Release notes must be a regular file');
    assert.equal(digest(await readFile(notesPath)).sha256, artifact.notesSha256, 'Release notes SHA-256 mismatch');

  }
  return manifest;
}
export async function sourceTargets(root) {
  return Promise.all(
    ['core', 'cloudflare'].map(async (kind) => {
      const meta = JSON.parse(
        await readFile(join(root, 'packages', kind, 'package.json'), 'utf8'),
      );
      return { kind, name: meta.name, version: meta.version };
    }),
  );
}
export function sourceCommit(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}
export async function readBundle(directory, root) {
  assert(
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      cwd: root,
      encoding: 'utf8',
    }).trim().length === 0,
    'Release handoff requires clean committed source',
  );
  const manifest = JSON.parse(
    await readFile(join(directory, 'release.json'), 'utf8'),
  );
  await verifyBundleIdentity(manifest, {
    directory,
    expectedCommit: sourceCommit(root),
    targets: await sourceTargets(root),
  });
  return manifest;
}
export async function selectedArchives(
  root,
  args = process.argv.slice(2),
  destination,
) {
  const index = args.indexOf('--artifacts-dir');
  if (index < 0) return null;
  assert(args[index + 1], 'Missing --artifacts-dir');
  const directory = resolve(args[index + 1]);
  const manifest = await readBundle(directory, root);
  assert(destination, 'Selected archives require owned isolated storage');
  await mkdir(destination, { recursive: true });
  const copies = {};
  for (const [kind, name] of [
    ['core', '@alneas/sitekit'],
    ['cloudflare', '@alneas/sitekit-cloudflare'],
  ]) {
    const artifact = manifest.artifacts.find((a) => a.name === name);
    const bytes = await readFile(join(directory, artifact.archive));
    const actual = digest(bytes);
    assert.equal(
      actual.sha256,
      artifact.sha256,
      'Selected archive changed before copying',
    );
    assert.equal(
      actual.integrity,
      artifact.integrity,
      'Selected archive changed before copying',
    );
    const path = join(destination, kind + '.tgz');
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    copies[kind] = path;
  }
  return copies;
}
