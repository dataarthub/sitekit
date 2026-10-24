import { z } from 'zod';
import type { JsonValue, SiteConnection, SiteTemplateDescriptor } from './contracts.js';
import { assertPortableJson, assertSchemaProfile } from './schema-profile.js';
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const locale = z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/);
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const capability = z.discriminatedUnion('available', [z.strictObject({ available: z.literal(true) }), z.strictObject({ available: z.literal(false), reason: z.enum(['subscription_required', 'not_configured', 'forbidden', 'unavailable']) })]);
const connection = z.strictObject({ protocolVersion: z.literal(1), connectionId: id, siteId: id, status: z.enum(['connected', 'reauthorization_required', 'disconnected']), capabilities: z.strictObject({ content: capability, measurement: capability, socialPublishing: capability, multiSiteManagement: capability }) }).refine(value => value.status === 'connected' || Object.values(value.capabilities).every(item => !item.available));
const segment = z.string().min(1).max(160).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value));
const path = z.array(segment).min(1).max(32);
const identity = z.union([z.strictObject({ kind: z.enum(['locale', 'slug', 'localized-slug']) }), z.strictObject({ kind: z.literal('localized-data'), path: path.refine(value => !value.includes('*')), fallback: z.literal('slug') })]);
const primitive = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const reference = z.strictObject({ path, when: z.array(z.strictObject({ path, equals: primitive })).min(1).max(32).optional() });
const collection = z.strictObject({ id, contentType: id, schema: z.custom<Record<string, JsonValue>>(value => !!value && typeof value === 'object' && !Array.isArray(value)), recordIdentity: identity, mediaReferencePaths: z.array(reference).max(1024), label: z.string().min(1).max(200).optional(), locales: z.array(locale).min(1).max(16).refine(unique).optional(), supportsRichText: z.boolean().optional(), supportsMedia: z.boolean().optional(), bodyRequired: z.boolean().optional() });
const version = z.string().max(160).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
const descriptor = z.strictObject({ protocolVersion: z.literal(1), id, version, locales: z.array(locale).min(1).max(16).refine(unique), collections: z.array(collection).min(1).max(32), mediaPolicy: z.strictObject({ requiredAltLocales: z.array(locale).max(16).refine(unique) }) }).refine(value => unique(value.collections.map(item => item.id)) && unique(value.collections.map(item => item.contentType)) && value.mediaPolicy.requiredAltLocales.every(item => value.locales.includes(item)) && value.collections.every(item => !item.locales || item.locales.every(l => value.locales.includes(l))));
/**
 * Parses credential-free connection metadata. Availability never grants service access.
 * @param input - Untrusted connection metadata.
 * @returns Validated metadata without credentials.
 * @example
 * ```ts
 * import { parseSiteConnection } from '@alneas/sitekit/connection';
 * const off = { available: false, reason: 'not_configured' } as const;
 * const connection = parseSiteConnection({ protocolVersion: 1, connectionId: 'c1', siteId: 's1', status: 'disconnected', capabilities: { content: off, measurement: off, socialPublishing: off, multiSiteManagement: off } });
 * ```
 */
export function parseSiteConnection(input: unknown): SiteConnection { return connection.parse(input); }
/**
 * Parses a bounded data-only descriptor against the supported schema profile.
 * This does not register a template, execute validators or authorize a tenant.
 * @param input - Untrusted portable template data.
 * @returns Detached descriptor validated against version one and its schema profile.
 * @example
 * ```ts
 * import { parseSiteTemplateDescriptor } from '@alneas/sitekit/connection';
 * const template = parseSiteTemplateDescriptor({ protocolVersion: 1, id: 'basic', version: '1.0.0', locales: ['en'], collections: [{ id: 'pages', contentType: 'PAGE', schema: { type: 'object' }, recordIdentity: { kind: 'localized-slug' }, mediaReferencePaths: [] }], mediaPolicy: { requiredAltLocales: [] } });
 * ```
 */
export function parseSiteTemplateDescriptor(input: unknown): SiteTemplateDescriptor {
  assertPortableJson(input);
  const value = descriptor.parse(input);
  for (const item of value.collections) assertSchemaProfile(item.schema);
  return structuredClone(value) as SiteTemplateDescriptor;
}
