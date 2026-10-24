import {ts}from'ts-morph';
import test from 'node:test';import assert from 'node:assert/strict';
import {declarationTagIssues}from'./declaration-tags.mjs';
test('rejects duplicate singleton and same-name parameter tags without rejecting distinct parameters or examples',()=>{
 const bad='/** Runs.\n * @param value First.\n * @param value Second.\n * @returns First.\n * @returns Second.\n */ export declare function run(value:string):string;';
 const issues=declarationTagIssues(ts,bad,'fixture.d.ts');assert(issues.some(x=>x.tag==='param:value'));assert(issues.some(x=>x.tag==='returns'));
 const good='/** Runs.\n * @param one First.\n * @param two Second.\n * @example\n * run(1,2);\n * @example\n * run(2,3);\n * @returns Sum.\n */ export declare function run(one:number,two:number):number;';assert.deepEqual(declarationTagIssues(ts,good,'fixture.d.ts'),[]);
});
test('rejects duplicate generic tags and malformed emitted declarations',()=>{
 assert(declarationTagIssues(ts,'/** Maps.\n * @typeParam T - First.\n * @typeParam T - Second.\n */ export interface Box<T>{value:T}','fixture.d.ts').some(x=>x.tag==='typeParam:T'));
 assert(declarationTagIssues(ts,'export declare function broken(:','fixture.d.ts').some(x=>x.tag==='syntax'));
});
