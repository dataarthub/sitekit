// Always exercise the cache in an owned copy, never mutate the caller's files.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
const source = resolve(import.meta.dirname, '..');
const temporary = join(source, '.verification/tmp');
mkdirSync(temporary, { recursive: true });
const fixture = mkdtempSync(join(temporary, 'cache-probe-'));
const excluded = new Set(['node_modules', '.git', '.turbo', '.verification', 'dist']);
const env = { ...process.env, ImageVersion: 'cache-probe-baseline', NODE_PATH: '' };
function command(command, args, expected = 0, extra = {}) {
  const result = spawnSync(command, args, { cwd: fixture, env: { ...env, ...extra }, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
  assert(!result.error, 'Probe process failed or timed out');
  if (expected === 0) assert.equal(result.status, 0, 'Probe command failed: ' + result.stderr);
  else assert(result.status !== 0, 'Failing task was accepted');
  return result;
}
function run(expected = 0, extra = {}, tasks = ['build', 'typecheck', 'test'], runtime = process.execPath) {
  const directory = join(fixture, '.turbo/runs');
  let before = new Set();
  try { before = new Set(readdirSync(directory)); } catch { /* First run. */ }
  command(runtime, ['scripts/task-runtime.mjs', 'run', ...tasks, '--summarize'], expected, extra);
  const added = readdirSync(directory).filter(name => !before.has(name));
  assert.equal(added.length, 1, 'Each invocation needs a fresh run summary');
  const summary = JSON.parse(readFileSync(join(directory, added[0]), 'utf8'));
  assert(summary.tasks.length > 0, 'Empty task selection is not passing evidence');
  return summary.tasks;
}
const all = (tasks, status) => assert(tasks.every(task => task.cache.status === status), 'Unexpected cache result: ' + tasks.map(task => task.taskId + '=' + task.cache.status).join(', '));
try {
  for (const entry of readdirSync(source)) {
    if (!excluded.has(entry)) cpSync(join(source, entry), join(fixture, entry), { recursive: true, filter: path => !excluded.has(basename(path)) });
  }
  command('bun', ['install', '--frozen-lockfile', '--ignore-scripts', '--registry=https://registry.npmjs.org']);
  command('git', ['-c', 'init.templateDir=', 'init', '--quiet']);
  const unit = join(fixture, 'packages/core/src/cache-probe.test.ts');
  const original = "import { test, expect } from 'vitest';\ntest('cache selection', () => expect(1).toBe(1));\n";
  writeFileSync(unit, original);
  all(run(), 'MISS');
  all(run(), 'HIT');
  const restored = ['packages/core/dist/index.d.ts', 'packages/cloudflare/dist/index.js', 'packages/core/docs/index.md', 'packages/core/schema/site.schema.json', 'packages/core/README.md'];
  const bytes = restored.map(file => readFileSync(join(fixture, file)));
  for (const file of restored) rmSync(join(fixture, file));
  all(run(), 'HIT');
  restored.forEach((file, index) => assert.deepEqual(readFileSync(join(fixture, file)), bytes[index], 'Cache must restore identical bytes: ' + file));
  all(run(0, { VERIFICATION_TASK_RUNTIME: 'caller-supplied-false-version' }), 'HIT');
  for (const file of ['packages/core/src/index.ts', 'scripts/task-runtime.mjs', 'vitest.config.ts', 'bun.lock']) {
    writeFileSync(join(fixture, file), readFileSync(join(fixture, file), 'utf8') + '\n');
    all(run(), 'MISS');
    all(run(), 'HIT');
  }
  all(run(0, { ImageVersion: 'cache-probe-other-image' }), 'MISS');
  all(run(0, {}, ['build', 'typecheck', 'test'], 'bun'), 'MISS');
  all(run(), 'HIT');
  writeFileSync(unit, original + '\ntest("new selected case", () => expect(1).toBe(2));\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    const failed = run(1, {}, ['test']);
    const test = failed.find(task => task.taskId === '@alneas/sitekit#test');
    assert(test && test.cache.status === 'MISS', 'Failed tests must never become cache hits');
  }
  const testFiles = readdirSync(join(fixture, 'packages/core/src'), { recursive: true }).filter(file => /\.test\.tsx?$/.test(file));
  const tests = testFiles.map(file => [join(fixture, 'packages/core/src', file), readFileSync(join(fixture, 'packages/core/src', file))]);
  for (const [file] of tests) rmSync(file);
  for (let attempt = 0; attempt < 2; attempt++) {
    const empty = run(1, {}, ['test']);
    assert.equal(empty.find(task => task.taskId === '@alneas/sitekit#test')?.cache.status, 'MISS');
  }
  for (const [file, bytes] of tests) writeFileSync(file, bytes);
  writeFileSync(unit, original);
  all(run(), 'HIT');
  const adapterManifest = join(fixture, 'packages/cloudflare/package.json');
  const adapterOriginal = readFileSync(adapterManifest, 'utf8');
  for (const missing of ['build', 'test', 'typecheck']) {
    const adapter = JSON.parse(adapterOriginal);
    delete adapter.scripts[missing];
    writeFileSync(adapterManifest, JSON.stringify(adapter));
    // The library still implements the task, so global task-name coverage is insufficient.
    command(process.execPath, ['scripts/task-runtime.mjs', 'run', 'build', 'typecheck', 'test'], 1);
    command(process.execPath, ['scripts/task-runtime.mjs', 'run', missing, '--filter=@alneas/sitekit']);
    const retained = missing === 'test' ? 'typecheck' : 'test';
    command(process.execPath, ['scripts/task-runtime.mjs', 'run', retained, '--filter=@alneas/sitekit-cloudflare'], missing === 'build' ? 1 : 0);
  }
  writeFileSync(adapterManifest, adapterOriginal);
  command(process.execPath, ['scripts/task-runtime.mjs', 'run', 'not-a-task'], 1);
  command(process.execPath, ['scripts/task-runtime.mjs', 'run', 'test', '--filter=@alneas/sitekit-cloudflare', '--filter=!@alneas/sitekit-cloudflare'], 1);
  command(process.execPath, ['scripts/task-runtime.mjs', 'run', 'test', '--filter=@example/missing'], 1);
  console.log('Cache probes passed: stable hits; output restoration; source/helper/config/lock/runtime/image invalidation; changed tests selected; failed and missing test files never reused.');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
