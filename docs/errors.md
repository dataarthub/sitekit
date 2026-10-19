---
title: "SiteKit Error Codes"
description: "Stable codes, corrective actions and boundaries for configuration, snapshot and image build failures."
sidebar:
  order: 13
archetype: "reference"
project: "sitekit"
tags: ["errors", "reference"]
---

# SiteKit Error Codes

## Public import

Use `SiteKitError` and `SiteKitErrorCode` from `@alneas/sitekit/errors`. The class also appears in the root export. It requires no React provider or CSS. Content-file and build APIs remain Node-only; the error class itself performs no I/O.

## [CLASS] SiteKitError

Carries a stable code, corrective hint and public documentation link while remaining an ordinary `Error`.

### Signature

```typescript
import type { SiteKitErrorCode } from '@alneas/sitekit/errors';
declare class SiteKitError extends Error {
  readonly name: "SiteKitError";
  readonly code: SiteKitErrorCode;
  readonly hint: string;
  readonly docs: string;
  constructor(code: SiteKitErrorCode, message: string, options?: ErrorOptions);
}
```

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| code | SiteKitErrorCode | Yes | One of the identifiers below; selects its hint and documentation anchor. |
| message | string | Yes | Failure context without credentials or sensitive payloads. |
| options.cause | unknown | No | Underlying failure, retained using standard Error cause semantics. |

### Result

Construction creates an Error whose `name` is `SiteKitError`. Its `message` includes `[code]`, context, hint and the `docs` URL. Match `code`, not message wording. `cause` may contain transport details or local paths; do not return it verbatim to browser clients or public logs. The class does not retry or authorize operations.

### Example

```typescript
import { defineSite } from '@alneas/sitekit/config';
import { SiteKitError } from '@alneas/sitekit/errors';
try {
  defineSite({ id: '', content: { file: './snapshot.json' } });
} catch (error) {
  if (error instanceof SiteKitError) console.error(error.code, error.hint, error.docs);
  else throw error;
}
```

## Codes and corrective actions

### SK_CONFIG_INVALID

A configuration has an empty/invalid ID, ambiguous content sources, unsupported endpoint/method or invalid revision. Supply one content source and a positive safe integer revision when present. Use credential-free HTTPS, or loopback HTTP for local development. The snapshot reader also rejects endpoint query strings and fragments. See [configuration](api.md).

### SK_CONTENT_MISSING

The build did not obtain a publication. Configure an inline snapshot, file or endpoint. Do not silently substitute another publication. An unconfigured standalone snapshot reader still returns `null`; the build requires content.

### SK_CONTENT_READ_FAILED

The snapshot file cannot be read, or an HTTP request/body read fails, times out, redirects or returns a non-success status. Check the source and build-only credentials. Native I/O/transport failures remain available as `cause` when present. A failed reader keeps the rejected promise and does not refetch a newer publication automatically; create a new reader for an intentional retry.

### SK_SNAPSHOT_INVALID

Serialization, JSON syntax, publication validation, the 8 MiB serialized limit or local draft-preview requirements fail. Correct the publication payload; `cause` retains parse/validation errors when present. Draft previews require explicit local-file preview mode and an unexpired draft marker. Do not disable validation or authorize previews from arbitrary HTTP inputs.

### SK_SITE_ID_MISMATCH

The publication belongs to a different site. Select the intended source. Do not bypass the identity check to render foreign content.

### SK_REVISION_MISMATCH

The publication revision differs from the configured expected revision. Select that pinned publication, or intentionally update the expected revision as part of a reviewed content change. This is not a request to retry until a different revision passes.

### SK_IMAGE_INVALID

Image metadata contains an unsafe/malformed URL, unsupported MIME type or conflicting hashes for one URL. Correct the publication metadata. Malformed snapshot hash fields may instead fail earlier with `SK_SNAPSHOT_INVALID`.

### SK_IMAGE_HASH_MISSING

A verified build requires missing image hashes. Publish SHA-256 hashes with the publication. Legacy compatibility remains explicit and does not bypass supplied hashes or a publication declaring SHA-256 integrity.

### SK_IMAGE_HASH_MISMATCH

Downloaded bytes do not match the publication's hash. Fix the bytes and hash together, then build that intended revision. Do not disable integrity checks.

### SK_IMAGE_FETCH_FAILED

An image request or streamed body fails, redirects, times out, returns a non-success status or has no body. Check image availability and host access. CMS authentication headers are not forwarded to media origins.

### SK_IMAGE_TOO_LARGE

An image declares or streams more than 25 MiB. Resize/re-encode the source and republish matching hashes.

## Coverage and compatibility

These codes cover failures owned by `defineSite`, the snapshot reader used by `createSiteAstroConfig`, and its image-verification step. Direct DTO parsers, storage adapters, Studio HTTP responses and Astro's own failures are outside this initial code set. Host source/configuration callbacks propagate their original errors unchanged; not every failure is a `SiteKitError`. Existing `instanceof Error` handling and diagnostic message substrings remain useful, but exact message text is not a stable API.

Use the [JSON Schema guide](guides/site-schema.md) for editor-time shape checking and the [content-source guide](guides/content-sources.md) for runtime source selection.
