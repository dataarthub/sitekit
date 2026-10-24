import test from 'node:test';import assert from 'node:assert/strict';
import {verifyNoticeInputs} from './check-notice-inputs.mjs';
const lock={packages:{core:['@fixture/core@0.2.1'],react:['@fixture/react@0.3.0'],nested:['@fixture/core@0.2.0']}};
const notices={packages:[{name:'@fixture/core',versions:['0.2.0','0.2.1'],license:'MIT'},{name:'@fixture/react',versions:['0.3.0'],license:'MIT'}]};
test('current direct and nested versions remain visible',()=>assert.doesNotThrow(()=>verifyNoticeInputs(notices,lock,{'@fixture/core':'0.2.1','@fixture/react':'0.3.0'})));
test('stale, duplicate, incomplete or undocumented required versions fail',()=>{
 for(const packages of [[{...notices.packages[1],versions:['0.2.0']}],[notices.packages[0],notices.packages[0]],[],[{...notices.packages[0],license:''}]])assert.throws(()=>verifyNoticeInputs({packages},lock,{'@fixture/core':'0.2.1','@fixture/react':'0.3.0'}));
});
