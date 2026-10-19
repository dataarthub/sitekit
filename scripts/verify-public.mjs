import assert from 'node:assert/strict';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { boundary, forbidden, verifyFilePath, verifyPackages, verifyReleasePackageManifest } from './boundary.mjs';
const root = resolve(import.meta.dirname, '..');
const ignored = new Set(['.turbo', 'node_modules', 'dist', 'coverage', '.astro', '.git', '.DS_Store', '.verification']);
let files = 0;
async function walk(directory) {
  for (const name of await readdir(directory)) {
    const path = resolve(directory, name);
    const stat = await lstat(path);
    if (ignored.has(name)) continue;
    assert(!forbidden.has(name) && !name.endsWith('.tgz') && !name.startsWith('.env.'), `Excluded file: ${path}`);
    assert(!stat.isSymbolicLink(), `Symlink outside dependency tree: ${path}`);
    if (stat.isDirectory()) { await walk(path); continue; }
    verifyFilePath(relative(root, path));
    const text = await readFile(path, 'utf8');
    assert(!/\/(?:Volumes|Users)\//.test(text), `Local path: ${path}`);
    assert(!/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text), `Credential pattern: ${path}`);
    verifyPackages(text, path);
    if (name.endsWith('.md')) assert(!/file:\x2f\x2f/.test(text), `File URI in document: ${path}`);
    files++;
  }
}
await walk(root);
const workspace = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(workspace.private, true, 'Workspace root must remain private');
for (const path of ['packages/core/package.json', 'packages/cloudflare/package.json']) {
  const meta = JSON.parse(await readFile(resolve(root, path), 'utf8'));
  verifyReleasePackageManifest(meta);
  assert(!meta.overrides, 'No private overrides');
  assert.equal(meta.publishConfig?.registry, 'https://registry.npmjs.org');
  assert.equal(meta.publishConfig?.access, 'public');
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(meta[section] ?? {})) {
      if (name in boundary.publicAppkitVersions) assert.equal(version, boundary.publicAppkitVersions[name], `Appkit must use a published registry version: ${name}`);
    }
  }
  if (path === 'packages/core/package.json') assert.deepEqual(Object.keys(meta.exports).sort(), [...boundary.publicCoreExports].sort(), 'Core exports must match approved boundary');
  const requiredExports = path === 'packages/core/package.json' ? boundary.studioExports : ['./studio', './studio-handler'];
  for (const entry of requiredExports) assert(meta.exports[entry], `Missing public export: ${entry}`);
  if (path === 'packages/core/package.json') {
    for (const entry of Object.keys(meta.exports).filter(entry => entry.startsWith('./studio'))) assert(boundary.studioExports.includes(entry), `Non-public export: ${entry}`);
  }
}
const manifest = JSON.parse(await readFile(resolve(root, 'docs.manifest.json'), 'utf8'));
const slugs = new Set();
for (const document of manifest.documents) {
  assert(!slugs.has(document.slug), 'Duplicate doc slug'); slugs.add(document.slug);
  const path = resolve(root, document.source);
  const text = await readFile(path, 'utf8');
  assert(text.includes(`archetype: "${document.archetype}"`), 'Archetype mismatch');
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (!/^(?:https?:|#|mailto:)/.test(match[1])) await lstat(resolve(dirname(path), match[1].split('#')[0]));
  }
}
console.log(`Public boundary passed: ${files} source/config/doc files; ${manifest.documents.length} registered documents; publishable packages require full release validation.`);
