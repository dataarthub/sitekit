---
title: "Connect a Managed Execution Authority"
description: "Host the common management operations behind a live licensed authority without changing the public screens."
sidebar:
  order: 38
archetype: "how-to"
project: sitekit
tags: ["management", "settings", "social"]
---

# Connect a Managed Execution Authority

## Prerequisites

Use a release containing `createManagedSiteRuntime` from
`@alneas/sitekit-cloudflare/management`. Candidate archives are tested separately;
older registry versions do not acquire unreleased exports automatically. The host
owns verified human/service sessions, current subscription and site/action grants,
transactional persistence, exact settings activation and encrypted Meta credentials.
Public connector availability does not grant access to a licensed service.

The shared components and `createManagementHttpProvider` do not change. A connected
screen calls the managed API as its sole authority; no local fallback database or
publisher is created. Navigation embedding and connect/disconnect transfer are
separate operations, not consequences of selecting a different URL.

## Public import

```typescript
import {createManagedSiteRuntime} from '@alneas/sitekit-cloudflare/management';
import type {ManagedSiteOptions} from '@alneas/sitekit-cloudflare/management';
export const connect = (options:ManagedSiteOptions) => createManagedSiteRuntime(options);
```

## Step-by-Step Implementation

### 1. Bind one authenticated workspace

Derive tenant, site, actor, principal kind and authority epoch from the verified host
session and registered site. Never accept identity, premium flags, service roles,
stores, factories or credentials from browser JSON. Resolve a new server composition
for each request; it is intentionally tied to the admission generation and epoch.
The runtime rejects non-EAOS, paused, foreign-scope and changed-epoch records.

Provide `authorize(operation, accountId?)` for the actual current subscription,
lifecycle and resource policy. It returns an opaque permission generation. Every
relevant control change must advance that generation. Both reads/replays and writes
check admission; capability and permission fields are presentation only. Service-only
`run`, `publish`, `publication`, `ingest`, `outcome` and `completeApplication` rights
cannot be acquired by a human runtime, even if a host accidentally grants the names.

### 2. Supply native persistence and real activation

`settingsStore` persists one canonical settings aggregate. Its compare-and-swap must
check source version, authority epoch and the bound actor's current permission
generation atomically. The social store similarly fences its revision, authority
and admission generation. A preflight permission callback alone is insufficient;
use a transaction with the native control store or an equivalent all-instance drain.

Saving remains inactive. Applying reserves an immutable section revision. The
service runner passes that captured value to `activation.apply`, and completion
requires `activation.verify` to confirm an existing matching target receipt. Resume
existing receipts without executing the target twice. Unknown external build or
provider results remain pending; do not invent a successful receipt. External static
build hosts must supply their actual build/publication receipt adapter.

### 3. Connect canonical measurement and encrypted social ports

`measurement(effective)` provides the common marketing services using the applied
retention and other runtime policy. Confirm its returned tenant/site exactly match.
The authority must admit native measurement writes in the same transaction as its
control generation. Keep integer minor amounts, last-non-direct attribution,
consent filtering, immutable dedupe and coverage semantics; unrelated native report
models must not be presented as equivalent by renaming fields.

Optional `social(context)` constructs the owning native social service with the
verified actor, live admission and applied publication policy. Its native service
owns queue, approvals, dispatch/reconciliation and effect receipts; public OAuth,
`SecretBox` and provider protocol helpers can be injected without a second queue. `createMetaOAuth`, `createMetaDeliveryDriver` and `createSecretBox` are
server-only helpers exported by the same adapter entry. The managed service uses
the applied site origin and publication policy. Credentials never enter the public
provider. Configure `observability.redact_query_string: true` when using Workers
telemetry: Meta OAuth exchanges contain query credentials. Other hosts must provide
equivalent redaction and must never log OAuth URLs or provider secrets.

### 4. Use the existing common HTTP client

After verifying its actual user session, the host calls `runtime.fetch(request)`.
That runtime is an authenticated port, not a standalone anonymous request listener.
Use a distinct trusted service runtime for `run`, `published`, `ingest` and `outcome`;
there is no browser completion or scheduled-run route.

```typescript
import {createManagementHttpProvider} from '@alneas/sitekit/management/http';
export const provider = createManagementHttpProvider({
  origin:'https://console.example.test',
  basePath:'/api/sites/example/management/',
});
```

Point the existing `ManagementWorkspace` or `ManagementApp` at this provider and
include the common stylesheet. Both shells observe the same saved/effective
revisions. A 409 requires review/reload; transports never refresh versions and retry
writes automatically. Confirm OAuth through the authenticated host callback using
`runtime.completeConnect`, then redirect to a fixed registered management URL.

## Verification

Exercise the installed public client against the actual native store/API: saved
versus applied values and target output, stale writes, current read-only permissions,
revoked subscription/site access, canonical event/spending reports, encrypted OAuth,
concurrent schedulers and restart without resend. Fake provider HTTP and local
fixtures establish protocol/persistence behavior, not live account acceptance.
Private authority implementation and operational instructions stay in their owner.

## Troubleshooting / Common Pitfalls

A 403 after a subscription or site-grant change is expected; refresh the verified
host session and resolve a new runtime rather than falling back to local storage.
A 409 on save/apply requires reviewing the current saved/effective revisions.
An application remaining `applying` needs its actual native target receipt; a
successful request enqueue alone is insufficient. Missing social configuration is
reported unavailable, and a provider's unknown dispatch requires reconciliation.
An unsupported database dialect needs a deliberate canonical-semantic adapter;
do not change the report model or bypass transactional admission to make it run.

