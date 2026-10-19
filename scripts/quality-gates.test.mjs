import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, scanSecrets } from './quality-gates.mjs';
import { qualityTool, sha256, toolSpec, verifyDigest } from './quality-tools.mjs';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(repository, 'scripts/quality-gates.mjs');
const tools = { tool: (_root, name) => qualityTool(repository, name) };

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Quality fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, 'Fixture Git command failed');
  return result.stdout;
}

function fixture(run, { initialCommit = true } = {}) {
  const temporary = join(repository, '.verification/tmp');
  mkdirSync(temporary, { recursive: true });
  const root = mkdtempSync(join(temporary, 'quality-test-'));
  try {
    git(root, '-c', 'init.templateDir=', 'init', '--quiet');
    copyFileSync(join(repository, 'biome.json'), join(root, 'biome.json'));
    copyFileSync(join(repository, '.gitleaks.toml'), join(root, '.gitleaks.toml'));
    git(root, 'add', '--', 'biome.json', '.gitleaks.toml');
    if (initialCommit) git(root, 'commit', '--quiet', '-m', 'Root quality configuration');
    return run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function secret() {
  // Deliberately synthetic, assembled so this test does not embed a token literal.
  return ['ghp', createHash('sha256').update('quality-scanner-synthetic-fixture').digest('hex').slice(0, 36)].join('_');
}

test('upstream tool versions and SHA-256 pins cover macOS and Linux on arm64/x64', () => {
  for (const platform of ['darwin', 'linux']) for (const arch of ['arm64', 'x64']) {
    for (const name of ['biome', 'gitleaks']) {
      const spec = toolSpec(name, platform, arch);
      assert.match(spec.sha256, /^[a-f0-9]{64}$/);
      assert.match(spec.url, /^https:\/\/github\.com\//);
      assert.equal(spec.version, name === 'biome' ? '2.2.6' : '8.30.1');
    }
  }
  assert.throws(() => toolSpec('gitleaks', 'unsupported', 'x64'), /Unsupported/);
});

test('checksum mismatch blocks execution', () => {
  const bytes = Buffer.from('expected');
  verifyDigest(bytes, sha256(bytes));
  assert.throws(() => verifyDigest(Buffer.from('changed'), sha256(bytes)), /checksum mismatch/);
});

test('corrupted installed tool assets are rejected before execution', () => fixture(root => {
  const spec = toolSpec('gitleaks');
  const directory = join(root, '.verification/tools', `gitleaks-${spec.version}-${spec.platform}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, spec.asset), 'tampered archive');
  writeFileSync(join(directory, 'gitleaks'), 'tampered executable');
  assert.throws(() => qualityTool(root, 'gitleaks'), /checksum mismatch/);
}));

test('missing tools and scanner configuration fail closed', () => fixture(root => {
  assert.throws(() => qualityTool(root, 'gitleaks'), /Missing.*gitleaks/);
  rmSync(join(root, '.gitleaks.toml'));
  assert.throws(() => scanSecrets(root, true, tools), /Missing.*configuration/);
  rmSync(join(root, 'biome.json'));
  assert.throws(() => lint(root, true, tools), /Missing.*configuration/);
}));

test('staged lint inspects index bytes and preserves partially staged files', () => fixture(root => {
  const file = join(root, 'partially staged.ts');
  writeFileSync(file, 'export const value = 1;\n');
  git(root, 'add', '--', 'partially staged.ts');
  writeFileSync(file, 'debugger;\n');
  const index = readFileSync(join(root, '.git/index'));
  assert.equal(lint(root, true, tools), 1);
  if (existsSync(join(root, '.verification/tmp'))) assert.deepEqual(readdirSync(join(root, '.verification/tmp')), []);
  assert.deepEqual(readFileSync(join(root, '.git/index')), index);
  assert.equal(readFileSync(file, 'utf8'), 'debugger;\n');
  git(root, 'add', '--', 'partially staged.ts');
  writeFileSync(file, 'export const value = 1;\n');
  assert.throws(() => lint(root, true, tools), /Lint failed/);
  if (existsSync(join(root, '.verification/tmp'))) assert.deepEqual(readdirSync(join(root, '.verification/tmp')), []);
  assert.equal(readFileSync(file, 'utf8'), 'export const value = 1;\n');
}));

test('lint blocks parsing errors and configured defect rules without repairs', () => fixture(root => {
  const cases = [
    'debugger;\n',
    'function f() { return 1; return 2; }\n',
    'function f() { try { return 1; } finally { return 2; } }\n',
    'function f(a, a) {}\n',
    'export const = ;\n',
  ];
  for (const content of cases) {
    writeFileSync(join(root, 'defect.js'), content);
    assert.throws(() => lint(root, false, tools), /Lint failed/);
    assert.equal(readFileSync(join(root, 'defect.js'), 'utf8'), content);
  }
}));

test('lint handles empty stages, deletions, spaces and leading dashes', () => fixture(root => {
  assert.equal(lint(root, true, tools), 0);
  writeFileSync(join(root, '-valid file.ts'), 'export const value = 1;\n');
  git(root, 'add', '--', '-valid file.ts');
  assert.equal(lint(root, true, tools), 1);
  assert.equal(lint(root, false, tools), 2); // Includes biome.json.
  git(root, 'rm', '--cached', '--', '-valid file.ts');
  assert.equal(lint(root, true, tools), 0);
}));

test('staged scanner catches staged credentials despite clean unstaged edits', () => fixture(root => {
  const file = join(root, 'credentials.txt');
  writeFileSync(file, `token = "${secret()}"\n`);
  git(root, 'add', '--', 'credentials.txt');
  writeFileSync(file, 'placeholder\n');
  const index = readFileSync(join(root, '.git/index'));
  assert.throws(() => scanSecrets(root, true, tools), error => {
    assert.match(error.message, /Secret scan blocked/);
    assert(!error.message.includes(secret()));
    return true;
  });
  assert.deepEqual(readFileSync(join(root, '.git/index')), index);
  assert.equal(readFileSync(file, 'utf8'), 'placeholder\n');
}));

test('staged scanner ignores unstaged credentials and accepts clean or empty stages', () => fixture(root => {
  scanSecrets(root, true, tools);
  writeFileSync(join(root, 'credentials.txt'), 'placeholder\n');
  git(root, 'add', '--', 'credentials.txt');
  writeFileSync(join(root, 'credentials.txt'), `token = "${secret()}"\n`);
  scanSecrets(root, true, tools);
}));

test('invalid scanner config fails without exposing config contents', () => fixture(root => {
  writeFileSync(join(root, '.gitleaks.toml'), `invalid = "${secret()}\n`);
  git(root, 'add', '--', '.gitleaks.toml');
  assert.throws(() => scanSecrets(root, true, tools), error => {
    assert.match(error.message, /Secret scan blocked/);
    assert(!error.message.includes(secret()));
    return true;
  });
}));

test('scanner failures and malformed reports fail closed without replaying output', () => fixture(root => {
  for (const result of [
    { status: 2, stdout: secret(), stderr: secret() },
    { status: null, error: new Error(secret()), stdout: secret() },
    { status: 0, stdout: secret() },
    { status: 0, stdout: '{}' },
    { status: 0, stdout: '[{"Secret":"redacted"}]' },
  ]) assert.throws(() => scanSecrets(root, true, { tool: () => 'scanner', run: (command, args, cwd) => command === 'git' ? spawnSync(command, args, { cwd, encoding: 'utf8' }) : result }), error => {
    assert(!error.message.includes(secret()));
    return true;
  });
}));

test('history scanning requires complete history and rejects credentials removed later', () => fixture(root => {
  assert.throws(() => scanSecrets(root, false, tools), /Cannot inspect Git/);
  writeFileSync(join(root, 'credentials.txt'), `token = "${secret()}"\n`);
  git(root, 'add', '--', 'credentials.txt');
  git(root, 'commit', '--quiet', '-m', 'Synthetic scanner fixture');
  writeFileSync(join(root, 'credentials.txt'), 'placeholder\n');
  git(root, 'add', '--', 'credentials.txt');
  git(root, 'commit', '--quiet', '-m', 'Remove synthetic fixture');
  assert.throws(() => scanSecrets(root, false, tools), /Secret scan blocked/);
  writeFileSync(join(root, '.git/shallow'), git(root, 'rev-parse', 'HEAD'));
  assert.throws(() => scanSecrets(root, false, tools), /full Git checkout/);
}, { initialCommit: false }));

test('history scanning accepts a clean commit and scans all refs', () => fixture(root => {
  writeFileSync(join(root, 'clean.txt'), 'placeholder\n');
  git(root, 'add', '--', 'clean.txt');
  git(root, 'commit', '--quiet', '-m', 'Clean fixture');
  const clean = git(root, 'rev-parse', 'HEAD').trim();
  scanSecrets(root, false, tools);
  writeFileSync(join(root, 'credentials.txt'), `token = "${secret()}"\n`);
  git(root, 'add', '--', 'credentials.txt');
  git(root, 'commit', '--quiet', '-m', 'Synthetic branch fixture');
  git(root, 'branch', 'fixture-secret');
  git(root, 'checkout', '--quiet', '--detach', clean);
  assert.throws(() => scanSecrets(root, false, tools), /Secret scan blocked/);
}));

test('CLI reports missing configuration as nonzero', () => fixture(root => {
  rmSync(join(root, '.gitleaks.toml'));
  const result = spawnSync(process.execPath, [cli, 'secrets:staged'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required/);
  assert(!existsSync(join(root, '.verification/tools')));
}));

test('staged Biome configuration is linted without creating a nested root or changing the index', () => fixture(root => {
  writeFileSync(join(root, 'biome.json'), readFileSync(join(root, 'biome.json'), 'utf8') + '\n');
  git(root, 'add', '--', 'biome.json');
  const config = readFileSync(join(root,'biome.json'));
  const index = readFileSync(join(root,'.git/index'));
  assert.equal(lint(root,true,tools),1);
  assert.deepEqual(readFileSync(join(root,'biome.json')),config);
  assert.deepEqual(readFileSync(join(root,'.git/index')),index);
}));


test('staged lint rejects unstaged permissive configuration without changing source or index', () => fixture(root => {
  const config = join(root, 'biome.json');
  const source = join(root, 'defect.js');
  writeFileSync(source, 'debugger;\n');
  git(root, 'add', '--', 'biome.json', 'defect.js');
  writeFileSync(config, '{"linter":{"enabled":false}}\n');
  const index = readFileSync(join(root, '.git/index'));
  const workingConfig = readFileSync(config);
  assert.throws(() => lint(root, true, tools), /configuration differs from index/);
  assert.deepEqual(readFileSync(join(root, '.git/index')), index);
  assert.deepEqual(readFileSync(config), workingConfig);
  assert.equal(readFileSync(source, 'utf8'), 'debugger;\n');
}));

test('staged scanner rejects an unstaged allowlist without exposing or rewriting credential bytes', () => fixture(root => {
  const config = join(root, '.gitleaks.toml');
  const source = join(root, 'credentials.txt');
  const content = `token = "${secret()}"\n`;
  writeFileSync(source, content);
  git(root, 'add', '--', '.gitleaks.toml', 'credentials.txt');
  writeFileSync(config, '[extend]\nuseDefault = true\n[allowlist]\nregexes = [".*"]\n');
  const index = readFileSync(join(root, '.git/index'));
  const workingConfig = readFileSync(config);
  assert.throws(() => scanSecrets(root, true, tools), error => {
    assert.match(error.message, /configuration differs from index/);
    assert(!error.message.includes(secret()));
    return true;
  });
  assert.deepEqual(readFileSync(join(root, '.git/index')), index);
  assert.deepEqual(readFileSync(config), workingConfig);
  assert.equal(readFileSync(source, 'utf8'), content);
}));


test('staged gates reject root configuration missing from the index', () => fixture(root => {
  git(root, 'rm', '--cached', '--', 'biome.json', '.gitleaks.toml');
  const index = readFileSync(join(root, '.git/index'));
  assert.throws(() => lint(root, true, tools), /configuration is not indexed/);
  assert.throws(() => scanSecrets(root, true, tools), /configuration is not indexed/);
  assert.deepEqual(readFileSync(join(root, '.git/index')), index);
  assert(existsSync(join(root, 'biome.json')));
  assert(existsSync(join(root, '.gitleaks.toml')));
}));
