---
title: "Run the Public Standalone Host"
description: "Set up the public Worker, verified administrator login, actual settings activation and scheduled Facebook/Instagram delivery."
sidebar:
  order: 37
archetype: "how-to"
project: sitekit
tags: ["standalone", "workers", "authentication", "social"]
---

# Run the Public Standalone Host

## Prerequisites

Use a public release containing `@alneas/sitekit-cloudflare/standalone` and the
`sitekit-standalone` scaffold. Candidate archives are tested before publication;
these instructions do not imply that an unreleased export exists in an older
registry version. Node 24+, npm and a Cloudflare account are sufficient; no private
registry credentials, EAOS subscription or private SDK is required.

The reference combines Workers Static Assets, D1, Access and Cron. Its public
website renders a supplied localized page manifest. The existing common management
screens handle settings, measured reports, spending and social jobs. It does not
replace a CMS document editor. Other static-build hosts retain their own build and
publication receipt adapter; this renderer applies configuration at request time.

For production, prepare a domain, Access application and explicit administrator
subjects. Facebook Pages and linked professional Instagram single-image posts
require a registered Meta application, approved permissions and appropriate
accounts. Actual provider approval and production deployment are separate from
local acceptance.

## Public import

```typescript
import { createStandaloneHost } from '@alneas/sitekit-cloudflare/standalone';
import type { StandaloneConfiguration, StandaloneBindings } from '@alneas/sitekit-cloudflare/standalone';
export const runtime = (config: StandaloneConfiguration, bindings: StandaloneBindings) =>
  createStandaloneHost(config, bindings);
```

## Step-by-Step Implementation

### 1. Create the reference project

Install matching public packages in a bootstrap directory, then run:

```sh
npx sitekit-standalone ./my-site
cd my-site
npm install
```

The scaffold pins both SiteKit dependencies to the exact versions actually
installed in the bootstrap directory. It refuses an existing destination. Its
assets, Worker, configuration, setup and local issuer scripts are copied from the
public package. There are no sibling-checkout aliases or private dependencies.

Edit `sitekit.config.json`: immutable deployment origin and tenant/site identity,
initial settings, collection start, installed localized pages and Access issuer/
audience. Initial values import existing configuration when adopting a site;
never reset existing business settings to the sample defaults. Replace the local
administrator subject for production. Verified `/admin/identity` shows the Access
subject without granting that subject site access.

### 2. Initialize local storage and a signed development login

```sh
npm run db:local
npm run dev:identity
```

Keep the identity process running. In a second terminal:

```sh
npm run dev
```

Open the loopback login URL printed by the identity process. It signs an RS256
assertion, sets an HttpOnly cookie and redirects to the local `/admin`. The Worker
still verifies signature, issuer, audience, expiry, issued-at and subject; an email
header alone cannot authenticate. Local keys, encryption material, SQL replay file
and database state are ignored by Git and excluded from the public template.
The Worker rejects local issuer keys on public origins.

Local setup writes first-install saved settings and explicit human/service grants.
It does not invent applied state. Sign in and apply the initial settings sections.
The public page becomes available after site and localization are activated.
Retried setup reuses its saved SQL; changed setup configuration requires an explicit
migration/grant operation. Existing settings or revoked grants are not reset.

### 3. Observe actual settings application

The renderer consumes applied site identity, canonical URL and locale routing.
Only locales present in the installed page artifact can be activated. Prefix
`never` supports one locale in this reference; choose another prefix strategy for
multiple locales. Unsupported application is definitively rejected, preserving
the previously active target. Saving any section leaves the target unchanged.

An apply command captures the exact saved value. The runner atomically activates a
read-only runtime projection and records a durable effect receipt, fenced by source
application, aggregate version, owner epoch and live runner admission. The shared
settings service confirms that receipt. If interrupted between activation and
confirmation, restart confirms the existing receipt without reactivating it.
The projection is an execution target, never a second editable settings store.

Measurement intake checks the activated enabled flag on every request. The supplied
collector refreshes consent mode/lifetime and stops its old collector after policy
changes. Its consent panel still honors browser privacy signals. Retention uses the
activated day count in the scheduled purge; applying retention does not synchronously
delete history. Reports retain the common attribution/minor-currency contract.
Changing currency or timezone does not convert money or move queued UTC jobs.

### 4. Connect Meta and scheduled execution

Add an operator-owned `meta` object to `sitekit.config.json` with `appId`, a supported
`apiVersion`, the application's required `permissions`, and `allowedMediaOrigins`.
Configure the registered HTTPS callback as
`/api/sitekit/management/oauth/callback` on the deployment. Store
`META_APP_SECRET`, `SITEKIT_CURRENT_KEY_ID`, and `SITEKIT_SECRET_KEYS` as Worker
secrets. The last is a JSON map from key IDs to base64-encoded 32-byte AES keys.
Keep previous keys available during rotation. Never place secrets in browser
configuration or commit local secret files.

