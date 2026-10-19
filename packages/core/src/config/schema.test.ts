import {test,expect} from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../../../schema/site.schema.json';
import {defineSite} from './index.js';
const ajv=new Ajv2020({strict:true});addFormats(ajv);const validate=ajv.compile(schema);
test('generated schema validates each supported source and rejects ambiguous or malformed config',()=>{
 for(const content of [{snapshot:{siteId:'example',revision:1,posts:[]}},{file:'./snapshot.json',draftPreview:true},{endpoint:'https://example.com/snapshot',method:'GET'}]){
  const input={id:'example',revision:1,content};expect(validate(input),JSON.stringify(validate.errors)).toBe(true);expect(defineSite(input as never).id).toBe('example');
 }
 for(const input of [{id:'',content:{file:'x'}},{id:'example',revision:1.5,content:{file:'x'}},{id:'example',revision:Number.MAX_SAFE_INTEGER+1,content:{file:'x'}},{id:'example',content:{}},{id:'example',content:{snapshot:{},file:'x'}},{id:'example',content:{file:'x',method:'GET'}},{id:'example',content:{endpoint:'not a URL'}},{id:'example',extra:true,content:{file:'x'}}]){
  expect(validate(input),JSON.stringify(input)).toBe(false);expect(()=>defineSite(input as never)).toThrow();
 }
});
test('schema documents its runtime validation boundary rather than implying equivalent authorization',()=>{
 expect(schema.$comment).toContain('defineSite');
 for(const input of [{id:' ',content:{file:'x'}},{id:'example',content:{endpoint:'ftp://example.com/snapshot'}},{id:'example',content:{endpoint:'https://user:pass@example.com/snapshot'}}]){
  expect(validate(input)).toBe(true);expect(()=>defineSite(input as never)).toThrow();
 }
 const input={id:'example',content:{snapshot:null}};expect(validate(input)).toBe(true);expect(()=>defineSite(input)).not.toThrow();
});
