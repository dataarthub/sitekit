import type { EaosCmsPublishedSnapshot } from '../content/eaos-cms.js';
/** A JSON scalar, including a finite number. */
export type JsonPrimitive = string | number | boolean | null;
/** Portable data; parsers reject non-JSON runtime values. */
export type JsonValue = JsonPrimitive | JsonValue[] | {
  /** A JSON property value. */
  [key: string]: JsonValue };
/** Display-only service availability, never proof of authorization. */
export type ConnectionCapability = {
  /** Operation is advertised as available. */
  available: true } | {
  /** Operation is unavailable. */
  available: false;
  /** Safe explanation for presentation. */
  reason: 'subscription_required' | 'not_configured' | 'forbidden' | 'unavailable' };
/** Public metadata for an authenticated host connection. Contains no credentials. */
export interface SiteConnection {
  /** Supported wire contract version. */
  protocolVersion: 1;
  /** Opaque host connection identifier. */
  connectionId: string;
  /** Site bound to this connection by the service. */
  siteId: string;
  /** Connection state reported by the service. */
  status: 'connected' | 'reauthorization_required' | 'disconnected';
  /** Presentation hints; each operation still requires server authorization. */
  capabilities: {
  /** Content operations. */
  content: ConnectionCapability;
  /** Measurement operations. */
  measurement: ConnectionCapability;
  /** Social publication operations. */
  socialPublishing: ConnectionCapability;
  /** Multi-site administration. */
  multiSiteManagement: ConnectionCapability };
}
/** Existing publication envelope, with unchanged byte/identity semantics. */
export type PublishedSiteSnapshot = EaosCmsPublishedSnapshot;
/** A declarative record key recipe; no executable key functions cross the boundary. */
export type TemplateRecordIdentity = {
  /** Identity recipe discriminator. */
  kind: 'locale' | 'slug' | 'localized-slug' } | {
  /** Localized structured-field recipe. */
  kind: 'localized-data';
  /** Document-relative field path. */
  path: string[];
  /** Use the slug when the field is not a string. */
  fallback: 'slug' };
/** A media relationship path; `*` iterates arrays. Conditions select union branches. */
export interface TemplateMediaReference {
  /** Field path relative to the collection document. */
  path: string[];
  /** All conditions must match before collecting this relationship. */
  when?: {
  /** Document-relative condition path. */
  path: string[];
  /** Required scalar value. */
  equals: JsonPrimitive }[];
}
/** Generic collection metadata supplied by a trusted host template registry. */
export interface SiteTemplateCollection {
  /** Stable collection identifier. */
  id: string;
  /** Published record content type. */
  contentType: string;
  /** Supported JSON Schema profile, validated as data only. */
  schema: {
  /** A JSON property value. */
  [key: string]: JsonValue };
  /** How the template derives a record identifier. */
  recordIdentity: TemplateRecordIdentity;
  /** Explicit relationship paths; ordinary strings are not media IDs. */
  mediaReferencePaths: TemplateMediaReference[];
  /** Optional collection display name. */
  label?: string;
  /** Optional subset of template locales. */
  locales?: string[];
  /** Whether a host may offer rich text editing. */
  supportsRichText?: boolean;
  /** Whether the collection accepts media relationships. */
  supportsMedia?: boolean;
  /** Whether publication requires a body in addition to structured data. */
  bodyRequired?: boolean;
}
/** Versioned template data. Registration and use require host authorization. */
export interface SiteTemplateDescriptor {
  /** Supported wire contract version. */
  protocolVersion: 1;
  /** Template identifier, independent of a private plugin ID. */
  id: string;
  /** Immutable semantic template version. */
  version: string;
  /** Supported locale identifiers. */
  locales: string[];
  /** Bounded collection definitions. */
  collections: SiteTemplateCollection[];
  /** Shared publication media requirements enforced by the host. */
  mediaPolicy: {
  /** Locales whose alt text must be supplied on publication assets. */
  requiredAltLocales: string[] };
}
