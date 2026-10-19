---
title: "Validate Site Configuration with JSON Schema"
description: "Use the packaged defineSite input schema in editors and validators while retaining runtime security and snapshot checks."
sidebar:
  order: 7
archetype: "how-to"
project: "sitekit"
tags: ["configuration", "schema"]
---

# Validate Site Configuration with JSON Schema

## Prerequisites

Use the core package and Node.js 24 or later. Initial registry publication is pending; obtain the verified artifact using the [source guide](verify-source.md). JSON Schema is an optional editor/validator aid; the runtime continues to validate settings with `defineSite`.

## Public import

The schema is a data export at `@alneas/sitekit/schema.json`, generated from the same Zod definition used by `@alneas/sitekit/config`. It requires no React runtime, provider or CSS. Schema generation uses repository tooling; consumers do not need Bun or Zod to read the JSON file.

## Step-by-Step Implementation

### 1. Associate a JSON configuration file in your editor

For an editor supporting VS Code's JSON settings, add this association to `.vscode/settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["site.config.json"],
      "url": "./node_modules/@alneas/sitekit/schema/site.schema.json"
    }
  ]
}
```

Adjust the file location for your package manager. Do not add a `$schema` property to the site configuration itself: the runtime configuration is strict and does not accept extra fields.

### 2. Describe exactly one content source

Save as `site.config.json`:

```json
{
  "id": "example",
  "revision": 1,
  "content": { "file": "./snapshot.json" }
}
```

Use exactly one `snapshot`, `file` or `endpoint` property under `content`. The file branch alone permits `draftPreview`; the endpoint branch alone permits `method: "GET" | "POST"`.

### 3. Keep runtime validation authoritative

In an Astro configuration, use the public runtime entry point as usual:

```typescript
import { defineSite } from '@alneas/sitekit/config';
const site = defineSite({ id: 'example', revision: 1, content: { file: './snapshot.json' } });
console.log(site.id);
```

The JSON Schema uses draft 2020-12 and Zod's **input** shape. It describes required fields, mutually exclusive source branches, positive safe-integer revisions, URI format and rejection of extra properties. Configure your validator's URI-format support; not every JSON Schema implementation enforces formats by default.

JSON Schema does not execute Zod's custom refinements or normalize strings. A whitespace-only ID/file or a URI containing credentials or an unsupported scheme can pass shape validation and still fail `defineSite`. The snapshot reader additionally checks publication contents, site identity/revision, query/fragment restrictions and draft-preview permission. Inline `snapshot` is intentionally unconstrained in this configuration schema and is validated only when read. Passing the schema is not proof of authorization, integrity or build success.

## Verification

After installing the package, verify the exported data with Node:

```bash
node --input-type=module -e 'import schema from "@alneas/sitekit/schema.json" with { type: "json" }; console.log(schema.title)'
```

Expected output: `SiteKit site configuration`. The repository's tests exercise the generated schema using an independent draft-2020-12 validator, compare accepted/rejected shapes with runtime validation and explicitly test the documented refinement differences. `docs:generated` regenerates the schema into temporary storage and fails on drift; `docs:prepare` explicitly refreshes normal generated output.

## Troubleshooting / Common Pitfalls

- Missing schema export: inspect the installed artifact/version and its `exports`; do not point an editor at a sibling source checkout.
- Both `file` and `endpoint`: choose one source; no fallback selection is implied.
- Schema passes but the build fails: apply runtime URL, publication, access and image-integrity checks. Consult the [error code reference](../errors.md).
- Modified generated schema: update the canonical Zod definition and generator, regenerate explicitly, then rerun tests and freshness checks. Do not repair the generated JSON by hand.
