import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { sourceTargets } from './release-bundle-core.mjs';
import { compareVersions } from './release-publish.mjs';

export function changelogEntry(text, version) {
  const entries = [...text.matchAll(/^##\s+([^\n]+)\n/gm)];
  const matching = entries.filter(match => {
    const value = match[1].match(/^\[?v?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)(?:\]|\s|$)/);
    return value?.[1] === version;
  });
  assert.equal(matching.length, 1, `Expected one changelog entry for ${version}`);
  const match = matching[0];
  const end = entries.find(entry => entry.index > match.index)?.index ?? text.length;
  const entry = text.slice(match.index, end).trim();
  const body = entry.slice(entry.indexOf('\n') + 1).replace(/<!--[\s\S]*?-->/g, '').replace(/^#+.*$/gm, '').trim();
  assert(body && !/^(?:[-*]\s*)?(?:TBD|TODO|coming soon|placeholder)[.!]?$/i.test(body), `Empty or placeholder changelog for ${version}`);
  return entry;
}
export function releaseNotes(target, changelog) {
  return `# ${target.name} ${target.version}\n\n${changelogEntry(changelog, target.version)}\n`;
}
export function validateChangeRecords({ paths, targets, changesets, rationale = '' }) {
  const names = new Set(targets.map(target => target.name));
  const covered = new Set();
  for (const fragment of changesets) {
    assert(typeof fragment.summary === 'string' && fragment.summary.trim().length > 0, 'Change fragment needs a consumer summary');
    for (const release of fragment.releases) {
      assert(names.has(release.name), 'Change fragment contains an unknown package');
      assert(['patch','minor','major'].includes(release.type), 'Invalid change fragment version impact');
      covered.add(release.name);
    }
  }
  const affected = new Set();
  for (const path of paths) {
    if (/\.test\.[cm]?[jt]sx?$|(?:^|\/)(?:tests|__tests__)\//.test(path)) continue;
    const owner = targets.find(target => path.startsWith(`packages/${target.kind}/`));
    if (owner) { affected.add(owner.name); continue; }
    if (/^(?:package\.json|bun\.lock|tsconfig\.json)$/.test(path)) {
      for (const target of targets) affected.add(target.name);
    } else if (path === 'scripts/build-cloudflare.mjs') {
      const cloudflare = targets.find(target => target.kind === 'cloudflare');
      if (cloudflare) affected.add(cloudflare.name);
    } else if (/^(?:README\.md|LICENSE|THIRD_PARTY_NOTICES\.json|examples\/|docs\.manifest\.json|llms(?:-full)?\.txt|docs\/|schema\/|skills\/|scripts\/(?:build-core|prepare-docs|package-readme|generate-site-schema)\.mjs)/.test(path)) {
      const core = targets.find(target => target.kind === 'core');
      if (core) affected.add(core.name);
    }
  }
  const explicitNoRelease = [...rationale.matchAll(/^No release:[ \t]*([^\r\n]*)$/gim)].some(match => {
    const reason = match[1].trim();
    return reason.length >= 20 && !/^(?:TODO|TBD|N\/A|none|placeholder)\b|^<[^>]+>/i.test(reason);
  });
  for (const name of affected) assert(covered.has(name) || explicitNoRelease, `Missing change fragment or reviewed No release rationale for ${name}`);
  return [...affected];
}
export function introducedChangesets(changesets, paths) {
  const ids = new Set(paths.filter(path => /^\.changeset\/[^/]+\.md$/.test(path)).map(path => path.slice('.changeset/'.length, -3)));
  return changesets.filter(fragment => ids.has(fragment.id));
}
export async function preparedChangeRecords(root, ancestor, paths, targets) {
  const records = [];
  for (const target of targets) {
    const prefix = `packages/${target.kind}/`;
    if (!paths.includes(prefix+'package.json') || !paths.includes(prefix+'CHANGELOG.md')) continue;
    let previous;
    try { previous = JSON.parse(execFileSync('git',['show',ancestor+':'+prefix+'package.json'],{cwd:root,encoding:'utf8',stdio:'pipe'})); }
    catch { continue; } // New packages still require their introducing fragment.
    if (previous.version === target.version) continue;
    assert(compareVersions(target.version,previous.version)>0, 'Prepared release version must advance its baseline');
    const summary = changelogEntry(await readFile(join(root,prefix,'CHANGELOG.md'),'utf8'), target.version);
    const oldParts = previous.version.split(/[.+-]/), newParts = target.version.split(/[.+-]/);
    const type = oldParts[0] !== newParts[0] ? 'major' : oldParts[1] !== newParts[1] ? 'minor' : 'patch';
    records.push({id:'prepared-'+target.kind,summary,releases:[{name:target.name,type}]});
  }
  return records;
}
export async function changesetPlan(root) {
  const parent = join(root, '.verification/tmp'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'release-record-'));
  try {
    const output = join(directory, 'plan.json');
    execFileSync(process.execPath, [join(root, 'node_modules/@changesets/cli/bin.js'), 'status', '--output', output], { cwd:root, stdio:'pipe', timeout:60_000 });
    return JSON.parse(await readFile(output, 'utf8'));
  } finally { await rm(directory, {recursive:true,force:true}); }
}
export async function assertPreparedNotes(root, selectedNames) {
  const plan = await changesetPlan(root);
  for (const fragment of plan.changesets) {
    assert(!fragment.releases.some(release => selectedNames.includes(release.name)), 'Selected release still has unconsumed changesets; review version preparation first');
  }
}
async function main() {
  const root = resolve(import.meta.dirname, '..');
  const targets = await sourceTargets(root);
  if (process.argv[2] === 'check') {
    for (const target of targets) releaseNotes(target, await readFile(join(root,'packages',target.kind,'CHANGELOG.md'),'utf8'));
    console.log('Every package has meaningful notes for its current source version.');
  } else if (process.argv[2] === 'records') {
    const index = process.argv.indexOf('--base');
    assert(index >= 0 && process.argv[index+1], 'Provide an explicit --base commit/ref');
    const git = args => execFileSync('git',args,{cwd:root,encoding:'utf8'});
    const base = git(['rev-parse','--verify',process.argv[index+1]+'^{commit}']).trim();
    const ancestor = git(['merge-base',base,'HEAD']).trim();
    const paths = [...git(['diff','--name-only','-z',ancestor,'--']).split('\0'), ...git(['ls-files','--others','--exclude-standard','-z']).split('\0')].filter(Boolean);
    const plan = await changesetPlan(root);
    const changesets = [...introducedChangesets(plan.changesets,paths), ...await preparedChangeRecords(root,ancestor,paths,targets)];
    const affected = validateChangeRecords({paths,targets,changesets,rationale:process.env.PR_BODY ?? ''});
    console.log('Change records verified: '+(affected.join(', ') || 'maintainer/test-only; no consumer package selected'));
  } else throw Error('Usage: release-notes.mjs check | records --base commit-or-ref');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {console.error(error.message);process.exitCode=1;});
