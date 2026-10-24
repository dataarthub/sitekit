import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runContractSuite, validateContractReport } from './verify-contracts.mjs';
const root = resolve(import.meta.dirname, '..');
test('contract evidence rejects missing files, empty, skipped, todo and failed assertions', () => {
  const good = { success: true, numTotalTests: 1, numPassedTests: 1, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ name: join(root, 'contract.test.ts'), status: 'passed', assertionResults: [{ status: 'passed' }] }] };
  validateContractReport(good, ['contract.test.ts'], root);
  for (const change of [
    { success: false }, { numTotalTests: 0, numPassedTests: 0 }, { numPassedTests: 0 }, { numPendingTests: 1 }, { numTodoTests: 1 },
    { testResults: [] }, { testResults: [good.testResults[0], good.testResults[0]] },
    { numTotalTests: 50, numPassedTests: 50 }, { testResults: [{ ...good.testResults[0], assertionResults: [] }] },
    ...['pending', 'todo', 'failed'].map(status => ({ testResults: [{ ...good.testResults[0], assertionResults: [{ status }] }] })),
  ]) assert.throws(() => validateContractReport({ ...good, ...change }, ['contract.test.ts'], root));
});
test('actual runner refuses empty and skip-only files; an executed assertion passes', () => {
  const temporary = join(root, '.verification/tmp'); mkdirSync(temporary, { recursive: true });
  const fixture = mkdtempSync(join(temporary, 'contract-negative-'));
  try {
    const config = join(fixture, 'vitest.config.mjs');
    writeFileSync(config, "export default { test: { include: ['*.test.ts'] } };\n");
    writeFileSync(join(fixture, 'passing.test.ts'), "import {test,expect} from 'vitest'; test('executes',()=>{expect(1).toBe(1)});");
    writeFileSync(join(fixture, 'empty.test.ts'), '');
    assert.throws(() => runContractSuite(fixture, ['passing.test.ts', 'empty.test.ts'], { projectRoot: root, config }));
    rmSync(join(fixture, 'passing.test.ts')); rmSync(join(fixture, 'empty.test.ts'));
    for (const [source, accepted] of [
      ['', false],
      ["import {test} from 'vitest'; test.skip('not executed',()=>{});", false],
      ["import {test,expect} from 'vitest'; test('executes',()=>{expect(1).toBe(1)});", true],
    ]) {
      writeFileSync(join(fixture, 'contract.test.ts'), source);
      const run = () => runContractSuite(fixture, ['contract.test.ts'], { projectRoot: root, config });
      if (accepted) run(); else assert.throws(run);
    }
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