## Shared embedding and connection recovery

The public `ManagementWorkspace` is the screen body for a verified enclosing host;
`ManagementApp` adds the standalone shell. Pass the same provider and stylesheet.
Forward `onDirtyChange` to the host's site selector and guard site switches while
inputs or operations are pending. Replace the binding on principal, site or epoch
changes, and immediately remove the old workspace on logout. Host organization,
subscription and site-list navigation stays outside this body.

The optional `ManagementConsoleProvider.connection` supplies status, plan and
advance commands. `createManagementHttpProvider` uses the same `connection/status`,
`connection/plan` and `connection/advance` routes in either host. A server provider
must independently authorize connection administration on every command, including
idempotent replays. The common gateway verifies the session, bound site and Origin;
connection administration is an additional service permission, never implied by
ordinary read access. Status contains owner, phase, counts and permission only.
The browser never receives snapshots, permits, tokens or peer endpoints.

Use `createConnectionContext` for a recovery-only bootstrap when the current host
cannot expose business settings during cutover. Its settings and marketing
permissions are denied. The shared connection page remains available so a reload
can resume the same transfer. Do not manufacture applied business values from a
local stale snapshot to make bootstrap succeed.

## Controlled connect and disconnect

Provision the stable site-local authority store before enabling a connection, using
`authoritySchemaSql`, `createAuthorityRecord`, `initializeAuthority` and
`createD1AuthorityStore`. Initialization preserves an existing owner. The control
record is separate from settings: it contains only the execution fence, transfer
receipts and durable permit identities. It remains at the stable site endpoint
throughout both directions of migration. The permission-generation admission row
must change atomically with the actor's grants.

Compose `createAuthorityService` with explicit trusted peers. A plan chooses the
configured opposite owner; it never accepts a URL or tenant from browser input.
Advance closes admissions, drains durable permits, freezes the source, validates
and stages the destination, commits a fresh owner/epoch, then activates the staged
state. Owner activation is idempotent by transfer ID and epoch. If activation loses
its response, resume that phase. Once ownership is committed, never roll it back
or let the previous scheduler take over on a timeout. If an admitted operation
changes the source after planning, drain it and capture its final inventory before
freezing; the transfer preserves the latest committed business state.

Every instance that writes or executes effects must use the same control channel.
`createAuthorityExecutor` holds a durable permit around its operation. Thrown or
uncertain work stays unresolved; elapsed time never resolves it. Its trusted proof
port must attest a durable result, and the service's `verifyPermit` must verify that
proof against the exact operation. Neither port has an allow-all default. A known
rollback may be resolved as `not-executed` only with verified evidence. Use
`createAuthorityDeliveryDriver` around each external SNS attempt; retain its exact
attempt ID for reconciliation. Reconciliation resolves that attempt without a new
publish, including while admissions are closing. Unknown effects block cutover.

The standalone host's optional `authority` binding connects the safe browser
controls, executor and authenticated EAOS delegation ports. Before connecting,
configure it on **all** serving and scheduled instances. The delegation must map a
verified local principal to an authorized EAOS principal through a trusted server
channel; request JSON or forwarded user/role headers are not identity evidence.
EAOS independently rechecks its current contract and site rights. The host relays
management, telemetry, effective runtime settings and publication notifications to
the current EAOS owner. Local Cron skips execution after EAOS owns the site.
Authority-channel or EAOS failures fail closed without switching owners. A host
that has participated in migration refuses operation if its authority binding is
later omitted. Initial standalone use requires no EAOS connection or private SDK.

## Snapshot adapters and retained history

`createSiteTransferPeer` supplies bounded, resumable staging over native business
ports. `createD1TransferArchive` encrypts every persisted page and receipt with
scope/owner/transfer associated data. Credentials are decrypted and re-encrypted
only through a trusted target sealing port, and the manifest binds their semantic
content without depending on randomized ciphertext. Target activation requires the
stable control's matching owner, epoch, transfer ID and ready receipt. An inactive
predecessor is reusable only when its retained recovery inventory is unchanged;
a divergent destination is rejected rather than merged or overwritten.

For the standard host, provision `transferBusinessSchemaSql` and use
`createStandaloneTransferData`. The standard bootstrap includes these tables.
The native owner supplies its own transactional settings, SNS and SQL adapters;
its SNS service continues to own delivery and workflow receipts. Preserve canonical
job IDs, approvals, schedules, request keys, publication fingerprints, attempts,
provider checkpoints and remote IDs. Preserve original native provenance alongside
canonical projections. Snapshot pause/adoption and their receipts must commit in
the same business transaction, and retries must consult those receipts.

Transfer raw measurement fingerprints/write identities, spend/outcome rows, privacy
revocations and original collection coverage. Destination retention uses actually
applied settings and the imported collection start. Saved drafts remain separate
from effective values; activate only the imported effective values in actual native
targets. An applying settings request, unresolved provider result or active OAuth
handshake blocks migration. Existing session-bound OAuth handshakes cannot move
between hosts. Current bounded transfer limits are 50,000 records / 8 MiB total,
with paged encrypted persistence; exceeding a limit rejects the transfer without
truncation. Use operator-managed offline migration for larger inventories.
