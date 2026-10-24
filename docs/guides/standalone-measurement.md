---
title: "Run Standalone Marketing Measurement"
description: "Store consented events, accept trusted outcomes and report campaign spending without a managed CMS dependency."
sidebar:
  order: 55
archetype: "how-to"
project: "sitekit"
tags: ["analytics", "marketing", "cloudflare"]
---

# Run Standalone Marketing Measurement

## Prerequisites

Use the core and Cloudflare artifacts from the same verified source candidate, Node.js 24+ for build/tooling, and a host-provisioned D1 database. This feature has no managed CMS account or private SDK requirement. A static website still needs a server endpoint for persistence and confirmed outcomes. Generate your actual Worker binding types in the consuming host.

## Public import

Use `@alneas/sitekit/marketing` for the shared contract, strict validation and CSV spending parser. Use `@alneas/sitekit-cloudflare/marketing` for storage, schema, routes and optional integration signatures. Advanced management screens and social publishing are separate extensions; the measurement provider advertises `socialPublishing: false`.

## Step-by-Step Implementation

### 1. Apply the schema and configure the server

Apply `marketingSchemaSql` once through your host's explicit D1 migration tooling. The provider never creates tables implicitly. Configure collection coverage and verified scope on the server; do not take site/tenant selection from request JSON.

```typescript
import {
  createD1MarketingServices, createMarketingHandler,
  createHmacMarketingAuthorizer, marketingSchemaSql,
  type MarketingDatabase,
} from '@alneas/sitekit-cloudflare/marketing';

// This illustrates the required bindings; use generated binding types in your host.
interface MeasurementEnv {
  DB: MarketingDatabase;
  SITE_ID: string;
  COLLECTION_STARTED_AT: string;
  OUTCOME_SIGNING_SECRET: string;
  REPORT_SIGNING_SECRET: string;
}
const authorize = createHmacMarketingAuthorizer<MeasurementEnv>({
  keys: env => [
    { id: 'booking', secret: env.OUTCOME_SIGNING_SECRET,
      scope: { siteId: env.SITE_ID }, operations: ['outcome'], outcomeSource: 'booking' },
    { id: 'reporting', secret: env.REPORT_SIGNING_SECRET,
      scope: { siteId: env.SITE_ID }, operations: ['report', 'spend', 'forget', 'purge'] },
  ],
});
export const fetch = createMarketingHandler<MeasurementEnv>({
  publicScope: env => ({ siteId: env.SITE_ID }),
  services: (env, scope) => createD1MarketingServices({
    database: env.DB, scope, startedAt: env.COLLECTION_STARTED_AT, retentionDays: 90,
  }),
  authorize,
});
// Supply this SQL to your migration tooling; do not execute it on every request.
export const migration = marketingSchemaSql;
```

Store independent, random signing secrets in server secret bindings; use at least 32 bytes. Never put them in browser configuration. Schedule `services.analytics.purge()` to enforce retention, and configure rate controls on public ingestion. This example does not provision infrastructure or supply a user login/session implementation.

### 2. Collect events and return an attribution reference

Install `initBrowserAnalytics` from `@alneas/sitekit/analytics` with the site's configured ID and `/api/analytics`. Retain the consent policy and stylesheet from the analytics integration. `analytics.attributionReference()` returns an opaque reference only while consent is effective; pass it in an explicitly supported form or booking handoff and return it with a trusted outcome. Do not put it in general share links or assume an external booking provider preserves it.

No reference, withdrawn permission or an expired lookback produces an unattributed outcome. Browser collection refuses `conversion` and `booking_complete`. An outbound booking click is a booking start, not a confirmed reservation. The host can invoke the scoped `forget` operation when processing a privacy request; clearing browser storage alone does not delete previously stored records.

The store hashes references before persistence. Forgetting atomically clears existing links and stores a scoped hash revocation marker, so delayed events cannot restore them. Retention cleanup removes measurement records but retains these minimal revocation markers; retire them only as part of an explicit installation/data lifecycle policy. Long-lived browser tabs rotate expired references before emitting events or handing them to an integration.

### 3. Use protected integration routes

