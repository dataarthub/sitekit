import test from 'node:test';
import assert from 'node:assert/strict';
import { Project, ts } from 'ts-morph';
import { inspectPublicJsdoc } from './jsdoc-coverage.mjs';
function inspect(source, others = {}) {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler } });
    project.createSourceFile('/repo/index.ts', source);
    for (const [name, body] of Object.entries(others))
        project.createSourceFile('/repo/' + name, body);
    return inspectPublicJsdoc({ project, root: '/repo', entrypoints: ['index.ts'] });
}
test('checks member summaries, generic roles and callback contracts, including nested option fields', () => {
    const report = inspect(`/** A transport payload. */ export interface Payload<T> { value:T; update:(value:T)=>T; nested:{ timeout:number }; }
 /** Runs a request. */ export function run(options:{id:string}):void { void options; }`);
    const kinds = new Set(report.issues.map(i => i.kind));
    for (const kind of ['member-description', 'type-param', 'param', 'returns', 'example'])
        assert(kinds.has(kind), kind);
    assert(report.issues.some(i => i.label.includes('nested.timeout')));
    assert(report.issues.some(i => i.label.includes('options.id')));
});
test('accepts meaningful owning docs on inline callbacks and collects their complete examples', () => {
    const report = inspect(`/** A reusable value.\n * @typeParam T - Value handled by the host.\n */ export interface Box<T> {
 /** Host-owned value. */ value:T;
 /** Updates one value synchronously.\n * @param value - Replacement host value.\n * @returns The accepted value.\n * @example\n * import type { Box } from '@demo/core';\n * export function update(box:Box<string>){return box.update('next');}\n */ update:(value:T)=>T;
 }`);
    assert.deepEqual(report.issues, []);
    assert.equal(report.examples.length, 1);
    assert.equal(report.stats.members, 2);
});
test('follows named types exposed only through public signatures and deduplicates reexports', () => {
    const report = inspect(`export {Transport} from './types.js'; export {Transport as TransportAlias} from './types.js';`, { 'types.ts': `/** Host transport. */ export interface Transport { /** Host HTTP client. */ fetch:Client; }
 type Client=(payload:Payload)=>Promise<Payload>;
 interface Payload { id:string; }
 export interface Unused { hidden:string; }` });
    assert(report.issues.some(i => i.label === 'Client' && i.kind === 'description'));
    assert(report.issues.some(i => i.label === 'Payload.id' && i.kind === 'member-description'));
    assert(!report.issues.some(i => i.label.includes('Unused')));
    assert.equal(report.stats.declarations, 3);
});
test('checks each public overload while excluding implementation bodies and private/protected members', () => {
    const report = inspect(`/** Runs a request.\n * @param value - Request text.\n * @returns Response text.\n * @example\n * import { run } from '@demo/core';\n * run('text');\n */ export function run(value:string):string;
 export function run(value:number):number;
 export function run(value:string|number){type Local={hidden:string};return value;}
 /** Public client.\n * @example\n * import { Client } from '@demo/core';\n * const client=new Client();\n */ export class Client { private secret:string=''; protected internal(){} }`);
    assert(report.issues.some(i => i.kind === 'description' && i.label.includes('run')));
    assert(!report.issues.some(i => i.label.includes('Local') || i.label.includes('secret') || i.label.includes('internal')));
});
test('checks callable aliases, generic methods and constructors, and all configured examples', () => {
    const report = inspect(`/** Public reader. */ export type Reader<T>=(input:T)=>Promise<T>;
 /** Client. */ export class Client { constructor(input:string){} map<U>(value:U):U{return value;} }`);
    assert(report.issues.some(i => i.label === 'Reader' && i.kind === 'returns'));
    assert(report.issues.some(i => i.label === 'Client.constructor' && i.kind === 'param'));
    assert(!report.issues.some(i => i.label === 'Client.constructor' && i.kind === 'returns'));
    assert(report.issues.some(i => i.label === 'Client.map' && i.kind === 'type-param'));
});
test('inspects public constant properties and inferred-schema shape fields, not helper bodies', () => {
    const report = inspect(`/** User-facing copy. */ export const copy={en:{title:'Hello'}};
 /** Site config type. */ export type Definition=Infer<typeof schema>;
 type Infer<T>=T; const schema=make({id:stringSchema()});
 declare function make<T>(value:T):T; declare function stringSchema():string;`);
    assert(report.issues.some(i => i.label === 'copy.en.title' && i.kind === 'member-description'));
    assert(report.issues.some(i => i.label === 'schema.id' && i.kind === 'member-description'));
});
test('checks inferred public return object contracts without scanning unrelated body locals', () => {
    const report = inspect(`/** Creates a client.\n * @returns A client.\n * @example\n * import {createClient} from '@demo/core';\n * createClient();\n */ export function createClient(){const hidden={local:1};return {read(input:string){return input},nested:{missing:true}};}`);
    assert(report.issues.some(i => i.kind === 'member-description' && i.label === 'createClient.read'));
    assert(report.issues.some(i => i.kind === 'param' && i.label === 'createClient.read'));
    assert(report.issues.some(i => i.kind === 'member-description' && i.label === 'createClient.nested.missing'));
    assert(!report.issues.some(i => i.label.includes('hidden') || i.label.includes('local')));
});
test('follows callable constant aliases to the canonical implementation contract', () => {
    const report = inspect(`/** Compatibility name. */ export const reader=read; function read(input:string){return input;}`);
    assert(report.issues.some(i => i.label === 'read' && i.kind === 'param'));
    assert(report.issues.some(i => i.label === 'read' && i.kind === 'example'));
});
test('collects properly attached nested JSDoc and checks generic constraints', () => {
    const report = inspect(`interface Constraint {missing:string}
 /** Host callback.\n * @typeParam T - Host payload.\n */ export type Callback=<T extends Constraint>(input:T)=>T;
 /** Result. */ export interface Result { nested:{\n /** A member summary. */ value:string } }`);
    assert(report.issues.some(i => i.label === 'Constraint.missing' && i.kind === 'member-description'));
    assert(!report.issues.some(i => i.label === 'Result.nested.value'));
});
test('requires each class overload contract and enum member description', () => {
    const report = inspect(`/** Client. */ export class Client {
        /** Reads text.\n * @param value - Host text.\n * @returns Host text.\n * @example\n * import type {Client} from '@demo/core';\n * export function read(c:Client){return c.read('text');}\n */ read(value:string):string;
        read(value:number):number;
        read(value:string|number){return value;}
    }
    /** States. */ export enum State { Ready='ready' }`);
    assert.equal(report.stats.callables, 2);
    assert(report.issues.some(i => i.kind === 'member-description' && i.label === 'State.Ready'));
    assert(report.issues.some(i => i.kind === 'param' && i.label === 'Client.read'));
});
test('retains safe leading documentation for a returned callback', () => {
    const report = inspect(`/** Makes a reader.\n * @returns A reader.\n * @example\n * import {make} from '@demo/core';\n * make();\n */ export function make(){
    /** Reads text.\n * @returns Host text.\n * @example\n * import {make} from '@demo/core';\n * make()();\n */ return ()=>'text';}`);
    assert.deepEqual(report.issues, []);
    assert.equal(report.examples.length, 2);
});
test('follows inferred generic containers and returned callbacks recursively', () => {
    const header='/** Creates payloads.\n * @returns Public payloads.\n * @example\n * import {factory} from "@demo/core";\n * factory();\n */';
    for(const value of ['[{missing:1}]','new Map([["key", {missing:1}]])','["key", {missing:1}] as const','()=>({missing:1})']) {
        const report=inspect(header+'export function factory(){return '+value+';}');
        assert(report.issues.some(i=>i.kind==='member-description'&&i.label.endsWith('.missing')),value);
    }
});
test('rejects apparently present comments that TypeScript does not attach to a member', () => {
    const report = inspect('/** Payload. */ export interface Payload { /** This comment is lost from declarations. */ value: string }');
    assert(report.issues.some(i=>i.kind==='attachment'&&i.label==='Payload.value'));
});
