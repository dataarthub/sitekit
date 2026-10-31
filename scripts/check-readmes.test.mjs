import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReadme } from './check-readmes.mjs';
const valid = `# Example

## Elevator Pitch

Developers use Example to validate records.

## Why & Value

Keep validation beside the record contract.

## Key Highlights

- Validate input.
- Share contracts.
- Keep host ownership explicit.

## Quickstart

\`\`\`bash
bun add @scope/example
\`\`\`

\`\`\`typescript
import { validate } from '@scope/example';
console.log(validate({}));
\`\`\`

## Next Steps

[Guide](https://example.com/guide)
`;
const options = { packageName: '@scope/example', exports: { '.': './dist/index.js' } };
test('accepts a complete package README', () => assert.deepEqual(checkReadme(valid, options), []));
test('rejects absent and out-of-order sections', () => {
 assert(checkReadme(valid.replace('## Why & Value', '## Background'), options).length);
 assert(checkReadme(valid.replace('## Elevator Pitch', '## Next Steps'), options).length);
});
test('ignores headings and imports inside unrelated code fences', () => {
 const fake = '# Example\n```markdown\n' + valid.slice(valid.indexOf('## Elevator')) + '\n```';
 assert(checkReadme(fake, options).length);
});
test('rejects frontmatter, empty sections and excessive highlights', () => {
 assert(checkReadme('---\ntitle: Example\n---\n' + valid, options).length);
 assert(checkReadme(valid.replace('Keep validation beside the record contract.', ''), options).length);
 assert(checkReadme(valid.replace('- Share contracts.', '- One\n- Two\n- Three\n- Four'), options).length);
});
test('checks install target and exact public import', () => {
 assert(checkReadme(valid.replace('bun add @scope/example', 'bun add @scope/example/feature'), options).length);
 assert(checkReadme(valid.replace("from '@scope/example'", "from '@scope/example/missing'"), options).length);
 assert(checkReadme(valid.replace("import { validate } from '@scope/example';", 'const validate = () => true;'), options).length);
});
test('requires a command for repository quickstarts and a Next Steps link', () => {
 assert(checkReadme(valid.replace('bun add @scope/example', '# install here'), {}).length);
 assert(checkReadme(valid.replace('[Guide](https://example.com/guide)', 'Read the guide.'), options).length);
});
test('a heading inside a code example cannot replace the real section', () => {
 const text = valid.replace("console.log(validate({}));", "console.log(validate({}));\n## Next Steps");
 assert.deepEqual(checkReadme(text, options), []);
});
test('accepts an exact locally packed archive when registry publication is pending', () => {
 assert.deepEqual(checkReadme(valid.replace('bun add @scope/example', 'bun add ./scope-example-0.1.0.tgz'), { ...options, version: '0.1.0' }), []);
 assert(checkReadme(valid.replace('bun add @scope/example', 'bun add ./different-package-0.1.0.tgz'), { ...options, version: '0.1.0' }).length);
});
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkProject } from './check-readmes.mjs';
test('validates npm nested globs and rejects source-only or missing package links', () => {
 const root = mkdtempSync(join(tmpdir(), 'readme-policy-'));
 try {
  mkdirSync(join(root, 'dist/ai'), { recursive: true });
  writeFileSync(join(root, 'dist/ai/index.md'), '# Guide');
  writeFileSync(join(root, 'source-only.md'), '# Source');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@scope/example', exports: options.exports, files: ['dist/ai/**/*'] }));
  const config = { schemaVersion: 1, readmes: ['README.md'] };
  const withLink = target => valid.replace('https://example.com/guide', target);
  writeFileSync(join(root, 'README.md'), withLink('dist/ai/index.md'));
  assert.deepEqual(checkProject(root, config), []);
  writeFileSync(join(root, 'README.md'), withLink('source-only.md'));
  assert(checkProject(root, config).some(e => e.includes('payload')));
  writeFileSync(join(root, 'README.md'), withLink('missing.md'));
  assert(checkProject(root, config).some(e => e.includes('missing')));
 } finally { rmSync(root, { recursive: true, force: true }); }
});
import { spawnSync } from 'node:child_process';
test('rejects GitHub links into ignored build output even if a local build exists', () => {
 const root = mkdtempSync(join(tmpdir(), 'readme-git-'));
 try {
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'dist/\n');
  writeFileSync(join(root, 'dist/guide.md'), '# Guide');
  writeFileSync(join(root, 'README.md'), valid.replace('https://example.com/guide', 'dist/guide.md'));
  assert(checkProject(root, { schemaVersion: 1, readmes: ['README.md'] }).some(e => e.includes('ignored')));
 } finally { rmSync(root, { recursive: true, force: true }); }
});
test('new distributable packages cannot silently escape the target list', () => {
 const root = mkdtempSync(join(tmpdir(), 'readme-coverage-'));
 try {
  mkdirSync(join(root, 'packages/new'), { recursive: true });
  writeFileSync(join(root, 'packages/new/package.json'), JSON.stringify({ name: '@scope/new', files: ['dist'] }));
  writeFileSync(join(root, 'README.md'), valid);
  assert(checkProject(root, { schemaVersion: 1, readmes: ['README.md'] }).some(e => e.includes('Unregistered')));
 } finally { rmSync(root, { recursive: true, force: true }); }
});
test('coverage exclusions require a private package and an explicit reason', () => {
 const root = mkdtempSync(join(tmpdir(), 'readme-exclusion-'));
 try {
  mkdirSync(join(root, 'packages/stub'), { recursive: true });
  const file = join(root, 'packages/stub/package.json');
  writeFileSync(join(root, 'README.md'), valid);
  const config = { schemaVersion: 1, readmes: ['README.md'], excludedPackages: { 'packages/stub': 'Unreleased private extraction stub.' } };
  writeFileSync(file, JSON.stringify({ name: '@scope/stub', private: true, files: ['dist'] }));
  assert.deepEqual(checkProject(root, config), []);
  writeFileSync(file, JSON.stringify({ name: '@scope/stub', files: ['dist'] }));
  assert(checkProject(root, config).some(e => e.includes('Unregistered')));
 } finally { rmSync(root, { recursive: true, force: true }); }
});
test('main-only npm packages must be registered and receive package quickstart checks', () => {
 const root = mkdtempSync(join(tmpdir(), 'readme-main-only-'));
 try {
  mkdirSync(join(root, 'packages/new'), { recursive: true });
  writeFileSync(join(root, 'README.md'), valid);
  writeFileSync(join(root, 'packages/new/package.json'), JSON.stringify({ name: '@scope/new', main: 'index.js' }));
  assert(checkProject(root, { schemaVersion: 1, readmes: ['README.md'] }).some(e => e.includes('Unregistered')));
  writeFileSync(join(root, 'packages/new/README.md'), valid);
  assert(checkProject(root, { schemaVersion: 1, readmes: ['README.md', 'packages/new/README.md'] }).some(e => e.includes('@scope/new')));
 } finally { rmSync(root, { recursive: true, force: true }); }
});
test('null export exclusions override wildcard availability', () => {
 const text = valid.replace("from '@scope/example'", "from '@scope/example/internal'");
 assert(checkReadme(text, { ...options, exports: { '.': './dist/index.js', './*': './dist/*.js', './internal': null } }).some(e => e.includes('Unsupported')));
 const deeper = valid.replace("from '@scope/example'", "from '@scope/example/internal/a'");
 assert(checkReadme(deeper, { ...options, exports: { './*': './dist/*.js', './internal/*': null } }).some(e => e.includes('Unsupported')));
});
import { symlinkSync } from 'node:fs';
test('package-relative symlinks cannot conceal links outside the payload', () => {
 const root = mkdtempSync(join(tmpdir(), 'readme-symlink-'));
 try {
  mkdirSync(join(root, 'packages/pkg/docs'), { recursive: true });
  writeFileSync(join(root, 'outside.md'), '# Outside');
  symlinkSync(join(root, 'outside.md'), join(root, 'packages/pkg/docs/guide.md'));
  writeFileSync(join(root, 'packages/pkg/package.json'), JSON.stringify({ name: '@scope/example', files: ['docs'], exports: options.exports }));
  writeFileSync(join(root, 'packages/pkg/README.md'), valid.replace('https://example.com/guide', 'docs/guide.md'));
  assert(checkProject(root, { schemaVersion: 1, readmes: ['packages/pkg/README.md'] }).some(e => e.includes('symlink')));
 } finally { rmSync(root, { recursive: true, force: true }); }
});

