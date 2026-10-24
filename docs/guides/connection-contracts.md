---
title: "Connection and Template Contracts"
description: "Validate credential-free service metadata and portable template descriptors at a public boundary."
sidebar:
  order: 56
archetype: "reference"
project: "sitekit"
tags: ["contracts", "integration"]
---

# Connection and template contracts

`@alneas/sitekit/connection` supplies data-only connection metadata and portable
template descriptions. It does not connect an account, install a CMS, register a
template or authorize premium services. Every protected operation must check the
current authenticated actor, site and service entitlement on the server.

```ts
import { parseSiteConnection, parseSiteTemplateDescriptor } from '@alneas/sitekit/connection';
const off = { available: false, reason: 'not_configured' } as const;
const connection = parseSiteConnection({
  protocolVersion: 1, connectionId: 'c1', siteId: 'site1', status: 'disconnected',
  capabilities: { content: off, measurement: off, socialPublishing: off, multiSiteManagement: off },
});
const template = parseSiteTemplateDescriptor({
  protocolVersion: 1, id: 'basic', version: '1.0.0', locales: ['en'],
  collections: [{ id: 'pages', contentType: 'PAGE', schema: { type: 'object' },
    recordIdentity: { kind: 'localized-slug' }, mediaReferencePaths: [] }],
  mediaPolicy: { requiredAltLocales: [] },
});
```

Protocol version 1 rejects unknown versions, fields and capability names. Reasons
for unavailable capabilities are `subscription_required`, `not_configured`,
`forbidden` and `unavailable`. A disconnected or reauthorization-required connection
cannot advertise available operations. Capabilities are display hints, never access
tokens. No credentials or internal storage/plugin metadata belong in these objects.

`PublishedSiteSnapshot` aliases the existing `EaosCmsPublishedSnapshot` type. Use
`parsePublishedSnapshot` from `@alneas/sitekit/content` for its existing validation;
there is no new envelope, revision interpretation or snapshot hash algorithm.

Descriptors are limited to 256 KiB of UTF-8 JSON, 32 levels of JSON nesting,
32 collections and 16 locales. IDs/content types and locales must be unique;
collection and required-alt locales are subsets of the template locales. Runtime
functions, accessors, non-JSON objects, cycles, sparse arrays and prototype keys
are rejected. Template versions use SemVer and must be immutable in the host registry.
The parser returns detached data. It does not execute the schema.

The schema profile supports `type`, `properties`, `required`, `additionalProperties`,
`items`, `propertyNames`, `$defs`, local acyclic `$ref`, `oneOf`, `anyOf`, `allOf`,
`enum`, `const`, `default`, `title`, `description`, `pattern`, `format`, numeric bounds,
`multipleOf`, string/array/object length bounds and `uniqueItems`. Supported formats
are `date`, `date-time`, `uri`, `email`, `uuid`. Definitions and all referenced targets
must be schema objects. Remote references and unrecognized keywords are rejected.
Hosts still need a bounded schema evaluator to validate actual document values.

Explicit portable annotations are `x-ui` (string `label`, `group`, `width`,
`placeholder`, and a recognized `widget`) and boolean `x-date`. An `x-date` field
requires valid calendar-date semantics: interpret the value as a date and require
the UTC calendar date to match its first ten characters. A host interpreter must
implement this in addition to ordinary schema validation. Private database or
code-generation annotations are not accepted. Explicit `mediaReferencePaths`
replace implicit media annotations; ordinary string fields are never relationships.
A relationship path is an array of segments; `*` iterates an array. Optional `when`
conditions compare a document-relative path against a JSON scalar. All conditions
must match; wildcard conditions refer to the same array element as the path.

Record identity recipes are `locale`, `slug`, `localized-slug` (locale/slug), or
`localized-data` with a field path and `fallback: 'slug'`. These are declarations for
an authorized host to interpret, not executable callbacks. Optional collection
metadata includes label, locales, rich-text/media support and body requirement.
The descriptor must be registered by a trusted host, never taken from an arbitrary
browser request as authority. Subscription and authorization enforcement belong to
the service receiving operations, regardless of source-code visibility.
