import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { qualityTool, setupQualityTools } from './quality-tools.mjs';

const maxBuffer = 100 * 1024 * 1024;
const supported = /\.(?:[cm]?[jt]sx?|jsonc?)$/i;

function execute(command, args, cwd, input) {
  return spawnSync(command, args, { cwd, input, encoding: 'utf8', maxBuffer, timeout: 120_000 });
}

function git(root, args, run) {
  const result = run('git', args, root);
  if (result.error || result.status !== 0) throw new Error('Cannot inspect Git inputs for the quality gate.');
  return result.stdout;
}

// Staged checks use self-contained root configuration. Refuse unstaged policy
// changes rather than silently checking index bytes under a different policy.
function requireIndexedConfig(root, name, run) {
  const indexed = run('git', ['rev-parse', '--verify', `:${name}`], root);
  if (indexed.error || indexed.status !== 0) throw new Error(`Required ${name} configuration is not indexed; stage the reviewed configuration first.`);
  // hash-object without -w is read-only; --no-filters compares exact bytes.
  const working = git(root, ['hash-object', '--no-filters', '--', name], run).trim();
  if (working !== indexed.stdout.trim()) throw new Error(`Required ${name} configuration differs from index; stage or restore the reviewed configuration first.`);
}

export function lint(root, staged = false, { tool = qualityTool, run = execute } = {}) {
  if (!existsSync(join(root, 'biome.json'))) throw new Error('Missing required biome.json configuration.');
  if (staged) requireIndexedConfig(root, 'biome.json', run);
  const binary = tool(root, 'biome');
  const names = git(root, staged
    ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']
    : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], run)
    .split('\0').filter(name => supported.test(name));
  let temporary;
  try {
    if (staged && names.length) {
      const directory = join(root, '.verification/tmp');
      mkdirSync(directory, { recursive: true });
      temporary = mkdtempSync(join(directory, 'staged-lint-'));
    }
    for (const name of new Set(names)) {
      let file = resolve(root, name);
      if (staged) {
        // Materialize index bytes only in an owned disposable directory. Never
        // stash, rewrite a source file, or alter staging (including partial stages).
        // Configuration filenames must not become discoverable nested roots.
        const materialized = name.replace(/(^|\/)(biome\.jsonc?)$/, '$1staged-$2');
        file = resolve(temporary, materialized);
        if (!file.startsWith(`${temporary}/`)) throw new Error('Invalid staged lint path.');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, git(root, ['show', `:${name}`], run));
      } else if (!existsSync(file)) continue;
      if (statSync(file).size > maxBuffer) throw new Error('Lint input exceeds the supported size; verification blocked.');
      const args = ['lint', '--files-max-size=104857600', '--config-path', root, '--files-ignore-unknown=true', '--no-errors-on-unmatched', '--', file];
      const result = run(binary, args, root);
      if (result.error || result.status !== 0) {
        throw new Error(`Lint failed for ${JSON.stringify(name)}. Run the pinned Biome CLI for diagnostics; verification never rewrites files.`);
      }
    }
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
  return names.length;
}

export function scanSecrets(root, staged = false, { tool = qualityTool, run = execute } = {}) {
  const config = join(root, '.gitleaks.toml');
  if (!existsSync(config)) throw new Error('Missing required .gitleaks.toml configuration.');
  if (staged) requireIndexedConfig(root, '.gitleaks.toml', run);
  const binary = tool(root, 'gitleaks');
  if (!staged) {
    if (git(root, ['rev-parse', '--is-shallow-repository'], run).trim() !== 'false') {
      throw new Error('History scanning requires a full Git checkout (fetch-depth: 0).');
    }
    git(root, ['rev-parse', '--verify', 'HEAD'], run);
  }
  const args = ['git', root, '--config', config, '--redact=100', '--no-banner', '--log-level=error', '--report-format=json', '--report-path=-'];
  args.push(staged ? '--staged' : '--log-opts=--all');
  const result = run(binary, args, root);
  // Never relay scanner stdout/stderr: even a failed scanner or invalid config may
  // include source/config content. Report only a count and a stable generic error.
  if (result.error || result.status !== 0) {
    let count;
    try { const report = JSON.parse(result.stdout); if (Array.isArray(report) && report.length) count = report.length; } catch { /* Scanner failure is still blocking. */ }
    throw new Error(count
      ? `Secret scan blocked: ${count} credential finding(s) [REDACTED].`
      : 'Secret scan blocked: scanner failed. Output suppressed to protect secret bytes.');
  }
  let findings;
  try { findings = JSON.parse(result.stdout); } catch { throw new Error('Secret scanner returned an invalid report; verification blocked.'); }
  if (!Array.isArray(findings) || findings.length !== 0) throw new Error('Secret scanner returned findings or an invalid report; verification blocked.');
}

export async function runQuality(root, mode) {
  if (mode === 'tools:setup') return setupQualityTools(root);
  if (mode === 'lint') return lint(root);
  if (mode === 'lint:staged') return lint(root, true);
  if (mode === 'secrets:staged') return scanSecrets(root, true);
  if (mode === 'secrets:history') return scanSecrets(root);
  if (mode === 'pre-commit') { scanSecrets(root, true); return lint(root, true); }
  throw new Error('Usage: quality-gates.mjs tools:setup|lint|lint:staged|secrets:staged|secrets:history|pre-commit');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runQuality(process.cwd(), process.argv[2]);
    console.log('Quality gate passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
