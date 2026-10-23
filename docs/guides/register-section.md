---
title: "Register a Section"
description: "Add and verify a typed section plugin."
sidebar:
  order: 70
archetype: "how-to"
project: "sitekit"
tags: ["astro", "site-framework"]
---

# Register a Section

## Prerequisites

Node.js 24+, Bun 1.4.0, a locally packed public core candidate and an existing Astro project. Install the schema dependency explicitly:

```bash
bun add ./alneas-sitekit-0.2.0.tgz astro zod
```

## Public import

Use `@alneas/sitekit/sections`; install the package name, not that subpath.
This framework-free registry needs no React provider or stylesheet.

## Step-by-Step Implementation

### 1. Define and resolve a plugin

Save as `section.ts`. The schema and component use the same section data type.

```typescript
import { z } from 'zod';
import { createSectionRegistry, defineSectionPlugin } from '@alneas/sitekit/sections';

const greeting = defineSectionPlugin({
  type: 'greeting',
  schema: z.object({ type: z.literal('greeting'), title: z.string() }),
  component: ({ section }) => section.data.title,
});
const registry = createSectionRegistry([greeting]);
const result = await registry.resolve(
  { id: 'welcome', type: 'greeting', data: { type: 'greeting', title: 'Hello' } },
  { siteId: 'example', locale: 'en', pathname: '/', collectionItems: {} },
);
console.log(result); // Hello
```

### 2. Run the section

```bash
bun section.ts
```

## Verification

Expected output:

```text
Hello
```

This verifies registry resolution. An Astro renderer must consume the resolved value to display it on a page.

## Troubleshooting / Common Pitfalls

- Duplicate section names fail registration. Choose a unique plugin type.
- Unknown types fail resolution. Register the plugin before resolving content.
- Invalid data fails schema parsing. Keep the node type and schema literal consistent.
- Legacy names can use explicit registry aliases; the canonical plugin must already be registered.

See [architecture](../architecture.md) for the reason renderer-specific domain branches stay outside the registry.
