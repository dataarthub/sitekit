import { describe, expect, it } from 'vitest';
import { parseSiteConnection, parseSiteTemplateDescriptor } from './index.js';
const capability = { available: false, reason: 'not_configured' };
const connection = () => ({ protocolVersion: 1, connectionId: 'connection-1', siteId: 'site-1', status: 'connected', capabilities: { content: { available: true }, measurement: capability, socialPublishing: capability, multiSiteManagement: capability } });
const template = () => ({ protocolVersion: 1, id: 'example', version: '1.0.0', locales: ['ja', 'en'], collections: [{ id: 'articles', contentType: 'ARTICLE', schema: { type: 'object', properties: { title: { type: 'string', minLength: 1, 'x-ui': { widget: 'textarea' } } }, required: ['title'] }, recordIdentity: { kind: 'localized-slug' }, mediaReferencePaths: [] }], mediaPolicy: { requiredAltLocales: ['ja', 'en'] } });
describe('public connection display contract', () => {
  it('round trips metadata without claiming authority or an endpoint', () => { expect(parseSiteConnection(connection())).toEqual(connection()); });
  it.each([
    (v: any) => { v.protocolVersion = 2; },
    (v: any) => { v.token = 'secret'; },
    (v: any) => { v.capabilities.content = { available: false }; },
    (v: any) => { v.capabilities.content = { available: true, reason: 'forbidden' }; },
    (v: any) => { v.capabilities.admin = { available: true }; },
    (v: any) => { v.status = 'disconnected'; },
  ])('rejects invalid version, secret fields and inconsistent capabilities (%#)', change => { const value = connection(); change(value); expect(() => parseSiteConnection(value)).toThrow(); });
});
describe('portable template contract', () => {
  it('round trips a data-only descriptor and local schema references', () => {
    const value = template(); expect(parseSiteTemplateDescriptor(value)).toEqual(value);
    value.collections[0]!.schema = { type: 'object', $defs: { title: { type: 'string' } }, properties: { title: { $ref: '#/$defs/title' } } } as any;
    expect(parseSiteTemplateDescriptor(value)).toEqual(value);
  });
  it.each([
    (v: any) => { v.collections.push(structuredClone(v.collections[0])); },
    (v: any) => { v.collections[0].schema.properties.title.$ref = 'https://example.test/schema'; },
    (v: any) => { v.collections[0].schema.properties.title.$ref = '#/missing'; },
    (v: any) => { v.collections[0].schema.properties.title.$ref = '#'; },
    (v: any) => { v.collections[0].schema.properties.title['x-db'] = {}; },
    (v: any) => { v.collections[0].schema.properties.title['x-ui'].script = 'execute'; },
    (v: any) => { v.collections[0].schema.properties.title.minLength = 'one'; },
    (v: any) => { v.collections[0].schema.properties.title.default = () => 'code'; },
    (v: any) => { v.collections[0].schema.properties.title.default = new Date(); },
    (v: any) => { v.collections[0].schema.properties.title.default = NaN; },
    (v: any) => { v.collections[0].schema.properties.title.default = JSON.parse('{"__proto__":{}}'); },
    (v: any) => { v.collections[0].schema.properties.title.default = 'x'.repeat(256 * 1024); },
    (v: any) => { v.collections[0].mediaReferencePaths = [{ path: ['constructor'] }]; },
    (v: any) => { v.version = 'not-semver'; },
    (v: any) => { v.mediaPolicy.requiredAltLocales = ['fr']; },
  ])('rejects unsafe, unsupported or inconsistent descriptor (%#)', change => { const value = template(); change(value); expect(() => parseSiteTemplateDescriptor(value)).toThrow(); });
  it('enforces collection, locale and depth bounds', () => {
    const value: any = template();
    value.locales = Array.from({ length: 17 }, (_, i) => 'lang' + i); expect(() => parseSiteTemplateDescriptor(value)).toThrow();
    value.locales = ['ja', 'en']; value.collections = Array.from({ length: 33 }, (_, i) => ({ ...value.collections[0], id: 'c' + i, contentType: 'T' + i })); expect(() => parseSiteTemplateDescriptor(value)).toThrow();
    value.collections = [value.collections[0]]; let nested: any = { type: 'string' }; for (let i = 0; i < 33; i++) nested = { type: 'object', properties: { nested } }; value.collections[0].schema = nested; expect(() => parseSiteTemplateDescriptor(value)).toThrow();
  });
  it('rejects cyclic runtime data, accessors, sparse arrays and unsupported schema references', () => {
    const value: any = template(); value.collections[0].schema.default = value; expect(() => parseSiteTemplateDescriptor(value)).toThrow();
    delete value.collections[0].schema.default; Object.defineProperty(value, 'token', { get() { throw Error('accessor executed'); }, enumerable: true }); expect(() => parseSiteTemplateDescriptor(value)).toThrow('Invalid');
    const sparse = template(); sparse.locales = Array(2); expect(() => parseSiteTemplateDescriptor(sparse)).toThrow();
    const target: any = template(); target.collections[0].schema.properties.title.$ref = '#/properties/title/type'; expect(() => parseSiteTemplateDescriptor(target)).toThrow();
  });
});
