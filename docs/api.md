---
title: "Site Configuration API"
description: "Configuration and build configuration entry points."
sidebar:
  order: 40
archetype: "reference"
project: "sitekit"
tags: ["astro", "site-framework"]
---

## [FUNCTION] defineSite

Validates a site identity and exactly one content source.

### Signature

```typescript
import type { SiteDefinition } from '@alneas/sitekit/config';

declare function defineSite(input: SiteDefinition): SiteDefinition;
```

### Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| input | SiteDefinition | Yes | Strict object containing id, optional revision, and content. |
| input.id | string | Yes | Nonempty string; trimmed by validation. |
| input.revision | number | No | Positive integer accepted by the schema. |
| input.content | { snapshot: unknown } \| { file: string; draftPreview?: boolean } \| { endpoint: string; method?: "GET" \| "POST" } | Yes | Exactly one source; file and endpoint must be nonempty. |

### Returns

`SiteDefinition` — the parsed configuration. Snapshot DTO validation occurs when the build loads content.

### Errors

Throws `SiteKitError` with code `SK_CONFIG_INVALID` for invalid configuration, extra fields or multiple sources. Endpoints require HTTPS; HTTP is allowed on loopback hosts. URL credentials are rejected. `draftPreview` applies only to files. Credentials belong in build options.

### Example

```typescript
import { defineSite } from '@alneas/sitekit/config';

const site = defineSite({
  id: 'example',
  revision: 1,
  content: { snapshot: { siteId: 'example', revision: 1, posts: [], assets: [] } },
});
console.log(site.id, site.revision); // example 1
```

## [FUNCTION] createSiteAstroConfig

Loads one publication, validates its identity and pins its images before configuring Astro.

### Signature

```typescript
import type { AstroUserConfig } from 'astro';
import type { SiteDefinition } from '@alneas/sitekit/config';
import type { SiteAstroConfigFactory, SiteBuildOptions } from '@alneas/sitekit/build';

declare function createSiteAstroConfig(
  input: SiteDefinition,
  configure: SiteAstroConfigFactory,
  options?: SiteBuildOptions,
): Promise<AstroUserConfig>;
```

### Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| input | SiteDefinition | Yes | Site definition and optional expected revision. |
| configure | SiteAstroConfigFactory | Yes | Receives site, render snapshot and original publication; returns Astro configuration. |
| options.fetch | typeof fetch | No | Custom content and image fetch implementation. |
| options.headers | Record<string, string> | No | Build-only content request headers; never forwarded to image origins. |
| options.allowUnhashedImages | boolean | No | Migration compatibility; omitted by default. Does not bypass supplied hash checks. |

### Returns

`Promise<AstroUserConfig>` — static output by default, merged with the factory result and any image-pinning integration.

### Errors

Rejects missing or invalid content, site/revision mismatch, image retrieval failures and missing or mismatched image hashes. A snapshot declaring `imageIntegrity: "sha256"` rejects missing hashes even in compatibility mode. The factory receives a deeply frozen snapshot; `publication` preserves original image references for receipts. This function configures Astro; it does not run a build.

### Example

```typescript
import { defineSite } from '@alneas/sitekit/config';
import { createSiteAstroConfig } from '@alneas/sitekit/build';

const site = defineSite({
  id: 'example', revision: 1,
  content: { snapshot: { siteId: 'example', revision: 1, posts: [], assets: [] } },
});
const config = await createSiteAstroConfig(site, ({ snapshot }) => ({
  site: 'https://example.com',
  vite: { define: { PUBLIC_REVISION: JSON.stringify(snapshot.revision) } },
}));
console.log(config.output); // static
```

Configuration shape validation is available through the [JSON Schema data export](guides/site-schema.md). Runtime failures are documented in [error codes](errors.md); host callback errors are not reclassified.
