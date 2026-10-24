import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateContractReport(report, files, root) {
  assert.equal(report.success, true, 'Contract suite failed');
  assert(report.numTotalTests > 0 && report.numPassedTests === report.numTotalTests, 'Every contract must execute and pass');
  assert.equal(report.numPendingTests, 0, 'Skipped contracts cannot establish success');
  assert.equal(report.numTodoTests ?? 0, 0, 'Todo contracts cannot establish success');
  assert(Array.isArray(report.testResults), 'Missing contract execution evidence');
  const results = new Map(report.testResults.map(result => [resolve(result.name), result]));
  assert.equal(report.testResults.length, results.size, 'Duplicate contract file results');
  assert.equal(results.size, files.length, 'Unexpected contract suite inventory');
  assert.equal(report.testResults.reduce((count, result) => {
    assert(Array.isArray(result.assertionResults), 'Missing contract assertions');
    return count + result.assertionResults.length;
  }, 0), report.numTotalTests, 'Contract assertion count differs from summary');
  for (const file of files) {
    const result = results.get(resolve(root, file));
    assert(result && result.status === 'passed', 'Required contract file did not pass: ' + file);
    assert(result.assertionResults.length > 0, 'Empty contract file: ' + file);
    assert(result.assertionResults.every(test => test.status === 'passed'), 'Every assertion must run: ' + file);
  }
}

export function runContractSuite(root, files, { projectRoot = root, config } = {}) {
  const temporary = join(projectRoot, '.verification/tmp');
  mkdirSync(temporary, { recursive: true });
  const directory = mkdtempSync(join(temporary, 'contracts-'));
  try {
    const reportPath = join(directory, 'vitest.json');
    const result = spawnSync(process.execPath, [join(projectRoot, 'node_modules/vitest/vitest.mjs'), 'run',
      '--root', root, ...(config ? ['--config', config] : []), ...files, '--reporter=json', '--outputFile', reportPath],
    { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'Required contract process failed');
    validateContractReport(JSON.parse(readFileSync(reportPath, 'utf8')), files, root);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const suites = [['.', ['packages/core/src/build/index.test.ts', 'packages/core/src/ai/representation.test.ts', 'packages/core/src/access/index.test.ts']], ['packages/cloudflare', ['src/projection.test.ts', 'src/studio-handler.test.ts']]];
  for (const [directory, files] of suites) runContractSuite(resolve(root, directory), files, { projectRoot: root });
  console.log('Required content, integrity and host-authority contracts executed with no skips.');
}