const compact = `# Example

Example validates application-owned records.

## Usage

\`\`\`ts
import { validate } from '@scope/example';
console.log(validate({}));
\`\`\`

## Documentation

[Documentation](https://example.com/guide) · [Changelog](https://example.com/changelog)
`;
test('compact npm README needs neither project sections nor translated payloads',()=>{
 assert.deepEqual(checkReadme(compact,{...options,format:'npm'}),[]);
 assert(checkReadme(compact,options).length,'project format remains the default');
 assert(checkReadme('---\ntitle: Example\n---\n'+compact,{...options,format:'npm'}).length);
 assert(checkReadme(compact.replace("'@scope/example'","'@scope/example/missing'"),{...options,format:'npm'}).length);
 assert(checkReadme(compact.replace('[Documentation](https://example.com/guide) · [Changelog](https://example.com/changelog)','Read the docs.'),{...options,format:'npm'}).length);
 assert(checkReadme(compact,{...options,format:'unknown'}).length);
});
test('compact npm format is selected explicitly per package README',()=>{
 const root=mkdtempSync(join(tmpdir(),'readme-npm-format-'));
 try{
  writeFileSync(join(root,'README.md'),compact);
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'@scope/example',exports:options.exports,files:['README.md']}));
  const config={schemaVersion:1,readmes:['README.md'],formats:{'README.md':'npm'}};
  assert.deepEqual(checkProject(root,config),[]);
  assert(checkProject(root,{...config,formats:{'README.md':'unknown'}}).length);
  assert(checkProject(root,{...config,formats:{'missing.md':'npm'}}).length);
  writeFileSync(join(root,'package.json'),JSON.stringify({private:true,workspaces:['packages/*']}));
  assert(checkProject(root,config).length,'repository overview cannot silently opt into npm format');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('compact main-only libraries still require owning-package usage',()=>{
 const mainOnly={packageName:'@scope/example',format:'npm'};
 assert.deepEqual(checkReadme(compact,mainOnly),[]);
 assert(checkReadme(compact.replace("import { validate } from '@scope/example';",'').replace('console.log(validate({}));','console.log("hello");'),mainOnly).some(e=>e.includes('importing the owning package')));
});
