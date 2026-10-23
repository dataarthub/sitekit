---
title: "Embed the Shared Management Console"
description: "Mount public settings and marketing screens with an authenticated standalone or managed provider."
sidebar:
  order: 36
archetype: "how-to"
project: sitekit
tags: ["management", "react", "standalone", "settings"]
---

# Embed the Shared Management Console

## Prerequisites

Use the public Core and Cloudflare packages from the same release, React 19 and a
verified administrator session. Provision D1 with `managementSchemaSql` once.
An existing host supplies its canonical report, encrypted Meta connection and
publication ports. No EAOS or private Appkit package is required by these screens
or adapters. This entry supplies reusable UI, HTTP and settings storage; it does
not provision login, Meta applications, deployment or a publication scheduler.

The settings policy and effect-proof requirements are defined in
[Shared Management Settings](management-settings.md). Existing installations
import their actual values instead of resetting them to installation defaults.

## Public import

```tsx
import { ManagementApp, ManagementWorkspace } from '@alneas/sitekit/management/react';
import type { ManagementWorkspaceProps } from '@alneas/sitekit/management/react';
import '@alneas/sitekit/management/styles.css';

export function Standalone(props: ManagementWorkspaceProps) {
  return <ManagementApp {...props} />;
}
export function Embedded(props: ManagementWorkspaceProps) {
  return <section aria-label="Selected site"><ManagementWorkspace {...props} /></section>;
}
```

Both mounts render the same settings, advertising, post and account components.
`ManagementApp` adds SiteKit's sidebar; `ManagementWorkspace` supplies only the
workspace and common page navigation. Styles are scoped below
`.sitekit-management`; they do not style the enclosing host. No global `main`,
router, login screen or private design-system dependency is added.

## Step-by-Step Implementation

### 1. Bind a browser workspace

```typescript
import { createManagementHttpProvider } from '@alneas/sitekit/management/http';
import type { ManagementBinding } from '@alneas/sitekit/management/react';
import type { ManagementContext } from '@alneas/sitekit/management';

export function bind(context: ManagementContext, verifiedSessionGeneration: string): ManagementBinding {
  return {
    identityKey: verifiedSessionGeneration,
    context,
    provider: createManagementHttpProvider({ origin: 'https://example.test' }),
  };
}
```

Obtain context through the authenticated host, never construct granted rights from
browser form input. Change `identityKey` when the principal/session changes. A
site, execution owner or authority epoch change creates a fresh workspace. Scope
switches prompt for unsaved changes; identity changes clear the old workspace
immediately. Choosing to stay retains the accepted workspace; the host should keep
its site selection consistent. A subsequent new binding object can request the
same site again. Do not mutate a binding object in place.

Pass `initialQuery` with UTC `from`/`to`, IANA `timezone` and ISO `currency`. Effective
localization/report settings supply the initial defaults for the marketing screen.
Changing the timezone does not move scheduled UTC jobs. The host's account/job
ports remain authoritative; the UI never dispatches directly to Meta.

### 2. Connect the authenticated standalone server

```typescript
import { createManagementHandler, createD1ManagementSettingsStore } from '@alneas/sitekit-cloudflare/management';
import type { ManagementSession } from '@alneas/sitekit-cloudflare/management';
import type { CloudflareD1Database } from '@alneas/sitekit-cloudflare';
import { createManagementSettingsService } from '@alneas/sitekit/management';
import type { ManagementConsoleProvider, ManagementSettingsServiceOptions } from '@alneas/sitekit/management';

interface HostSession {
  subject: string;
  provider: ManagementConsoleProvider;
  policy: Omit<ManagementSettingsServiceOptions, 'store'>;
  authorize: ManagementSession['authorize'];
}
interface Bindings { db: CloudflareD1Database }

export function standaloneGateway(
  resolveVerifiedSession: (request: Request, env: Bindings) => Promise<HostSession | null>,
) {
  return createManagementHandler<Bindings>({
    origin: 'https://example.test',
    async session(request, env) {
      const verified = await resolveVerifiedSession(request, env);
      if (!verified) return null;
      const service = createManagementSettingsService({
        ...verified.policy,
        store: createD1ManagementSettingsStore(env.db, verified.subject),
      });
      return {
        scope: verified.policy.scope,
        authorize: verified.authorize,
        provider: {
          ...verified.provider,
          settings: { ...service, context: () => verified.provider.settings.context() },
        },
      };
    },
  });
}
```