| Route | Method and input | Result |
| --- | --- | --- |
| `/api/analytics` | POST analytics batch; same-origin browser request | Consent/site/time-filtered durable event acknowledgement |
| `/api/marketing/outcomes` | POST trusted outcome JSON | Immutable source/event receipt |
| `/api/marketing/spend` | POST spending import JSON or `text/csv` | Atomic counts of inserted and duplicate rows |
| `/api/marketing/report` | GET `from`, `to`, `timezone`, `currency` | Site and campaign reports |
| `/api/marketing/forget` | POST `{ attributionId }` | Remove scoped attribution links |
| `/api/marketing/purge` | POST `{}` | Delete expired scoped records |

The protected routes require host authorization. The included HMAC authorizer verifies `X-SiteKit-Key-Id`, `X-SiteKit-Timestamp` (Unix seconds), and `X-SiteKit-Signature` (lowercase HMAC-SHA256 hex). Sign these six UTF-8 values joined by newline, with no trailing newline: `sitekit-marketing-v1`, key ID, timestamp, HTTP method, full request URL, and lowercase SHA-256 hex of the exact request body bytes. GET uses the hash of the empty body. Signatures expire after five minutes; immutable source/event or spending-row IDs suppress replay effects within that window. Provider secrets stay on the integration server. Rotate keys with distinct IDs and an explicit overlap period.

Example outcome: `{ "source": "booking", "eventId": "reservation-42", "kind": "booking", "occurredAt": "2026-10-20T00:00:00Z", "amountMinor": 15000, "currency": "JPY" }`. Add `attributionId` only if the integration returns the consent reference. A key authorized for `booking` cannot submit an outcome under `forms` or a different site.

CSV headings are exactly `id,occurredAt,source,medium,campaign,amountMinor,currency` (order may vary). Empty acquisition cells are omitted. IDs are stable across imports; reimporting the same row is safe, while changing its amount under the same ID conflicts. Allocate spending to the reporting interval using an explicit timestamp. For a correction, prepare a separately reviewed accounting adjustment workflow; silently replacing an immutable row is unsupported.

### 4. Interpret the report

The model is `last-non-direct-30d-v1`: choose the latest non-direct, consented acquisition record at or before the outcome, within an inclusive 30-day window and the same site/tenant/reference. Ties use stable event identity. Reports re-evaluate late-arriving records and expose `asOf`, `retainedFrom`, `lookbackComplete` and `spendCoverage: recorded-only`.

Amounts are integer currency minor units. CPA is recorded spending divided by confirmed leads plus bookings. ROAS uses confirmed attributed revenue divided by recorded spending. Null means unavailable; missing spending, unknown outcome values and mixed currencies are not converted to zero. Explicit zero spending permits a zero CPA when conversions exist, but ROAS remains unavailable. These are site-observed metrics, not a claim of advertising-platform impressions, billed spending or platform-attributed conversions. No conversion export or automatic ad-cost API synchronization is included.

Dates are explicit inclusive/exclusive instants; timezone is presentation metadata, not an implicit conversion of date-only strings. For an Asia/Tokyo calendar day, send the correct UTC/offset boundaries. Never sum across currencies without a separately defined exchange-rate policy.

## Verification

The storage tests use real SQLite statements, uniqueness constraints, transactional rollback and provider re-creation. Run `bun run test:all`, `bun run typecheck:all`, `bun run verify:public`, `bun run test:site-build` and `bun run test:consumer`. The packed-consumer check exercises the published subpaths from installed archives without private SDKs. Local SQLite/Node Web Crypto evidence does not establish deployed D1 or a live booking integration; run those acceptance checks against your provisioned host separately.

## Troubleshooting / Common Pitfalls

- **401/403:** verify signature age, exact URL/body, key operation/source policy and same-origin mutation policy. Cross-origin cookies are not a substitute for host authorization.
- **400/413/415:** correct strict DTO/CSV fields, content type and the 128 KiB request limit. Spending imports accept at most 100 rows.
- **409:** an existing source/event or spending identity has a different immutable payload. Do not retry with silently modified values.
- **422:** report bounds exceed retained coverage, 93 days or 10,000 period records, or trusted input lies outside collection/retention bounds. Narrow the period or choose a provider designed for a larger volume.
- **503:** storage, configuration or provider resolution is unavailable. Tables must be explicitly migrated; a missing managed provider never silently falls back to standalone.
- **Unattributed or null metrics:** inspect coverage, the handoff reference, timestamps and currencies. Lack of a confirmed outcome cannot be repaired by counting a browser click as a sale.
