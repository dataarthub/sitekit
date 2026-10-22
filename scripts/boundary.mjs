import assert from 'node:assert/strict';
import {requiredTags} from './release-bundle-core.mjs';
import { readFile } from 'node:fs/promises';

export const boundary = JSON.parse(await readFile(new URL('./boundary.json', import.meta.url), 'utf8'));
export const forbidden = new Set(['.turbo', '.verification', '.git', '.npmrc', '.env', 'vendor', 'hotel-site', 'platform', 'templates', 'themes', 'artifacts', 'sitekit-private']);
export const allowedPackages = new Set([
  '@alneas/sitekit', '@alneas/sitekit-cloudflare',
  ...Object.keys(boundary.publicAppkitVersions),
]);
const approvedDocuments = new Set(JSON.parse(await readFile(new URL('../docs.manifest.json', import.meta.url), 'utf8')).documents.filter(doc => doc.visibility === 'public').map(doc => doc.source));
const studioPaths = new Set(boundary.studioSourceFiles.map(name => `src/studio/${name}`));
for (const name of boundary.studioSourceFiles.filter(name => !name.includes('.test.') && /\.tsx?$/.test(name))) {
  const stem = name.replace(/\.tsx?$/, '');
  for (const suffix of ['.js', '.d.ts']) studioPaths.add(`dist/studio/${stem}${suffix}`);
}

export function verifyFilePath(path, packageKind = 'core') {
  const relative = path.replace(/^package\//, '').replace(/^packages\/core\//, '');
  assert(!relative.split('/').some(part => forbidden.has(part)) && !relative.endsWith('.tgz') && !relative.split('/').some(part => part.startsWith('.env.')), `Excluded file: ${path}`);
  if (relative.startsWith('docs/')) assert(approvedDocuments.has(relative), `Non-public document: ${path}`);
  if (relative.startsWith('schema/')) assert(relative === 'schema/site.schema.json', `Non-public schema file: ${path}`);
  const cloudflare = relative.startsWith('packages/cloudflare/') || packageKind === 'cloudflare';
  const local = relative.replace(/^packages\/cloudflare\//, '');
  if (local.startsWith('dist/')) assert(!local.endsWith('.map') && !/(?:^|\/)[^/]*\.(?:test|spec)\./.test(local), `Test or source map in distribution: ${path}`);
  if (cloudflare && /^(src|dist)\//.test(local)) {
    const cloudflarePaths = new Set(boundary.cloudflareSourceFiles.map(name => `src/${name}`));
    for (const name of boundary.cloudflareSourceFiles.filter(name => !name.includes('.test.') && /\.tsx?$/.test(name))) {
      for (const suffix of ['.js', '.d.ts']) cloudflarePaths.add(`dist/${name.replace(/\.ts$/, '')}${suffix}`);
    }
    assert(cloudflarePaths.has(local), `Non-public Cloudflare output: ${path}`);
  } else if (/^(src|dist)\//.test(relative)) {
    const rest = relative.replace(/^(src|dist)\//, '');
    if (rest.startsWith('studio/')) assert(studioPaths.has(relative), `Non-public Studio file: ${path}`);
    else assert(boundary.publicCoreDirectories.includes(rest.split('/')[0]) || /^(?:index|runtime)\.(?:ts|js|js\.map|d\.ts|d\.ts\.map)$/.test(rest), `Non-public core output: ${path}`);
  }
}

export function verifyPackages(text, path) {
  for (const match of text.matchAll(/@(?:dataarthub|alneas)\/[a-z0-9-]+/g)) {
    assert(allowedPackages.has(match[0]), `Private dependency ${match[0]}: ${path}`);
  }
}

/** Validates the approved npm release configuration without publishing anything. */
export function verifyReleasePackageManifest(meta) {
  requiredTags(meta.version);
  assert.notEqual(meta.private, true, 'Release package must be publishable');
  assert.equal(meta.license, 'MIT');
  assert.equal(meta.publishConfig?.registry, 'https://registry.npmjs.org');
  assert.equal(meta.publishConfig?.access, 'public');
  assert.equal(meta.scripts?.prepublishOnly, 'bun run --cwd ../.. release:check', 'Full release validation is required before publishing');
}

/** Rejects dependency specifiers that cannot be installed from a published artifact. */
export function verifyPackedManifest(meta) {
  assert.notEqual(meta.private, true, 'Packed release package must be publishable');
  assert.equal(meta.license, 'MIT');
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(meta[section] ?? {})) {
      assert(!/^(?:workspace|file|link):/.test(version), `Unresolved local dependency in packed manifest: ${name}`);
    }
  }
}

/** Checks every declared package export against the actual packed file list. */
export function verifyPackedExports(meta, files) {
  const paths = new Set(files.map(path => path.replace(/^package\//, '')));
  function check(target) {
    if (typeof target === 'string') assert(target.startsWith('./') && paths.has(target.slice(2)), `Missing packed export: ${target}`);
    else if (target && typeof target === 'object') for (const value of Object.values(target)) check(value);
  }
  for (const target of Object.values(meta.exports ?? {})) check(target);
}

export function verifyCredentialPatterns(text, path) {
  assert(!/(?<![A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text), `Credential pattern: ${path}`);
}
