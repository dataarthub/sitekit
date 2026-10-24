---
title: "Shared Management Settings"
description: "Use the same saved/effective settings, permission and conflict contract in standalone and managed hosts."
sidebar:
  order: 57
archetype: "reference"
project: "sitekit"
tags: ["contracts", "settings", "management"]
---

# Shared management settings

`@alneas/sitekit/management` provides React-free public contracts and one settings
policy for standalone and EAOS-connected hosts. It does not mount a screen,
provision authentication/storage, implement an EAOS execution API, run an external
application effect, or switch execution ownership.

## Data and defaults

`SettingsValues` groups site identity, localization/timezone, measurement,
reporting currency and automatic social publication rules. Bootstrap requires the
site identity, locale routing/timezone and currency. Only new-install measurement
and social fields have defaults: measurement disabled, 90 days' retention,
opt-in consent with a 180-day choice lifetime, automatic publication disabled and
approval required. Consent mode uses the existing browser collector vocabulary;
settings do not manufacture a visitor's analytics consent.

Existing hosts must import their actual saved/effective state and verified receipts;
never initialize defaults over an existing installation. An origin is HTTPS without
credentials, query or fragment. Locale IDs are canonicalized and unique, the
default locale must belong to them, and timezone/currency must be runtime-supported.
Saved commands require the complete selected section, so omitted fields cannot
silently reset an existing value. A timezone change never reschedules existing
UTC jobs, and a currency change never converts historical money.

```typescript
import { parseSettingsValues, createSettingsRecord } from '@alneas/sitekit/management';
const values = parseSettingsValues({
  site: { name: 'Example', url: 'https://example.com' },
  localization: { defaultLocale: 'en', locales: ['en'], prefixStrategy: 'never', timezone: 'UTC' },
  reporting: { currency: 'USD' },
});
const initial = createSettingsRecord({
  scope: { tenantId: 'tenant', siteId: 'site' },
  authority: { kind: 'standalone', epoch: 'generation-1', status: 'active' },
  values,
});
// The trusted host atomically creates initial only when that scoped record is absent.
export { initial };
```

## Save, apply and completion

`ManagementSettingsProvider` defines context, settings, save, apply and application
status. Marketing/social screen operations can compose with this surface. Existing
marketing screens are not migrated by this entry alone.

Every command has `protocolVersion: 1`, a stable `commandId`, the reviewed aggregate
`expectedVersion` and `authorityEpoch`. Scope and actor are resolved by the server,
not accepted from command JSON. `saveSettings` stores a draft and returns a durable
receipt without changing runtime state. `applySettings` additionally names the
exact `savedRevision` and `expectedEffectiveRevision` (null before first application).
It reserves an application and captures that value; it never calls a build or SNS.

Each section has saved/effective revisions and its latest application. Use
`settingsSectionStatus` for `not_applied`, `applying`, `applied` or `failed` relative
to the current saved draft. Inspect the application separately when an older
revision is still applying. Another same-section application is rejected while
one is pending; other sections can progress independently. A newer draft can be
saved while an older revision applies, and confirmation preserves that newer draft.

Trusted hosts execute reserved requests through their existing application path,
using the captured value in `SettingsRecord.applications`. Completion is server-only:
`completeApplication` is deliberately absent from the browser provider. Its separate
permission and `verifyApplication` port must confirm a receipt bound to the scope,
application, captured value, revision and authority epoch. A generic receipt ID is
not evidence by itself. Application is effective only after a verified receipt;
uncertain outcomes remain pending. A failed outcome requires proof the rejected
operation cannot apply later; a transport timeout is not such proof.

```typescript
import { createManagementSettingsService, type ManagementSettingsServiceOptions } from '@alneas/sitekit/management';
export async function saveAndRequestApply(options: ManagementSettingsServiceOptions) {
  const service = createManagementSettingsService(options);
  const snapshot = await service.settings();
  await service.saveSettings({
    protocolVersion: 1, commandId: crypto.randomUUID(),
    expectedVersion: snapshot.version, authorityEpoch: snapshot.authority.epoch,
    section: 'site', value: { ...snapshot.sections.site.saved.value, name: 'Updated' },
  });
  const saved = await service.settings();
  return service.applySettings({
    protocolVersion: 1, commandId: crypto.randomUUID(),
    expectedVersion: saved.version, authorityEpoch: saved.authority.epoch,
    section: 'site', savedRevision: saved.sections.site.saved.revision,
    expectedEffectiveRevision: saved.sections.site.effective?.revision ?? null,
  });
}
```

## Host admission and persistence

`createManagementSettingsService` requires a bound authenticated scope, durable
`ManagementSettingsStore`, live `authorize` callback and existing-receipt verifier.
There is no allow-all default. The host resolves the actor outside browser input.
Authorization receives the selected section/proposed value for destination-level
checks and returns `SettingsAdmission`: the current decision plus an opaque
permission generation. It runs before reading and again before committing or
returning replay information. The authorizer and store must bind the same verified
actor/site and advance that generation for relevant role, destination, capability
or subscription changes. The completion privilege must be separate from ordinary apply access.
Display capabilities/permissions from `ManagementContext` never grant server access.

`compareAndSwap` must atomically match tenant, site, aggregate version and authority
epoch **and the current permission generation** (`expectedPermissionVersion`),
returning literal false without changing any row on conflict. Literal true is the
only success acknowledgement; malformed/truthy responses fail unavailable. The service performs
no automatic write retry or merge. Changing an authority status/epoch must change
its aggregate version too; the host must prevent an old generation from recreating
or overwriting the record. Bootstrap is an atomic create, never a CAS upsert.
Both backends must meet these persistence invariants even if their DB APIs differ.
A separate authorization check followed by an unguarded DB write is insufficient.
Use an atomic admission/version comparison or the host's transactional grant/permit
primitive when permissions are not stored alongside the settings; do not mirror
an eventually consistent permission flag and claim equivalent revocation safety.

Paused/transferring owners reject new save/apply requests. Trusted completion of an
already admitted effect may still record verified facts while paused, under the
same epoch and fresh completion authorization; it does not start another effect.
An epoch change rejects the old completion. Distributed execution permits and
connect/disconnect transfer are later host work; this CAS fence alone is not a
complete cross-service or external-side-effect fencing protocol.

The service keeps command receipts and application history in the same atomic
aggregate. Identical command replays return their existing result after fresh
permission checks, including after process restart. A changed payload, operation
kind or authority epoch under an old ID is a conflict. A save replay returns its
original acknowledgement/version; reload settings for current state. Apply replay
returns the application's current status. Never overwrite local unsaved input on
409: reload/review the current revision and issue a deliberate new command.

This initial record is bounded to 256 command receipts, 128 applications and
1 MiB of serialized UTF-8 JSON. New commands fail at capacity; no dedupe/history
entries are silently evicted. A production host must plan explicit archival and
retain replay tombstones before reaching these limits. Scope-mismatched or malformed
records fail closed. Internal storage/provider exceptions become safe unavailable
faults, not browser diagnostics. Host HTTP mappings are invalid=400, forbidden=403,
conflict=409, unavailable=503 and capacity=413.

The conformance corpus uses real local in-memory SQLite, an atomically fenced
permission-generation table and two execution-owner profiles. It recreates service
objects to prove receipts belong to the store rather than a service-instance cache;
it does not reopen the database or restart a process.
It proves shared contract policy and durable CAS behavior, not a deployed EAOS
adapter, native entitlement service or an external application's successful effect.
