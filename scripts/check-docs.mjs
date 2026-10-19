// Verify upstream sources. Do not render portal pages, translations or API cards here.
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { Project, ts } from 'ts-morph';
import { inspectPublicJsdoc } from './jsdoc-coverage.mjs';
import { withDocumentationConsumer, typecheckDocumentationExamples } from './docs-consumer.mjs';
import { root, manifest, boundary, packages, publicImports, sourcePath } from './docs-context.mjs';

const allowed = new Set(manifest.documents.map(doc => doc.source));
const redirects = new Map([['README.md', 'docs/index.md'], ['packages/cloudflare/README.md', 'docs/cloudflare.md']]);
const snippets = [];
for (const doc of manifest.documents) {
  assert.equal(doc.visibility, 'public', `Explicit visibility required: ${doc.source}`);
  assert(!/hotel-api|hotel-site|private|artifacts|public-private/.test(doc.source), `Internal document in public manifest: ${doc.source}`);
  const path = sourcePath(doc.source);
  assert((await realpath(path)).startsWith(root + '/'), 'Document escaped project');
  const text = await readFile(path, 'utf8');
  assert(!/(?:\/(?:Volumes|Users)\/|file:\x2f\x2f|BEGIN PRIVATE KEY|ghp_[A-Za-z0-9]{20,})/.test(text), `Private data pattern: ${doc.source}`);
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  assert(front, `Missing frontmatter: ${doc.source}`);
  for (const key of ['title', 'description', 'archetype', 'project', 'tags']) assert(new RegExp('^' + key + ': .+', 'm').test(front[1]), `Missing ${key}: ${doc.source}`);
  assert(/^sidebar:\r?\n  order: \d+/m.test(front[1]), `Missing sidebar order: ${doc.source}`);
  assert(front[1].includes(`archetype: "${doc.archetype}"`), `Archetype mismatch: ${doc.source}`);
  if (doc.archetype === 'how-to') {
    for (const heading of ['Prerequisites', 'Public import', 'Step-by-Step Implementation', 'Verification', 'Troubleshooting / Common Pitfalls']) assert(text.includes('## ' + heading), `Missing ${heading}: ${doc.source}`);
  }
  if (doc.archetype === 'explanation' && !['docs/index.md', 'docs/cloudflare.md'].includes(doc.source)) for (const heading of ['Motivation', 'Architectural Diagram', 'Trade-offs & Decisions']) assert(text.includes('## ' + heading), `Missing ${heading}: ${doc.source}`);
  publicImports(text);
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
    if (/^(?:https?:|mailto:|#)/.test(match[1])) continue;
    const path = resolve(dirname(sourcePath(doc.source)), match[1].split('#')[0]);
    const local = relative(root, path);
    assert(allowed.has(redirects.get(local) ?? local), `Link outside public manifest: ${doc.source}: ${match[1]}`);
  }
  for (const match of text.matchAll(/```(typescript|tsx)\n([\s\S]*?)```/g)) snippets.push({ source: doc.source, code: match[2], language: match[1] });
}
for (const path of redirects.keys()) {
  const text = await readFile(sourcePath(path), 'utf8');
  assert(!text.startsWith('---'), `Package README must be plain Markdown: ${path}`);
  const headings = [...text.matchAll(/^## (.+)$/gm)].map(match => match[1]);
  assert.deepEqual(headings, ['Elevator Pitch', 'Why & Value Proposition', 'Key Highlights', 'Quickstart', 'Next Steps'], `Landing sections: ${path}`);
}
// Consumer skills are packaged instructions, kept distinct from portal documents.
const consumerSkill = await readFile(sourcePath('skills/sitekit/SKILL.md'), 'utf8');
publicImports(consumerSkill);
for (const match of consumerSkill.matchAll(/```(typescript|tsx)\n([\s\S]*?)```/g)) snippets.push({ source: 'skills/sitekit/SKILL.md', code: match[2], language: match[1] });
const project = new Project({ compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, jsx: ts.JsxEmit.ReactJSX, strict: true, skipLibCheck: true, noEmit: true } });
const approvedEntrypoints = new Set();
for (const [name, meta] of packages) {
  if (!name.startsWith('@alneas/sitekit')) continue;
  const base = name.endsWith('-cloudflare') ? 'packages/cloudflare/' : 'packages/core/';
  for (const target of Object.values(meta.exports)) {
    if (!target || typeof target !== 'object' || !target.types) continue;
    const path = base + target.types.replace('./dist/', 'src/').replace(/\.d\.ts$/, '.ts');
    try { approvedEntrypoints.add(relative(root, await realpath(sourcePath(path)))); }
    catch { approvedEntrypoints.add(relative(root, await realpath(sourcePath(path + 'x')))); }
  }
}
assert.deepEqual(new Set(manifest.entrypoints), approvedEntrypoints, 'API entrypoints must match the approved package exports exactly');
const coverage = inspectPublicJsdoc({project, root, entrypoints: manifest.entrypoints});
assert.equal(coverage.issues.length, 0, 'JSDoc gaps:\n' + coverage.issues.map(issue => `${issue.path}:${issue.line} ${issue.label}: ${issue.kind} ${issue.detail}`).join('\n'));
for (const snippet of coverage.examples) { publicImports(snippet.code); snippets.push(snippet); }
await withDocumentationConsumer(root, consumer => typecheckDocumentationExamples(consumer, snippets));
console.log(`Upstream docs passed: ${manifest.documents.length} public pages, ${coverage.stats.declarations} reachable declarations, ${coverage.stats.members} members, ${coverage.stats.callables} callables, ${coverage.stats.generics} type parameters, ${snippets.length} typechecked examples.`);
