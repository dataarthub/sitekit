---
title: "Public Exports and Runtime Constraints"
description: "Package names, approved import subpaths, runtime requirements and source-candidate availability."
sidebar:
  order: 10
archetype: "reference"
project: "sitekit"
tags: ["exports", "reference"]
---

# Public Exports and Runtime Constraints

## Distribution status

The 0.2.0 packages are published. This page targets the 0.2.1 release candidates; confirm their registry availability before adoption. The core and Cloudflare source candidates use the package names shown below; install their packed artifacts from the same verified candidate. `@alneas/appkit-core@0.2.2` and `@alneas/appkit-react@0.3.1` are public npmjs dependencies. A package subpath is an import target, not a separately installable package.

```bash
bun add ./alneas-sitekit-0.2.1.tgz ./alneas-sitekit-cloudflare-0.2.1.tgz astro
```

## Core package

Package: `@alneas/sitekit`. The table is restricted to the approved public extraction surface; exports of the original full distribution outside this table are not public candidate imports.

| Import subpath | Runtime / role |
| --- | --- |
| `@alneas/sitekit` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/config` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/build` | Node.js 24+ build/server helper; exclude from browser entrypoints. |
| `@alneas/sitekit/contracts` | Type contracts; use type-only imports when appropriate. |
| `@alneas/sitekit/sections` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/search` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/analytics` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/marketing` | Shared measurement DTOs, validation and CSV parsing; resolve provider factories only on the server. |
| `@alneas/sitekit/access` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/ai` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/commerce` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/commerce/stripe` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/compat` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/content` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/media` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/i18n` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/outputs` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/projection` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/runtime` | Optional feature contract/helper; consult source JSDoc for per-function runtime and side effects. |
| `@alneas/sitekit/analytics/consent.css` | Stylesheet; import once at the corresponding browser boundary. |
| `@alneas/sitekit/content/cms-loader` | Node.js 24+ build/server helper; exclude from browser entrypoints. |
| `@alneas/sitekit/studio/contracts` | Type contracts; use type-only imports when appropriate. |
| `@alneas/sitekit/studio/content-metadata` | Portable metadata conversion; does not authorize content access. |
| `@alneas/sitekit/studio/collection-list` | React client UI; React/React DOM ^19.2.3 and public Appkit styles. |
| `@alneas/sitekit/studio/basic` | React client UI; React/React DOM ^19.2.3 and public Appkit styles. |
| `@alneas/sitekit/studio/http-provider` | Browser same-origin HTTP bridge; server authentication is required. |
| `@alneas/sitekit/studio/basic.css` | Stylesheet; import once at the corresponding browser boundary. |
| `@alneas/sitekit/errors` | Stable configuration/build error codes and ordinary Error compatibility. |
| `@alneas/sitekit/schema.json` | Generated draft-2020-12 configuration input schema; runtime refinements still apply. |

## Cloudflare package

Package: `@alneas/sitekit-cloudflare`. Bindings and provider SDKs remain on the server.

| Import subpath | Role |
| --- | --- |
| `@alneas/sitekit-cloudflare` | Public adapter exports and schema provisioning contracts. |
| `@alneas/sitekit-cloudflare/studio` | Explicit adapter entry; configure host bindings and authorization as appropriate. |
| `@alneas/sitekit-cloudflare/studio-handler` | Explicit adapter entry; configure host bindings and authorization as appropriate. |
| `@alneas/sitekit-cloudflare/integrations` | Explicit adapter entry; configure host bindings and authorization as appropriate. |
| `@alneas/sitekit-cloudflare/media-library` | Explicit adapter entry; configure host bindings and authorization as appropriate. |
| `@alneas/sitekit-cloudflare/experiments` | Explicit adapter entry; configure host bindings and authorization as appropriate. |
| `@alneas/sitekit-cloudflare/sns-outbox` | Explicit adapter entry; configure host bindings and authorization as appropriate. |
| `@alneas/sitekit-cloudflare/analytics-sinks` | Explicit adapter entry; configure host bindings and authorization as appropriate. |
| `@alneas/sitekit-cloudflare/marketing` | Standalone D1 measurement, protected routes and HMAC integration authorization; server only. |

## Peers, styles and providers

| Feature | Requirements |
| --- | --- |
| Core configuration/build | Node.js 24+, Astro peer, Bun for the documented candidate scripts. |
| Basic React screen | React and React DOM ^19.2.3, public Appkit React 0.3.1; one compatible React instance. |
| Basic screen styling | `@alneas/appkit-react/styles` and core `/studio/basic.css`. |
| Standalone collection table | Public Appkit stylesheet; no query/data-access provider needed. |
| HTTP editing | Stable `StudioProvider`, same-origin endpoint and a server-enforced authentication/authorization policy. |
| D1 editing | Public Appkit Core 0.2.2 types, provisioned `contentStudioSchemaSql`, server D1 binding. |
| Other adapters | Host-supplied D1/R2, HTTP clients, payment verifiers or event sinks described by the selected API. |

## Exclusions

The full `/studio` barrel, `/site-studio`, restricted editor, domain templates/themes and Platform/operator integrations are outside this public surface. Source availability alone does not establish an exported or published path. Advanced capabilities are separate [extension boundaries](extensions.md).

See the [site API](api.md), [manifest API](cloudflare-api.md), [Studio API](studio-api.md) and [integration guide](guides/public-studio.md). Detailed function/type descriptions live in source JSDoc for the portal's downstream API extraction; this project does not maintain a second portal renderer.

## Connection contracts

`@alneas/sitekit/connection` exports credential-free connection metadata,
portable template descriptors and their runtime parsers. See
[Connection and template contracts](guides/connection-contracts.md).

The `@alneas/sitekit/management` entry supplies credential-free settings contracts, strict parsers and the shared save/apply policy over host-owned persistence and authorization. See [shared management settings](guides/management-settings.md).

Shared management surfaces: `@alneas/sitekit/management/http`, `@alneas/sitekit/management/react`, `@alneas/sitekit/management/styles.css`, and `@alneas/sitekit-cloudflare/management`. See [Embed the Shared Management Console](guides/management-console.md).
