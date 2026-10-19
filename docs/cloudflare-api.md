---
title: "Cloudflare Manifest API"
description: "Validation contract for Cloudflare snapshot manifests."
sidebar:
  order: 50
archetype: "reference"
project: "sitekit"
tags: ["astro", "site-framework"]
---

## [FUNCTION] parseCloudflareSnapshotManifest

Parses the structural fields of a snapshot manifest.

### Signature

```typescript
import type { SiteSnapshotManifest } from '@alneas/sitekit';

declare function parseCloudflareSnapshotManifest(value: unknown): SiteSnapshotManifest;
```

### Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| value | unknown | Yes | Object to parse. |
| value.schemaVersion, value.siteId, value.revision | string | Yes | Nonempty strings. |
| value.generatedAt, value.contentVersion, value.mediaVersion, value.checksum | string | Yes | Nonempty strings; date and checksum formats are not checked here. |
| value.locales | string[] | Yes | Array of nonempty strings; an empty array is accepted. |
| value.signature | { algorithm: "hmac-sha256" \| "ed25519"; keyId: string; value: string } | No | Algorithm plus nonempty key identifier and signature value. |

### Returns

`SiteSnapshotManifest` — a new object containing recognized fields. Unrecognized fields are omitted.

### Errors and limits

Throws `Error` for invalid required fields or signature structure. This parser does not verify payload checksums, cryptographic signatures, supported schema versions or revision equality. Projection staging performs payload integrity checks separately. The example checksum is a structural placeholder and must not be used for staging.

### Example

```typescript
import { parseCloudflareSnapshotManifest } from '@alneas/sitekit-cloudflare';

const manifest = parseCloudflareSnapshotManifest({
  schemaVersion: '1', siteId: 'example', revision: 'cms-1',
  generatedAt: '2026-01-01T00:00:00Z',
  contentVersion: 'cms-1', mediaVersion: 'cms-1',
  checksum: 'example-checksum', locales: ['en', 'ja'],
});
console.log(manifest.revision); // cms-1
```
