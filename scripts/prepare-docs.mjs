// Upstream metadata wrappers only. Portal routing, translations and API rendering belong to github-docs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { posix, resolve, dirname } from 'node:path';
const outputIndex = process.argv.indexOf('--output-dir');
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw Error('Missing --output-dir destination');
const outputRoot = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : process.cwd();
const landings = [
  { source: 'README.md', output: 'docs/index.md', title: 'SiteKit', description: 'Static site configuration, basic content management and optional hosting adapters.', order: 1 },
  { source: 'packages/cloudflare/README.md', output: 'docs/cloudflare.md', title: 'SiteKit Cloudflare Adapters', description: 'Public D1/R2 projections, basic editing and event adapters.', order: 2 },
];
const generatedPages = new Map();
const targets = new Map(landings.map(item => [item.source, item.output]));
await mkdir(resolve(outputRoot, 'docs'), { recursive: true });
for (const item of landings) {
  const body = (await readFile(item.source, 'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const linked = body.replace(/(!?\[[^\]]*\]\()([^\s)]+)(\))/g, (all, before, target, after) => {
    if (/^(?:https?:|mailto:|#)/.test(target)) return all;
    const [file, anchor] = target.split('#');
    const resolved = posix.normalize(posix.join(posix.dirname(item.source), file));
    const canonical = targets.get(resolved) ?? resolved;
    return before + posix.relative(posix.dirname(item.output), canonical) + (anchor ? '#' + anchor : '') + after;
  });
  const frontmatter = `---\ntitle: "${item.title}"\ndescription: "${item.description}"\nsidebar:\n  order: ${item.order}\narchetype: "explanation"\nproject: "sitekit"\ntags: ["astro", "overview"]\n---\n\n`;
  const page = frontmatter + `<!-- Generated from ${item.source}; edit that README and run bun run docs:prepare. -->\n\n` + linked;
  generatedPages.set(item.output, page);
  await writeFile(resolve(outputRoot, item.output), page);
}
console.log('Prepared 2 upstream landing documents from package READMEs.');

// Read the two metadata wrappers from this same run; all other inputs remain canonical sources.
const manifest = JSON.parse(await readFile('docs.manifest.json', 'utf8'));
const route = doc => 'https://tech-docs.alneas.com/' + [manifest.projectId, doc.slug.replace(/(?:^|\/)index$/, '')].filter(Boolean).join('/').replace(/\/+/g, '/') + '/';
const publicDocs = manifest.documents.filter(doc => doc.visibility === 'public');
const routes = new Map(publicDocs.map(doc => [doc.source, route(doc)]));
for (const [source, output] of targets) routes.set(source, routes.get(output));
const sections = ['# SiteKit public documentation\n\nGenerated from the approved public docs.manifest.json, in manifest order. Edit the canonical guides, not this compilation.\n'];
for (const doc of publicDocs) {
  const text = generatedPages.get(doc.source) ?? await readFile(doc.source, 'utf8');
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').replace(/<!-- Generated[^]*?-->\n*/, '');
  const linked = body.replace(/(!?\[[^\]]*\]\()([^\s)]+)(\))/g, (all, before, target, after) => {
    if (/^(?:https?:|mailto:|#)/.test(target)) return all;
    const [file, anchor] = target.split('#');
    const source = posix.normalize(posix.join(posix.dirname(doc.source), file));
    if (!routes.has(source)) throw Error('Unapproved compilation link: ' + source);
    return before + routes.get(source) + (anchor ? '#' + anchor : '') + after;
  });
  sections.push('\n---\n\nCanonical guide: ' + route(doc) + '\nSource: `' + doc.source + '`\n\n' + linked.trim() + '\n');
}
const compilation = sections.join('');
await writeFile(resolve(outputRoot, 'llms-full.txt'), compilation);
await mkdir(resolve(outputRoot, 'packages/core/skills/sitekit'), {recursive:true});
await writeFile(resolve(outputRoot, 'packages/core/llms-full.txt'), compilation);
await writeFile(resolve(outputRoot, 'packages/core/llms.txt'), await readFile('llms.txt', 'utf8'));
await writeFile(resolve(outputRoot, 'packages/core/skills/sitekit/SKILL.md'), await readFile('skills/sitekit/SKILL.md', 'utf8'));
console.log('Prepared public llms-full.txt from ' + publicDocs.length + ' approved guides.');