The Meta feature remains unavailable until configuration and secrets exist. Use
SNS connection in the common screen, save the automatic-publication destinations
and approval policy, then apply them. There is no editable second rule in the
social store. Account credentials are AES-GCM encrypted with tenant/site/account
associated data and never returned to the browser.

The reference exports a real `scheduled` handler and a one-minute Cron. It applies
pending settings, processes due posts and purges expired measurement records under
a separate service grant. Human administrator JWTs cannot acquire `publish`, `run`
or trusted completion rights. Concurrent invocations claim each destination through
CAS; persisted checkpoints precede visible dispatch. Unknown publication outcomes
stop automatic resend and require reconciliation.

For local scheduled acceptance, Wrangler's local scheduled endpoint can trigger the
actual handler. That development endpoint belongs to the local runtime; the
application exposes no anonymous HTTP cron endpoint. Production Cron registration
and deployment require the operator's separate infrastructure action.

### 5. Connect successful content publication

Inside the same trusted server, call `host.published(event)` only after publication
succeeds. An external CMS/build hook can use the HMAC endpoint:

```typescript
import { createStandalonePublicationRequest } from '@alneas/sitekit-cloudflare/standalone';
import type { PublicationEvent } from '@alneas/sitekit-cloudflare/standalone';
export async function notify(event: PublicationEvent, serverKey: Uint8Array) {
  const request = await createStandalonePublicationRequest(
    'https://example.test/api/sitekit/publication', event, serverKey,
  );
  return fetch(request);
}
```

Configure the same base64 32-byte `SITEKIT_PUBLICATION_KEY` in the Worker. Missing or
invalid signatures deny access. Live publisher grants and authority are checked
again after the five-minute signature envelope. First admission captures
publication data, destinations and approval requirements. Repeating the same content
revision cannot acquire destinations from a later rule; changed content under the
same revision conflicts. Disabled events remain disabled on replay. The notification
only proposes jobs; the scheduled handler performs delivery.

### 6. Prepare production explicitly

Set the real D1 ID and deployment origin in configuration. Protect `/admin*` and
`/api/sitekit/management/*` with Access while keeping the website and consented
analytics intake public. The Worker independently verifies the assertions, including
when an alternate route bypasses the Access edge. `run_worker_first` protects admin
assets before Static Assets can serve them. Use exact configured origin for mutations.
Set verified administrator subjects, service grants and secret keys before use.

Run `npm run typegen`, `npm run typecheck` and `npm run deploy:check`. A dry run does
not deploy or prove remote grants, callbacks or Cron delivery. Initializing remote
storage, changing grants and deployment are explicit operator actions; local setup
never performs them implicitly. Enable logs/traces as supplied; log only safe status
metadata and never OAuth URLs, tokens or publication text.

## Verification

`bun run test:standalone` in the source checkout creates a fresh npm-only consumer
of the exact candidate archives, checks the packaged scaffold, builds assets,
initializes local D1, generates Worker types and runs Wrangler's dry run. It then
uses Wrangler's own Workers runtime and persistent D1 for verified JWT login,
protected assets, settings save/apply/render, encrypted OAuth, Facebook/Instagram
Cron delivery and restart without resend. Set `SITEKIT_PLAYWRIGHT_MODULE` to run the
browser interaction acceptance as well.

The external issuer keys and Meta HTTP responses in acceptance are local fixtures.
They exercise the production verifier and delivery protocol but do not establish
actual Access policy, Meta permission approval, deployed scheduling or a real post.
The ordinary unit gates cover stale authority/grants, conflict and unknown-result
semantics. Storage bounds remain explicit: at most 20 accounts, 500 social jobs and
publication receipts per site, with 512 KiB social state; shared settings have their
own documented command/history capacity. Capacity failures never silently evict
replay identities. Plan explicit archival/migration before exceeding those bounds.

## Troubleshooting / Common Pitfalls

- A settings save is not an application. Check the section's actual receipt/state.
- A stopped/revoked runner leaves pending work visible; it never changes execution owner.
- A 409 requires explicit review, not an automatic version refresh and overwrite.
- Invalid signatures and audience/issuer mismatches deny login even with identity headers.
- Keep the AES rotation key that encrypted existing accounts until they are re-encrypted.
- Local signed login is for loopback development; use actual Access on a public host.
- Meta media must be reachable from approved HTTPS origins. Use live provider setup
  acceptance before production publishing.

See [Shared Management Settings](management-settings.md) and
[Embed the Shared Management Console](management-console.md) for the shared contracts.
Cloudflare documents [Access JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[Worker-first asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
and [Cron handlers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

The reference Wrangler configuration sets `observability.redact_query_string: true`. Preserve this setting in custom hosts: Meta OAuth exchanges contain credentials in query parameters, and automatic request/fetch telemetry must redact those parameters. Do not log OAuth request URLs, authorization codes, or tokens yourself.
