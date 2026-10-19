# Pending release changes

Use `bun run changeset` to record affected packages, patch/minor/major impact and a consumer-oriented summary. See [contributor workflow](../CONTRIBUTING.md) and [release preparation](../RELEASING.md). Fragments are private to the review lifecycle and are excluded from npm payloads. Only `bun run version:packages`, run explicitly in a reviewed preparation change, consumes fragments into cumulative package changelogs and updates versions; checks do not do this.
