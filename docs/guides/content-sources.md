---
title: "Build from Independent or Managed Content"
description: "Use one snapshot build contract with local files or an EAOS-managed or independent CMS endpoint."
sidebar:
  order: 30
archetype: "how-to"
project: "sitekit"
tags: ["snapshot", "build", "cms"]
---

# Build from independent or managed content

## Prerequisites

A site using Astro 7.3.3 or later within major 7, the core package, and a public snapshot matching the [configuration API](../api.md). This guide targets the 0.2.0 release candidate; the published 0.1.0 package does not include all APIs shown here. Confirm 0.2.0 registry availability before adoption. For local verification, use the [source verification guide](verify-source.md).

## Public import

Use `@alneas/sitekit/config` and `@alneas/sitekit/build` from the core package. These are Node/Astro build entry points; they do not run in the browser. The following examples include both imports.

## Step-by-Step Implementation

### Independent site

Keep your own repository. In astro.config.mjs, pass exactly one snapshot source: an in-memory snapshot, a local snapshot file, or an HTTP endpoint.

```javascript
import { defineSite } from '@alneas/sitekit/config';
import { createSiteAstroConfig } from '@alneas/sitekit/build';
import { fileURLToPath } from 'node:url';

export default await createSiteAstroConfig(defineSite({
  id: 'example',
  revision: 1,
  content: { file: fileURLToPath(new URL('./snapshot.json', import.meta.url)) },
}), ({ snapshot }) => ({
  site: 'https://example.com',
  vite: { define: { __SITE_SNAPSHOT__: JSON.stringify(snapshot) } },
}));
```

Add ordinary Astro pages that render the pinned snapshot. No EAOS account, API credentials or Cloudflare bindings are required for a file build.

### Managed site or independent CMS

Use the same build function with an HTTP source. The endpoint must provide one pinned public revision; the builder rejects mismatched site identity or revision.

```javascript
import { defineSite } from '@alneas/sitekit/config';
import { createSiteAstroConfig } from '@alneas/sitekit/build';

export default await createSiteAstroConfig(defineSite({
  id: 'example', revision: 1,
  content: { endpoint: process.env.SITE_SNAPSHOT_URL, method: 'GET' },
}), ({ snapshot }) => ({
  site: 'https://example.com',
  vite: { define: { __SITE_SNAPSHOT__: JSON.stringify(snapshot) } },
}), {
  headers: process.env.SITE_BUILD_TOKEN
    ? { Authorization: 'Bearer ' + process.env.SITE_BUILD_TOKEN }
    : {},
});
```

Configure SITE_SNAPSHOT_URL and, only when required by your host, SITE_BUILD_TOKEN as build secrets. A service requiring POST may use method:'POST'. Credentials are build options, never snapshot content or browser configuration. Do not put private drafts or secrets into the public snapshot; the example deliberately embeds its public content in the generated site.

EAOS-managed sites may share one execution repository and use registered site settings, package versions and Deploy Hooks. Independent sites own their repository and deployment pipeline. The core build API stays the same. D1/R2 or ADB/OCI are upstream CMS/storage choices; the builder reads HTTP snapshots and verifies image bytes instead of requiring database bindings.

## Verification

The basic example verifies actual Astro output from a file and an HTTP source. `bun run test:site-build` also checks inline input, fixed revision and image SHA-256 verification. Hash mismatches, unavailable inputs and inconsistent revisions fail the build instead of selecting a different publication.

Private templates consume this public API through normal package dependencies. Deployment receipts and host admission remain host responsibilities; switching package names alone does not deploy or republish an existing site.

## Troubleshooting / Common Pitfalls

- A site ID or revision mismatch means the endpoint is not serving the expected publication; fix the source selection.
- Images need valid hashes and stable bytes. Do not disable verification to hide a failed fetch.
- CMS credentials belong only to the CMS request. They are not forwarded to external image URLs.
- Keep existing applications on their accepted package version until their own regression and deployment acceptance are complete.
