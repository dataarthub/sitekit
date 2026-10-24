import test from 'node:test';import assert from 'node:assert/strict';
import {parseCacheProbePhase} from './cache-probe-selection.mjs';
test('normal gate retains complete coverage and explicit bounded selections are valid',()=>{
 assert.equal(parseCacheProbePhase([]),'all');assert.equal(parseCacheProbePhase(['--phase','failures']),'failures');
});
test('unknown, empty or additional selections cannot silently skip coverage',()=>{
 for(const args of [['--phase'],['--phase','unknown'],['--skip','all'],['--phase','restore','--skip','failures']])assert.throws(()=>parseCacheProbePhase(args));
});
import {executeCacheProbePhases} from './cache-probe-selection.mjs';
test('bounded dispatch executes its selected invariant, while full dispatch preserves every group order',()=>{
 const names=['restore','inputs','environment','failures','coverage'];
 for(const selected of names){const calls=[];const groups=Object.fromEntries(names.map(name=>[name,()=>calls.push(name)]));executeCacheProbePhases(selected,groups);assert.deepEqual(calls,[selected]);}
 const calls=[];executeCacheProbePhases('all',Object.fromEntries(names.map(name=>[name,()=>calls.push(name)])));assert.deepEqual(calls,names);
});
test('missing invariant blocks fail before issuing any execution success',()=>{
 let called=false;assert.throws(()=>executeCacheProbePhases('restore',{restore:()=>{called=true;}}));assert.equal(called,false);
});
