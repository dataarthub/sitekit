import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export function packageReadme(text, manifest) {
 const routes = new Map(manifest.documents.map(doc => [doc.source, '/' + manifest.projectId + '/' + doc.slug.replace(/(?:^|\/)index$/, '') + '/']));
 routes.set('packages/cloudflare/README.md', routes.get('docs/cloudflare.md'));
 return text.replace(/(\[[^\]]*\]\()([^\s)]+)(\))/g, (all, prefix, target, suffix) => {
  if (/^(?:https?:|mailto:|#)/i.test(target)) return all;
  const [file, fragment] = target.split('#');
  if (['LICENSE', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.json', 'package.json', 'skills/sitekit/SKILL.md', 'llms-full.txt'].includes(file)) return all;
  const route = routes.get(file.replace(/^\.\//, ''));
  if (!route) throw Error('Package README link is not in the public manifest: ' + target);
  return prefix + 'https://tech-docs.alneas.com' + route.replace(/\/+/g, '/') + (fragment ? '#' + fragment : '') + suffix;
 });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const root = resolve(import.meta.dirname, '..');
 const manifest = JSON.parse(await readFile(resolve(root, 'docs.manifest.json'), 'utf8'));
 const expected = packageReadme(await readFile(resolve(root, 'README.md'), 'utf8'), manifest);
 const outputIndex = process.argv.indexOf('--output-dir');
 if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw Error('Missing --output-dir destination');
 const outputRoot = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : root;
 const output = resolve(outputRoot, 'packages/core/README.md');
 if (process.argv.includes('--check')) {
  if (expected !== await readFile(output, 'utf8')) throw Error('Stale generated package README; run bun run docs:prepare.');
  console.log('SiteKit package README matches its canonical repository source.');
 } else { await mkdir(dirname(output), { recursive: true }); await writeFile(output, expected); }
}
