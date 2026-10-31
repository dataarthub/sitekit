// Canonical source: https://tech-docs.alneas.com/templates/readme/check-readmes.mjs
// Copy this dependency-free checker into the owning repository; no sibling checkout is required.
import { readFileSync, existsSync, realpathSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function markdown(text) {
 const lines = text.split(/\r?\n/), prose = [], blocks = [], headings = [];
 let offset = 0;
 let fence, language, body = [];
 for (const line of lines) {
  const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!fence && marker) { fence = marker[1]; language = marker[2].trim(); body = []; prose.push(''); }
  else if (fence && marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
   blocks.push({ language, text: body.join('\n') }); fence = undefined;
  } else if (fence) body.push(line);
  else { prose.push(line); const h = /^## (.+?)\s*$/.exec(line); if (h) headings.push({ title: h[1], index: offset, end: offset + line.length }); }
  offset += line.length + 1;
 }
 return { prose: prose.join('\n'), blocks, headings, unclosed: Boolean(fence) };
}
const required = ['Elevator Pitch', 'Why & Value', 'Key Highlights', 'Quickstart', 'Next Steps'];
const canonicalHeading = value => value === 'Why & Value Proposition' ? 'Why & Value' : value;
function availableTarget(target) {
 if (typeof target === 'string') return target.startsWith('./');
 if (Array.isArray(target)) return target.some(availableTarget);
 return target !== null && typeof target === 'object' && Object.values(target).some(availableTarget);
}
function supportedExport(exports, entry) {
 if (!exports || typeof exports !== 'object' || Array.isArray(exports) || !Object.keys(exports).some(key => key.startsWith('.'))) return entry === '.' && availableTarget(exports);
 if (Object.hasOwn(exports, entry)) return availableTarget(exports[entry]);
 const patterns = Object.keys(exports).filter(key => key.includes('*') && entry.startsWith(key.split('*')[0]) && entry.endsWith(key.split('*')[1]));
 patterns.sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length);
 return patterns.length > 0 && availableTarget(exports[patterns[0]]);
}
export function checkReadme(text, options = {}) {
 text = text.replace(/\r\n/g, '\n');
 const errors = [], parsed = markdown(text), compact = options.format === 'npm';
 if (options.format !== undefined && !['project','npm'].includes(options.format)) errors.push('Unknown README format');
 if (compact && !options.packageName) errors.push('npm format requires a package manifest');
 if (/^\s*---\s*\n/.test(text)) errors.push('GitHub/npm README must be plain Markdown; generate portal metadata separately');
 if (parsed.unclosed) errors.push('Unclosed code fence');
 if ((parsed.prose.match(/^# .+/gm) ?? []).length !== 1) errors.push('Expected exactly one H1');
 const headings = [...parsed.prose.matchAll(/^## (.+?)\s*$/gm)];
 if (!compact && required.some((title, i) => canonicalHeading(headings[i]?.[1]) !== title)) errors.push('First five H2 sections must be: ' + required.join(' -> '));
 const sections = new Map();
 for (let i = 0; i < parsed.headings.length; i++) {
  const heading = parsed.headings[i];
  sections.set(canonicalHeading(heading.title), text.slice(heading.end, parsed.headings[i + 1]?.index ?? text.length));
 }
 for (const title of compact ? [] : required) if (!sections.get(title)?.trim()) errors.push('Missing or empty ' + title);
 const highlights = markdown(sections.get('Key Highlights') ?? '').prose.match(/^[-*+]\s+\S.+$/gm) ?? [];
 if (!compact && (highlights.length < 3 || highlights.length > 4)) errors.push('Key Highlights must contain 3-4 top-level bullets');
 const quick = compact ? parsed : markdown(sections.get('Quickstart') ?? '');
 if (compact) {
  const introduction = parsed.prose.split(/^## /m)[0].replace(/^#.*$/gm,'').replace(/^\s*!?\[.*$/gm,'').trim();
  if (!introduction) errors.push('npm README needs a short package summary');
  if (!quick.blocks.some(block=>/^(typescript|tsx|ts|javascript|jsx|js|bash|sh|shell|console)$/.test(block.language))) errors.push('npm README needs a usage example');
 }
 const commands = quick.blocks.filter(b => /^(bash|sh|shell|console)$/.test(b.language)).map(b => b.text).join('\n');
 if (!compact && !/^(?:\$ )?(?:bun|npm|pnpm|yarn|node|npx|git)\s+\S/m.test(commands)) errors.push('Quickstart needs executable setup/install commands');
 if (options.packageName) {
  const installLines = commands.split('\n').filter(line => /(?:bun add|npm (?:install|i)|pnpm add|yarn add)\s/.test(line));
  const archive = options.version ? options.packageName.replace(/^@/, '').replace('/', '-') + '-' + options.version + '.tgz' : undefined;
  if ((!compact || installLines.length) && !installLines.some(line => line.split(/\s+/).some(word => word === options.packageName || word.startsWith(options.packageName + '@') || (archive && (word === './' + archive || word.endsWith('/' + archive)))))) errors.push('Install the npm package name, not a feature subpath: ' + options.packageName);
  const code = quick.blocks.filter(b => /^(typescript|tsx|ts|javascript|jsx|js)$/.test(b.language)).map(b => b.text).join('\n');
  if (![...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].some(m => m[1] === options.packageName || m[1].startsWith(options.packageName + '/'))) errors.push('Quickstart needs an example importing the owning package');
  if (options.exports) {
   for (const block of parsed.blocks.filter(b => /^(typescript|tsx|ts|javascript|jsx|js)$/.test(b.language))) {
    for (const match of block.text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
     const specifier = match[1];
     if (specifier !== options.packageName && !specifier.startsWith(options.packageName + '/')) continue;
     const entry = specifier === options.packageName ? '.' : './' + specifier.slice(options.packageName.length + 1);
     if (!supportedExport(options.exports, entry)) errors.push('Unsupported public import: ' + specifier);
    }
   }
  }
 }
 if (!/\[[^\]]+\]\([^)]+\)/.test(compact ? parsed.prose : sections.get('Next Steps') ?? '')) errors.push(compact ? 'npm README needs documentation links' : 'Next Steps needs documentation links');
 return errors;
}
function included(file, patterns) {
 return patterns.some(pattern => {
  const p = pattern.replace(/^\.\//, '').replace(/\/$/, '');
  if (!p.includes('*')) return file === p || file.startsWith(p + '/');
  const regex = (p.match(/\*\*\/|\*\*|\*|[^*]+/g) ?? []).map(token => token === '**/' ? '(?:.*/)?' : token === '**' ? '.*' : token === '*' ? '[^/]*' : token.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('');
  return new RegExp('^' + regex + '$').test(file);
 });
}
export function checkProject(root, config) {
 const errors = [];
 if (config.schemaVersion !== 1 || !Array.isArray(config.readmes) || !config.readmes.length) throw Error('Invalid README policy configuration');
 const formats=config.formats??{};
 if(typeof formats!=='object'||Array.isArray(formats))throw Error('Invalid README formats');
 for(const [file,format]of Object.entries(formats))if(!config.readmes.includes(file)||!['project','npm'].includes(format))errors.push('Invalid or unregistered README format: '+file);
 const roots = new Set([root, ...config.readmes.filter(f => existsSync(resolve(root, dirname(f), 'package.json'))).map(f => resolve(root, dirname(f)))]);
 for (const owner of roots) for (const group of ['packages', 'plugins']) {
  const dir = resolve(owner, group);
  if (!existsSync(dir)) continue;
  for (const child of readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory())) {
   const manifest = resolve(dir, child.name, 'package.json');
   if (!existsSync(manifest)) continue;
   const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
   const packageDir = relative(root, dirname(manifest)).split(sep).join('/');
   const readme = packageDir + '/README.md';
   if (pkg.name && !config.readmes.includes(readme) && !(pkg.private === true && typeof config.excludedPackages?.[packageDir] === 'string' && config.excludedPackages[packageDir].trim())) errors.push('Unregistered package README: ' + readme);
  }
 }
 for (const file of config.readmes) {
  const path = resolve(root, file);
  if (isAbsolute(file) || relative(root, path).startsWith('..' + sep) || !existsSync(path) || !realpathSync(path).startsWith(realpathSync(root) + sep)) { errors.push(file + ': README must exist inside the project'); continue; }
  const packagePath = resolve(dirname(path), 'package.json');
  const pkg = existsSync(packagePath) ? JSON.parse(readFileSync(packagePath, 'utf8')) : {};
  const npmPackage = Boolean(pkg.name) && !pkg.workspaces && (pkg.private !== true || Boolean(pkg.exports || pkg.files || pkg.main || pkg.module || pkg.types || pkg.bin));
  const text = readFileSync(path, 'utf8');
  errors.push(...checkReadme(text, {format:formats[file]??'project',...(npmPackage ? { packageName: pkg.name, exports: pkg.exports, version: pkg.version } : {})}).map(e => file + ': ' + e));
  for (const match of markdown(text).prose.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
   const target = match[1].split('#')[0];
   if (!target || /^(?:https?:|mailto:)/i.test(target)) continue;
   const destination = resolve(dirname(path), decodeURIComponent(target));
   if (/^[a-z]+:/i.test(target) || target.startsWith('/') || !existsSync(destination)) { errors.push(file + ': missing/unsafe relative link: ' + target); continue; }
   if (realpathSync(destination) !== resolve(realpathSync(dirname(path)), decodeURIComponent(target))) { errors.push(file + ': symlink link target is not portable: ' + target); continue; }
   const ignored = spawnSync('git', ['check-ignore', '-q', '--', destination], { cwd: root, stdio: 'ignore' }).status === 0;
   if (ignored) errors.push(file + ': GitHub link targets ignored generated content; use its canonical source URL: ' + target);
   const within = relative(dirname(path), destination).split(sep).join('/');
   if (npmPackage && (within.startsWith('../') || (pkg.files && !['README.md', 'LICENSE', 'package.json'].includes(within) && !included(within, pkg.files)))) errors.push(file + ': npm README link is outside the package payload; use a canonical repository URL: ' + target);
  }
 }
 return errors;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const root = resolve(process.cwd());
 const config = JSON.parse(readFileSync(resolve(root, process.argv[2] ?? 'readme-policy.json'), 'utf8'));
 const errors = checkProject(root, config);
 if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
 else console.log(`README policy passed: ${config.readmes.length} repository/package READMEs`);
}
