---
title: "Use public Studio integrations"
description: "Use public Appkit contracts, a collection table and Cloudflare editing adapters without restricted Studio UI."
sidebar:
  order: 5
archetype: "how-to"
project: "sitekit"
tags: ["studio", "integration"]
---

# Use public Studio integrations

## Prerequisites

Use Node.js 24 or later. The optional React table requires React and React DOM
matching `^19.2.3`. Obtain the framework and Cloudflare artifacts from the same
verified source candidate. This repository's packages are local release candidates;
Appkit Core 0.2.1 / React 0.3.0 is published on npmjs.

```bash
bun add ./alneas-sitekit-0.2.0.tgz ./alneas-sitekit-cloudflare-0.2.0.tgz
bun add --exact --registry=https://registry.npmjs.org @alneas/appkit-core@0.2.1 @alneas/appkit-react@0.3.0 react@19.2.3 react-dom@19.2.3
```

For a server-only adapter, install just Appkit Core and the Cloudflare artifact
alongside the framework. The framework's React/Appkit React peers are optional.
Install package names; the subpaths below are import targets.

## Public import

| Feature | Published package subpath in the candidate |
| --- | --- |
| Basic management screen | `@alneas/sitekit/studio/basic` |
| Browser HTTP provider | `@alneas/sitekit/studio/http-provider` |
| Basic screen styles | `@alneas/sitekit/studio/basic.css` |
| Host Studio contracts | `@alneas/sitekit/studio/contracts` (types) |
| Access/body metadata conversion | `@alneas/sitekit/studio/content-metadata` |
| Optional collection table | `@alneas/sitekit/studio/collection-list` |
| D1 editing provider | `@alneas/sitekit-cloudflare/studio` |
| Editing HTTP handler | `@alneas/sitekit-cloudflare/studio-handler` |
| Upstream content contracts | `@alneas/appkit-core/data/content` (types) |
| Upstream table and stylesheet | `@alneas/appkit-react/tools/data-table`, `@alneas/appkit-react/styles` |

The full `./studio` UI barrel and `./site-studio` are excluded from the public
framework candidate. They still require restricted UI. The subpaths in this table
have separate exports and do not load that barrel.

## Step-by-Step Implementation

### 1. Mount the basic management screen

The public screen includes list/search, create, Markdown editing, draft save and
publish. It uses the public Appkit table and ordinary accessible form controls.
The full rich editor, integrated analytics, experiments and social publishing UI
remain outside the public candidate.

Import all styles once at the application boundary. Create a stable provider and
save the following component as `src/components/ContentAdmin.tsx`:

```tsx
import '@alneas/appkit-react/styles';
import '@alneas/sitekit/studio/basic.css';
import { BasicStudioApp } from '@alneas/sitekit/studio/basic';
import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';

const provider = createHttpStudioProvider();
export function ContentAdmin() {
  return <BasicStudioApp provider={provider} collections={[{ id: 'posts', label: '記事' }]} />;
}
```

For an Astro host, enable its React renderer before mounting the component. Run
this in the consuming Astro project and accept the integration's setup prompts:

```bash
bunx astro add react
```

The [official Astro React integration guide](https://docs.astro.build/en/guides/integrations-guide/react/)
describes installation and configuration. Preserve the host's existing integrations
and snapshot build configuration. Create `src/pages/admin.astro` with:

```astro
---
import { ContentAdmin } from '../components/ContentAdmin';
---
<html lang="en">
  <head><title>Content management</title></head>
  <body><ContentAdmin client:only="react" /></body>
</html>
```

The page mounts the client screen at `/admin`; it does not create or secure an API.
Mount the server handler from the next section at `/api/studio/content`, implement
its authentication/authorization callbacks, and apply the D1 schema explicitly.
The client uses same-origin cookie credentials. Custom session handling can be
provided through the client's `fetch` option; never put backend credentials in
client modules. Saving sends the document's previous `modifiedAt` for conflict
checking. Storage failures preserve the entered content for retry. Returning to
the list asks before discarding unsaved edits. Publish saves the current draft
first, so a newly created document can be published directly.

After installing the source candidate, run `bun scripts/public-consumer-smoke.mjs --preview` to launch the isolated tarball-based acceptance fixture at loopback.
It uses a temporary SQLite database implementing D1's statement interface and a
local fixture session. The seed, simulated error control and fixture session are
for local verification only; do not deploy this preview server as production auth.

### 2. Use a collection table separately

Import the stylesheet once at the application boundary. Use a browser bundler
supporting dynamic imports and React. No query or data-access provider is needed
by this table wrapper; the host supplies the items and handlers.

```tsx
import '@alneas/appkit-react/styles';
import { ReactToolsCollectionList } from '@alneas/sitekit/studio/collection-list';

export function ContentList() {
  return (
    <ReactToolsCollectionList
      items={[]}
      loading={false}
      onSelect={item => console.log(item.id)}
      onCreate={() => console.log('Create draft')}
      fallback={<p>Loading content…</p>}
    />
  );
}
```

The fallback appears during loading, server rendering or a failed optional table
load. Reuse the same compatible React runtime in the host and Appkit.

### 3. Connect D1 editing on the server

Supply the D1 binding, apply `contentStudioSchemaSql` from the Cloudflare root
entry to your selected database, and configure the host's authentication and
collection/tenant authorization before mounting an editing endpoint. Schema
application and persistence writes are explicit host operations.

This minimal example denies all requests until the host supplies its policy:

```typescript
import { createD1ContentStudioProvider } from '@alneas/sitekit-cloudflare/studio';
import { createContentStudioHandler } from '@alneas/sitekit-cloudflare/studio-handler';
import type { CloudflareD1Database } from '@alneas/sitekit-cloudflare';

export const handleStudio = createContentStudioHandler<{ DB: CloudflareD1Database }>({
  bindings: env => createD1ContentStudioProvider({ database: env.DB }),
  authorize: () => false,
});
```

Mount `handleStudio(request, env)` at `/api/studio/content`. The example returns
403 before touching the database. For a multi-tenant host, use authenticated
principal data to scope provider bindings and authorize both reads and writes;
never derive tenant access solely from request input. Keep D1 bindings and
credentials in server modules.

## Verification

Run the framework's `typecheck:all`, `test:all`, `verify:public` and `test:consumer`
commands in the generated candidate. The isolated consumer checks the new exports,
table fallback, a denied request, and create/update/publish using the actual schema in an isolated SQLite database. Test real editing
with a host-owned test database and authentication setup before enabling it.

## Troubleshooting / Common Pitfalls

A missing full Studio/editor export is an expected distribution boundary. The
public Core editor helpers do not supply the restricted BlockNote React editor.

For exact signatures and request/response contracts, see the [Studio API](../studio-api.md).
