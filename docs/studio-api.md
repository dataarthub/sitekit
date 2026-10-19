---
title: "Studio API"
description: "Public basic management, HTTP client, persistence and editing endpoint contracts."
sidebar:
  order: 12
archetype: "reference"
project: "sitekit"
tags: ["studio", "api"]
---

# Studio API

## Public import

Install package names as described in the [integration guide](guides/public-studio.md). The table in [public exports](exports.md) is the supported import surface. Node.js 24+ is required; React UI requires React/React DOM `^19.2.3` and both `@alneas/appkit-react/styles` and `/studio/basic.css`. HTTP clients run in the browser; D1 bindings and authorization stay on the server.

## [FUNCTION] BasicStudioApp

Renders list/search, Markdown editing, draft saving and publishing through a host provider.

```typescript
import type { JSX } from 'react';
import type { BasicStudioAppProps } from '@alneas/sitekit/studio/basic';
declare function BasicStudioApp(props: BasicStudioAppProps): JSX.Element;
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| props.provider | StudioProvider | Yes | Stable host adapter implementing list/get/saveDraft/publish. |
| props.collections | readonly StudioCollectionDefinition[] | Yes | Host-selected collection IDs, labels and optional draft factories. |
| props.initialCollection | string | No | Selected collection; defaults to the first. |
| props.initialLocale | string | No | Defaults to `ja`; built-in selector exposes `ja` and `en`. |
| props.title | string | No | Defaults to `Content Studio`. |
| props.renderBodyEditor | (props: StudioBodyEditorProps) => ReactNode | No | Replaces the default Markdown textarea. |
| props.renderCollectionList | (props: StudioCollectionListProps) => ReactNode | No | Fallback while Appkit table loading/failure is active. |
| props.renderMetadataEditor | (props: StudioMetadataEditorProps) => ReactNode | No | Replaces title/slug/summary/tag fields. |

**Returns:** a React element. Provider work starts on the client. The screen catches listing/open/save/publish errors and keeps entered content when saving fails. Publish saves the current draft first. This is basic management, without rendering previews, deletion, media picking or revision history.

```tsx
import '@alneas/appkit-react/styles';
import '@alneas/sitekit/studio/basic.css';
import { BasicStudioApp } from '@alneas/sitekit/studio/basic';
import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';
const provider = createHttpStudioProvider();
export function Admin() {
  return <BasicStudioApp provider={provider} collections={[{ id: 'posts', label: 'Posts' }]} />;
}
```

## [FUNCTION] createHttpStudioProvider

Creates a same-origin browser adapter for the editing endpoint.

```typescript
import type { HttpStudioProviderOptions } from '@alneas/sitekit/studio/http-provider';
import type { StudioProvider } from '@alneas/sitekit/studio/contracts';
declare function createHttpStudioProvider(options?: HttpStudioProviderOptions): StudioProvider;
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| options.endpoint | string | No | Defaults to `/api/studio/content`; requires a same-origin absolute path without query/fragment/backslash. |
| options.fetch | typeof fetch | No | Custom authenticated fetch wrapper. |

**Returns:** a `StudioProvider` implementing list/get/saveDraft/publish, with `credentials: 'same-origin'` and `cache: 'no-store'`. Non-2xx, network and JSON errors reject. Unsupported advanced methods are absent. Construction rejects an invalid endpoint.

```typescript
import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';
const provider = createHttpStudioProvider();
// Run from an authenticated browser with a mounted editing handler.
const page = await provider.list({ collection: 'posts', locale: 'en' });
console.log(page.items.length);
```

## [FUNCTION] createD1ContentStudioProvider

Creates a D1 authoring adapter for the shared public content contract.

