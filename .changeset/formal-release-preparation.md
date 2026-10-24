---
---

Record the reviewed 0.2.0 version preparation after consuming its consumer change
fragments into the canonical package changelogs. Archive capture and command
selection checks are maintainer tooling only; they do not add another package
version bump. Preserve this empty record while the prepared branch differs from
main so Changesets can validate the complete pending plan without hiding records
through a narrower --since filter.

Add independent paired-maintenance checker regressions to the public quality gate.
These checks are maintainer tooling only and do not change shipped package APIs.

Fold the reviewed Appkit Core 0.2.1 / React 0.3.0 adoption and consumer README
updates into the still-unpublished 0.2.0 package entries. Their introducing
fragment is consumed without scheduling another bump; published 0.1.0 history
remains unchanged. Additional checks and tooling do not require another release.
