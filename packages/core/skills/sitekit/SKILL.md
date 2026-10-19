---
name: sitekit
description: Configure or troubleshoot an Astro consumer of ALNEAS SiteKit using public snapshots, build helpers and optional basic content management.
---

# SiteKit consumer

Use this for a consuming site, not for maintaining or publishing the SiteKit repository. Read the installed package version and exports before choosing imports. Start with the [public import reference](https://tech-docs.alneas.com/sitekit/docs/exports/) and the [site API](https://tech-docs.alneas.com/sitekit/docs/api/). Initial registry publication is pending; use verified local package artifacts until the requested version exists on npmjs. Do not infer availability from an import example. Match portal guidance to the installed version or candidate revision. When the default released portal differs, use the packaged `llms-full.txt` and exported declarations; do not adopt a newer API merely because it appears online.

## Configure one content source

Use Node.js 24+ for Astro builds. Bun is needed for the documented repository checks, not by the library runtime. Keep a consumer's existing Astro pages and integrations.

```typescript
import { defineSite } from '@alneas/sitekit/config';
import { createSiteAstroConfig } from '@alneas/sitekit/build';

const site = defineSite({
  id: 'example', revision: 1,
  content: { snapshot: { siteId: 'example', revision: 1, posts: [], assets: [] } },
});
export default await createSiteAstroConfig(site, () => ({ site: 'https://example.com' }));
```

Select exactly one `content.snapshot`, `content.file` or `content.endpoint`. Remote endpoints use HTTPS; local HTTP is limited to loopback. Pass CMS credentials through server/build options, never snapshot fields or browser modules. Inline snapshot data is checked when read, not by `defineSite` alone. Build identity/revision must match the selected publication. See [file and HTTP sources](https://tech-docs.alneas.com/sitekit/docs/guides/content-sources/).

## Add basic management only when requested

Use `/studio/basic`, `/studio/http-provider` and `/studio/basic.css`, with public Appkit React styles and a compatible React runtime. Astro needs its React integration. D1 adapters and credentials belong on the server; the host supplies authentication, tenant/collection authorization and schema provisioning. The local preview is a test fixture, not production authentication. Publishing a record does not deploy a site. Follow the [Studio guide](https://tech-docs.alneas.com/sitekit/docs/guides/public-studio/).

## Diagnose failures without weakening checks

For covered configuration/build failures, catch `SiteKitError` from `@alneas/sitekit/errors` and match its stable `code`. Use `hint` and `docs` for the corrective action; do not expose raw `cause` to clients. Host callbacks and other APIs retain their own errors. See [error codes](https://tech-docs.alneas.com/sitekit/docs/errors/). For editor-time configuration shape checking, use `@alneas/sitekit/schema.json`; [custom runtime refinements](https://tech-docs.alneas.com/sitekit/docs/guides/site-schema/) still apply.

- Invalid configuration: remove extra fields, select one content source, supply a nonempty site ID and a positive integer revision when specified.
- Identity/revision mismatch: choose the intended pinned publication; do not silently retry with a different revision.
- Image checksum or missing-hash failure: correct the publication's hashes and source bytes. Do not disable integrity checks as a repair.
- Editing 401/403: inspect host authentication, origin and authorization; do not remove the policy to obtain success.
- Save failure or stale modification time: retain unsaved input, reload the latest record and resolve the conflict before retrying. The D1 precheck is not an atomic compare-and-swap.
- Missing full Studio/editor export: use a supported public subpath; advanced extensions are a separate distribution. Do not alias a restricted SDK or sibling source tree into the consumer.

Use the existing site's typecheck/build and behavior tests after changes. A successful import does not establish working persistence, authentication or deployment. Do not publish packages, send messages, or deploy a site merely because this skill is loaded.