```typescript
import type { ContentStudioProvider } from '@alneas/appkit-core/data/content';
import type { D1ContentStudioProviderOptions } from '@alneas/sitekit-cloudflare/studio';
declare function createD1ContentStudioProvider(options: D1ContentStudioProviderOptions): ContentStudioProvider;
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| options.database | CloudflareD1Database | Yes | Server-only D1 binding; apply `contentStudioSchemaSql` explicitly. |
| options.table | string | No | Defaults to `content_items`; identifier validation is applied. |
| options.tenantField | string | No | Optional tenant column name. |
| options.tenantId | string | No | Enables scoping only when paired with tenantField. |

**Returns:** a provider with list/get/saveDraft/publish. List limits are clamped to 1–100 with cursor pagination. Draft saves write `draft` state; `expectedModifiedAt` is a pre-write check, not an atomic compare-and-swap. Publish marks `published`, or `scheduled` when requested; no scheduler or deployment runs here. Database failures reject.

```typescript
import { createD1ContentStudioProvider } from '@alneas/sitekit-cloudflare/studio';
import type { CloudflareD1Database } from '@alneas/sitekit-cloudflare';
export function connect(database: CloudflareD1Database) {
  return createD1ContentStudioProvider({ database });
}
```

## [FUNCTION] createContentStudioHandler

Creates the server request handler with host-injected authentication, authorization and bindings.

```typescript
import type { ContentStudioHandler, ContentStudioHandlerOptions } from '@alneas/sitekit-cloudflare/studio-handler';
declare function createContentStudioHandler<TEnv>(options: ContentStudioHandlerOptions<TEnv>): ContentStudioHandler<TEnv>;
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| options.bindings | (env, principal?) => ContentStudioProvider | Yes | Resolves a provider after authorization. |
| options.authorize | (context) => boolean \| Promise<boolean> | Yes | Must return exactly true for access; distinguish read/write and enforce tenant/collection rules. |
| options.authenticate | (context) => principal \| null \| Promise<principal \| null> | No | When supplied, a missing principal produces 401. |
| options.path | string | No | Defaults to `/api/studio/content`. |
| options.maxRequestBytes | number | No | Defaults to 256 KiB, including streamed POST bodies. |
| options.allowedOrigins | readonly string[] | No | Explicit CORS origins. An empty list does not supply authentication or a CSRF policy. |

**Returns:** `(request, env) => Promise<Response>`. The example denies all access until a host policy is connected. `ContentStudioPrincipal` contains subject, tenantId and roles; the handler does not verify credentials itself.

```typescript
import { createContentStudioHandler } from '@alneas/sitekit-cloudflare/studio-handler';
import { createD1ContentStudioProvider } from '@alneas/sitekit-cloudflare/studio';
import type { CloudflareD1Database } from '@alneas/sitekit-cloudflare';
export const handle = createContentStudioHandler<{ DB: CloudflareD1Database }>({
  bindings: env => createD1ContentStudioProvider({ database: env.DB }),
  authorize: () => false,
});
```

## [GET] /api/studio/content

Lists collection documents, or loads one document when `id` is supplied.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| id | string | No | Returns `{ document }`, where document may be null. |
| collection | string | Yes for listing | Collection identifier. |
| locale, search, status | string | No | Provider filters; status supports draft/scheduled/published/archived/all. |
| limit | number | No | Integer from 1 to 100; the handler rejects values outside that range. |
| cursor | string | No | Opaque cursor returned by the provider. |

**Returns:** 200 with `{ items, nextCursor? }` or `{ document }`. See the HTTP client example above for a complete public call.

## [POST] /api/studio/content

Saves a draft or changes a document's publish state.

| Body property | Type | Required | Description |
| --- | --- | --- | --- |
| operation | "saveDraft" \| "publish" | Yes | Selects the operation. |
| document | ContentStudioDocument | For saveDraft | Collection, locale, slug, title, body, tags and data; an empty summary is accepted. |
| documentId | string | For publish | Assigned document identifier. |
| options | save/publish options | No | expectedModifiedAt/reason or scheduledAt/reason. |

**Returns:** 200 with `{ document }`. Errors: 400 invalid input/operation, 401 missing authentication, 403 denied access/origin, 404 wrong path, 405 wrong method, 413 oversized body, 500 provider failure. A stale-draft provider rejection is currently a provider failure, not a dedicated 409 conflict response.

```typescript
import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';
const provider = createHttpStudioProvider();
const saved = await provider.saveDraft({ id: '', collection: 'posts', locale: 'en',
  slug: 'hello', title: 'Hello', body: '# Hello', summary: '', tags: [], data: {} });
console.log((await provider.publish(saved.id)).status);
```

## [INTERFACE] StudioProvider

The host management boundary; import it from `/studio/contracts`.

```typescript
import type { ContentItem, MediaAsset } from '@alneas/sitekit/contracts';
import type { StudioListQuery, StudioListResult, StudioSaveOptions, StudioPublishOptions, StudioRevision } from '@alneas/sitekit/studio/contracts';
interface StudioProvider {
  list(query: StudioListQuery): Promise<StudioListResult>;
  get(documentId: string): Promise<ContentItem | null>;
  saveDraft(document: ContentItem, options?: StudioSaveOptions): Promise<ContentItem>;
  publish(documentId: string, options?: StudioPublishOptions): Promise<ContentItem>;
  listRevisions?(documentId: string): Promise<StudioRevision[]>;
  listMedia?(query?: { search?: string; limit?: number }): Promise<MediaAsset[]>;
}
```

**Parameters/returns:** each method receives the query or document shown in the signature and resolves its declared result. Optional history/media methods are extension points; the basic screen does not call them. The public HTTP client is a self-contained implementation example above.

Metadata conversion helpers and the optional collection-table entry are documented in source JSDoc at their [public imports](exports.md). Generated API presentation belongs to the downstream portal; source signatures and examples remain canonical here.
