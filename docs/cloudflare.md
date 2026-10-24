---
title: "SiteKit Cloudflare Adapters"
description: "Public D1/R2 projections, basic editing and event adapters."
sidebar:
  order: 2
archetype: "explanation"
project: "sitekit"
tags: ["astro", "overview"]
---

<!-- Generated from packages/cloudflare/README.md; edit that README and run bun run docs:prepare. -->

# SiteKit Cloudflare Adapters

[English](https://github.com/dataarthub/sitekit/blob/main/packages/cloudflare/README.md) | [日本語](https://github.com/dataarthub/sitekit/blob/main/packages/cloudflare/README.ja.md)

[![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&style=flat)](https://www.typescriptlang.org/) [![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-green?logo=nodedotjs&style=flat)](https://nodejs.org/) [![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-orange?logo=cloudflare&style=flat)](https://developers.cloudflare.com/d1/)

## Elevator Pitch

Site developers use these adapters to connect the framework's public site and editing contracts to Cloudflare storage and event services.

## Why & Value Proposition

Keep Cloudflare bindings and credentials outside browser code and the generic core.
Use D1/R2 projections as rebuildable read models when an upstream publishing system owns content.
Use the independent editing provider for host-owned content, with authentication and tenant authorization supplied explicitly by the server.

## Key Highlights

- Revisioned D1/R2 snapshot staging, promotion and rollback.
- D1 Markdown draft saving and publishing through an injected authorization boundary.
- Optional commerce, media, experiment and social outbox adapters.
- Queue and Analytics Engine event sinks.

## Quickstart

Use Node.js 24+. Bun 1.4.0 is used for repository development and the commands below; installed consumers may use npm, pnpm or Yarn. These examples target the 0.2.0 release candidate; until that version is confirmed readable from npm, install both local artifacts from the same verified source candidate. For the Worker example, configure a Queue producer binding named `ANALYTICS` and replace the example origin with your public site origin. The handler accepts validated POST batches at `/api/analytics`; the host owns abuse controls and downstream event processing. Queue acceptance does not establish downstream persistence. The origin allowlist is browser policy, not caller authentication.

```bash
bun add ./alneas-sitekit-cloudflare-0.2.0.tgz ./alneas-sitekit-0.2.0.tgz astro@^7.3.3
```

```typescript
import {
  createAnalyticsIngestHandler, createQueueAnalyticsIngestAdapter,
  type CloudflareAnalyticsQueue,
} from '@alneas/sitekit-cloudflare';

type Env = { ANALYTICS: CloudflareAnalyticsQueue };
const analytics = createAnalyticsIngestHandler<Env>({
  bindings: env => createQueueAnalyticsIngestAdapter(env.ANALYTICS),
  allowedOrigins: ['https://example.com'],
});

export default {
  fetch(request: Request, env: Env) {
    return analytics(request, env);
  },
};
```

## Next Steps

English questions and issue reports are welcome through [GitHub Issues](https://github.com/dataarthub/sitekit/issues). Never include credentials or customer data in reports.

- [Cloudflare adapter change history](https://github.com/dataarthub/sitekit/blob/main/packages/cloudflare/CHANGELOG.md)
- [Online documentation](https://tech-docs.alneas.com/sitekit/packages/cloudflare/)
- [Connect basic editing](https://tech-docs.alneas.com/sitekit/docs/guides/public-studio/)
- [Manifest parser API](https://tech-docs.alneas.com/sitekit/docs/cloudflare-api/)
- [Editing API](https://tech-docs.alneas.com/sitekit/docs/studio-api/)
- [Public imports and runtime constraints](https://tech-docs.alneas.com/sitekit/docs/exports/)
- [Architecture and content ownership](https://tech-docs.alneas.com/sitekit/docs/architecture/)
- [Verify the local adapters](https://tech-docs.alneas.com/sitekit/docs/guides/verify-source/)
