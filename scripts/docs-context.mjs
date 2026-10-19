import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
export const root = resolve(import.meta.dirname, '..');
export const manifest = JSON.parse(await readFile(resolve(root, 'docs.manifest.json'), 'utf8'));
export const boundary = JSON.parse(await readFile(resolve(root, 'scripts/public-release/boundary.json'), 'utf8').catch(() => readFile(resolve(root, 'scripts/boundary.json'), 'utf8')));
const core = JSON.parse(await readFile(resolve(root, 'packages/core/package.json'), 'utf8'));
const cloudflare = JSON.parse(await readFile(resolve(root, 'packages/cloudflare/package.json'), 'utf8'));
export const packages = new Map([
  [core.name, { ...core, exports: Object.fromEntries(boundary.publicCoreExports.map(key => [key, core.exports[key]])) }],
  [cloudflare.name, cloudflare],
]);
for (const name of Object.keys(boundary.publicAppkitVersions)) {
  // Workspace installs may keep the Cloudflare-only peer in that workspace.
  const meta = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return readFile(resolve(root, 'packages/cloudflare/node_modules', name, 'package.json'), 'utf8');
  }));
  if (meta.version !== boundary.publicAppkitVersions[name]) throw Error(`Unexpected public Appkit version: ${name}`);
  packages.set(name, meta);
}
export function assertPublicImport(target) {
  for (const [name, meta] of packages) {
    if (target === name || target.startsWith(name + '/')) {
      const subpath = target === name ? '.' : './' + target.slice(name.length + 1);
      if (!meta.exports?.[subpath]) throw Error(`Unsupported public import: ${target}`);
      return;
    }
  }
  if (/^@(?:dataarthub|alneas)\//.test(target)) throw Error(`Non-public dependency in approved documentation: ${target}`);
}
export function publicImports(text) {
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)) assertPublicImport(match[1]);
}
export const sourcePath = path => resolve(root, path);
