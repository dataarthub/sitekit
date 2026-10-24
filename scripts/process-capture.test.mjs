import test from 'node:test';
import assert from 'node:assert/strict';
import {captureProcess} from './process-capture.mjs';

test('archive inspection captures more than the default one MiB without truncating package content',()=>{
 const bytes=2*1024*1024;
 const result=captureProcess(process.execPath,['-e',`process.stdout.write('x'.repeat(${bytes}));process.stdout.write('END')`]);
 assert.equal(result.length,bytes+3);assert(result.endsWith('END'));
});
test('oversized or failed inspection is rejected rather than accepted as a partial archive',()=>{
 assert.throws(()=>captureProcess(process.execPath,['-e',"process.stdout.write('x'.repeat(17*1024*1024))"]));
 assert.throws(()=>captureProcess(process.execPath,['-e','process.exit(7)']));
});