The resolver verifies the actual login/session and site grant. It supplies fresh
capabilities, operation permissions and the actor-bound marketing services; a
caller-controlled identity header is insufficient. The policy's authorizer checks
live rights for each operation and returns a permission generation. Maintain the
matching `(tenant_id,site_id,subject,version,allowed)` row in
`sitekit_management_admission`. Every relevant role, destination, subscription or
capability change must atomically advance that generation with the authoritative
ACL change; a stale mirrored ACL in a different database does not satisfy this
contract. The single SQL compare-and-swap checks that live generation together
with settings version and authority epoch. There is no allow-all default.

Provision new records with `createSettingsRecord` and
`initializeD1ManagementSettings`; existing records are never overwritten. Keep the
server-side aggregate private. Runtime/public builds read only confirmed effective
sections; a draft is not a runtime policy. Reserve apply through the common service,
then let the trusted build/runtime port process the immutable captured application
value. Complete it only with a verified matching effect or definitive rejection
receipt. An uncertain outcome stays applying. Completion has no browser endpoint.

Use `sections.social.effective.value` as the publication hook's canonical rule.
Remove the old immediate `saveRule` form/route when adopting this workspace. Applying
it affects later successful content-publication events, not already queued posts.
Do not keep a second editable rule under the social store. The host's worker must
check live permission and authority before external dispatch, preserve stable
application/job identities and persist effect receipts. This gateway does not create
a second runner or complete effects merely because a request was accepted.

The route prefix defaults to `/api/sitekit/management/` and may be configured
identically on browser and server. It covers context/settings/application reads,
versioned save/apply, presentation access, reports, CSV imports, accounts, Meta
connection start, posts and explicit job actions. The existing Meta OAuth callback
is served by the host's actor-bound OAuth endpoint; configure its return URL back
to this workspace. Only HTTPS Meta authorization redirects are accepted. Credentials
and OAuth state remain server-only. Errors expose fixed codes; responses are
`no-store`. Mutations require the exact origin. Body/response limits are 128 KiB
and 1 MiB respectively.

### 3. Use the same bodies in a managed host

The managed host passes its authenticated provider into `ManagementWorkspace`.
Its gateway uses the same operations and returns the same credential-free values.
Premium entitlement, organization/site selection and native execution belong to
that host. Connecting a database under the standalone runner does not constitute
a native managed integration. No automatic standalone fallback exists.

This release prepares the reusable entry; mounting it inside an actual managed
application and implementing that application's native execution facade are separate
integration work. Private compatibility imports can switch only after the public
release actually contains these exports; do not introduce sibling source aliases
or guessed package versions.

## Verification

Settings cards show saved/effective revisions and values independently. Saving
never marks a section applied; apply displays its actual durable status. If another
editor changes the record, local inputs are retained and automatic retries stop.
Review the current saved/effective values, explicitly retain the input or discard
it, then save with a newly reviewed version. Permission and capability failures
suppress writes; the server still authorizes every request. Pending applications
and other-client changes refresh on focus, after commands and every 15 seconds.
Refresh failures disable writes and preserve inputs. Site transitions discard
previous caches and fence old async completions, including mutation callbacks.

Source checkout verification includes `bun run test:management-browser`. Install
Playwright and its Chromium browser for that optional test, or set
`SITEKIT_PLAYWRIGHT_MODULE` to the installed module entry. It starts a loopback host
with real SQLite, signed local test sessions and synthetic effect receipts; it
checks save/apply, conflict recovery, dirty guards, late responses, read-only
admission and both mounts. These fixtures are not a production identity provider
or evidence of live Meta/EAOS acceptance. Unit tests additionally reopen a file DB
and exercise atomic permission revocation. The isolated public archive consumer
verifies the exports and browser stylesheet without private registry credentials.

## Troubleshooting / Common Pitfalls

- A 409 requires review. Never retry with a refreshed version automatically.
- A blocked/unknown apply is not a failed effect and must not be redelivered blindly.
- If reads fail, fix the verified session and grants rather than exposing a second store.
- Saved defaults are not effective policy. Build/measurement/publication ports must
  confirm and consume the exact captured revision before reporting application.
- Grant display is advisory; server and dispatch admission remain mandatory.
  Context and marketing access do not require site-settings read permission;
  each actual settings read remains separately authorized.
- Live login, production cron, actual Meta permissions and native managed-host
  acceptance require the host's deployment and service setup.
