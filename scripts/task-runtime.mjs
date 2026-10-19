import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { release } from 'node:os';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const bun = spawnSync('bun', ['--version'], { encoding: 'utf8' });
if (bun.status !== 0) throw Error('Bun is required');
// Callers cannot override the actual runtime identity.
const env = { ...process.env, VERIFICATION_TASK_RUNTIME: JSON.stringify({ node: process.version, interpreter: process.versions.bun ? 'bun' : 'node', bun: bun.stdout.trim(), platform: process.platform, arch: process.arch, osRelease: release(), runnerImage: { os: process.env.ImageOS ?? null, version: process.env.ImageVersion ?? null } }), TURBO_TELEMETRY_DISABLED: '1' };
const args = process.argv.slice(2);
assert.equal(args[0], 'run', 'Use an explicit task run');
const requested = args.slice(1, args.findIndex((arg, index) => index > 0 && arg.startsWith('-')) < 0 ? undefined : args.findIndex((arg, index) => index > 0 && arg.startsWith('-')));
assert(requested.length > 0, 'Select required tasks explicitly');
const binary = resolve(root, 'node_modules/.bin/turbo');
const plan = spawnSync(binary, [...args, '--dry=json', '--cache=local:rw'], { cwd: root, env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 120_000 });
assert(!plan.error && plan.status === 0, 'Cannot validate task selection');
const { packages, tasks } = JSON.parse(plan.stdout);
assert(packages.length > 0, 'Required package selection is empty');
// Dependencies are real required work too: Turbo otherwise permits a missing
// upstream script as a no-op and can report the downstream task successful.
for (const candidate of tasks) {
  assert(candidate.command?.trim() && candidate.command !== '<NONEXISTENT>', 'Required dependency task is missing: ' + candidate.taskId);
}
// Only the selected packages need every explicit task; dependencies may contribute build alone.
for (const name of packages) {
  for (const task of requested) {
    assert(tasks.some(candidate => candidate.package === name && candidate.task === task && candidate.command?.trim() && candidate.command !== '<NONEXISTENT>'), 'Required task is missing: ' + name + '#' + task);
  }
}
const result = spawnSync(binary, [...args, '--cache=local:rw'], { cwd: root, env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
