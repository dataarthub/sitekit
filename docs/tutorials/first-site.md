---
title: "Your First Site Configuration"
description: "Validate an in-memory site configuration in under ten minutes."
sidebar:
  order: 80
archetype: "tutorial"
project: "sitekit"
tags: ["astro", "site-framework"]
---

# Your First Site Configuration

In about five minutes, validate a site configuration without a CMS or deployment. Use Node.js 24+, Bun 1.4.0 and the locally packed public core artifact from a verified source candidate. These examples target 0.2.0; confirm registry availability before using versioned npm dependencies. Examples use fictional identifiers and reserved example domains.

## Public import

Configuration uses `@alneas/sitekit/config`. It needs no React runtime, provider or CSS. The installation below installs the package artifact; `/config` is an import target.

## 1. Create a project

```bash
mkdir site-demo
cd site-demo
bun init -y
```

Expected result: Bun creates `package.json` and the starter project files.

## 2. Install the framework

Place the packed core artifact beside the new `site-demo` directory, then run:

```bash
bun add ../alneas-sitekit-0.2.0.tgz astro
```

Expected result: Bun reports both packages installed and writes the lockfile.

## 3. Save the configuration

Create `example.ts` with this content:

```typescript
import { defineSite } from '@alneas/sitekit/config';

const site = defineSite({
  id: 'example',
  revision: 1,
  content: { snapshot: { siteId: 'example', revision: 1, posts: [], assets: [] } },
});
console.log(site.id, site.revision); // example 1
```

Expected result: `example.ts` contains the inline snapshot and matching site identity.

## 4. Run it

```bash
bun example.ts
```

Expected output:

```text
example 1
```

You now have a validated site configuration. This exercise validates configuration only; rendering pages requires Astro pages and the build entry point documented in the [API reference](../api.md).
