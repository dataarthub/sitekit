// Node 24+. Reviewed commands only: this runner is not a sandbox or an attestation authority.
import { readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, dirname, basename, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const sides = ['public', 'private'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function requireValue(ok, message) { if (!ok) throw Error(message); }
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { throw Error('Missing or invalid JSON input'); }
}
function checkSelection(checks) {
  requireValue(Array.isArray(checks) && checks.length > 0, 'Nonempty check selection required');
  const names = new Set();
  for (const check of checks) {
    requireValue(nonempty(check?.name) && !names.has(check.name), 'Unique check names required'); names.add(check.name);
    requireValue(Array.isArray(check.command) && check.command.length > 0 && check.command.every(nonempty), 'Executable/argument array required');
    requireValue(Number.isInteger(check.timeoutMs ?? 60000) && (check.timeoutMs ?? 60000) > 0 && (check.timeoutMs ?? 60000) <= 60000, 'Check deadline must be 1-60000ms');
  }
}
function validatePlan(plan) {
  requireValue(plan?.schemaVersion === 1 && nonempty(plan.taskId) && sides.includes(plan.side), 'Invalid side plan identity');
  requireValue(typeof plan.revision === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(plan.revision), 'Full Git revision required');
  requireValue(['changed', 'no-change'].includes(plan.impact?.decision) && nonempty(plan.impact.rationale) && nonempty(plan.impact.reviewedBy), 'Reviewed impact decision and rationale required');
  checkSelection(plan.checks);
}
function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  requireValue(!result.error && result.status === 0, 'Git inspection failed'); return result.stdout.trim();
}
function assertRevision(root, expected) {
  requireValue(realpathSync(git(root, ['rev-parse', '--show-toplevel'])) === realpathSync(root), 'Use repository root');
  requireValue(git(root, ['rev-parse', 'HEAD']) === expected, 'Revision changed or mismatched');
  requireValue(git(root, ['status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none']) === '', 'Clean tracked and untracked inputs required');
}
class CheckFailure extends Error {
  constructor(check, index, stage, result, reason) {
    super('Required command failed or timed out');
    this.diagnostic = {
      stage, step: index + 1,
      ...(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(check.name) ? { check: check.name } : {}),
      status: Number.isInteger(result.status) ? result.status : null,
      signal: /^SIG[A-Z0-9]+$/.test(result.signal ?? '') ? result.signal : null,
      reason,
    };
  }
}
function runChecks(root, checks, stage) {
  return checks.map((check, index) => {
    // Separate owned process groups include ordinary npm/bun worker descendants.
    // A sync launch with ignored stdio returns after the direct child exits;
    // clean the group on success, failure and timeout before continuing.
    if (!['darwin', 'linux'].includes(process.platform)) throw new CheckFailure(check, index, stage, {}, 'unsupported-platform');
    const result = spawnSync(check.command[0], check.command.slice(1), { cwd: root, timeout: check.timeoutMs ?? 60000, killSignal: 'SIGKILL', shell: false, stdio: 'ignore', detached: true });
    if (result.pid) {
      try { process.kill(-result.pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw new CheckFailure(check, index, stage, result, 'cleanup-failed'); }
    }
    if (result.error || result.signal || result.status !== 0) {
      const reason = result.error?.code === 'ETIMEDOUT' ? 'timeout' : result.error ? 'spawn-failed' : result.signal ? 'signal' : 'exit';
      throw new CheckFailure(check, index, stage, result, reason);
    }
    return { name: check.name, status: 'passed' };
  });
}
function loadPlan(path) {
  const bytes = readFileSync(path); const plan = JSON.parse(bytes.toString('utf8')); validatePlan(plan); return { plan, hash: digest(bytes) };
}
function assertPlanUnchanged(path, hash) {
  requireValue(digest(readFileSync(path)) === hash, 'Plan changed during verification');
}
/** Run a reviewed local plan without reading the other side. Output must be outside the checkout.
 * Produces an unsigned receipt; trusted CI provenance and reviewer authorization are adopter duties.
 */
export function verifySide({ root, plan: planPath, output }) {
  requireValue([root, planPath, output].every(nonempty), 'Side root, plan and output required');
  root = realpathSync(resolve(root)); planPath = realpathSync(resolve(planPath));
  output = resolve(realpathSync(dirname(resolve(output))), basename(output));
  const target = relative(root, output);
  requireValue((target.startsWith('..' + sep) || isAbsolute(target)) && output !== planPath, 'Receipt output must be outside repository and separate from plan');
  // A failed rerun cannot leave this invocation's old passing receipt behind.
  rmSync(output, { force: true });
  const { plan, hash } = loadPlan(planPath);
  assertRevision(root, plan.revision);
  const checks = runChecks(root, plan.checks, 'local');
  assertRevision(root, plan.revision); assertPlanUnchanged(planPath, hash);
  const receipt = { schemaVersion: 1, taskId: plan.taskId, side: plan.side, revision: plan.revision, planSha256: hash, checks, runtime: { node: process.version, platform: process.platform, arch: process.arch } };
  mkdirSync(dirname(output), { recursive: true });
  const temporary = output + '.' + process.pid + '.tmp';
  try { writeFileSync(temporary, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); renameSync(temporary, output); }
  finally { rmSync(temporary, { force: true }); }
  return receipt;
}
function verifyEvidence(side, entry, taskId, baseDir) {
  requireValue(entry && [entry.root, entry.plan, entry.receipt].every(nonempty), 'Both side entries required');
  const root = resolve(baseDir, entry.root), path = resolve(baseDir, entry.plan);
  const { plan, hash } = loadPlan(path);
  requireValue(plan.taskId === taskId && plan.side === side, 'Plan task/side mismatch');
  assertRevision(root, plan.revision);
  const receipt = readJson(resolve(baseDir, entry.receipt));
  requireValue(receipt?.schemaVersion === 1 && receipt.taskId === taskId && receipt.side === side && receipt.revision === plan.revision && receipt.planSha256 === hash, 'Receipt binding mismatch');
  requireValue(Array.isArray(receipt.checks) && receipt.checks.length === plan.checks.length && plan.checks.every((check, i) => receipt.checks[i]?.name === check.name && receipt.checks[i]?.status === 'passed'), 'Missing or unsuccessful required check evidence');
  return { root, path, plan, hash };
}
/** Restricted coordinator only. Validates both receipts/current trees and runs compatibility checks.
 * A passing result means development verification, not publication or semantic impact approval.
 */
export function verifyPair(config, baseDir = process.cwd()) {
  requireValue(config?.schemaVersion === 1 && nonempty(config.taskId), 'Invalid coordination identity');
  checkSelection(config.checks);
  requireValue(config.delivery && sides.every(side => ['pending', 'delivered', 'not-required'].includes(config.delivery[side])), 'Separate delivery states required');
  const evidence = sides.map(side => verifyEvidence(side, config.sides?.[side], config.taskId, baseDir));
  requireValue(new Set(evidence.map(item => realpathSync(item.root))).size === 2, 'Distinct public/private repositories required');
  runChecks(resolve(baseDir), config.checks, 'compatibility');
  for (const item of evidence) { assertRevision(item.root, item.plan.revision); assertPlanUnchanged(item.path, item.hash); }
  sides.forEach(side => verifyEvidence(side, config.sides[side], config.taskId, baseDir));
  return { development: 'verified', delivery: { ...config.delivery } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === 'side' && args.length === 3) {
      verifySide({ root: args[0], plan: args[1], output: args[2] });
      console.log('Local side verification passed; receipt written.');
    } else if (mode === 'pair' && args.length === 1) {
      const path = resolve(args[0]); const result = verifyPair(readJson(path), dirname(path));
      console.log(JSON.stringify(result));
    } else throw Error('Usage: side <root> <plan.json> <receipt.json> | pair <restricted-task.json>');
  } catch (error) {
    console.error('Paired maintenance verification failed; inspect inputs and required checks in the authorized environment.');
    if (error instanceof CheckFailure) console.error(JSON.stringify(error.diagnostic));
    process.exitCode = 1;
  }
}
