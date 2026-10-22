---
"@alneas/sitekit-cloudflare": patch
"@alneas/sitekit": patch
---

Verify stored content and media bytes against the selected snapshot manifest before returning any projection adapter. Missing or modified R2 objects now fail closed instead of silently delivering empty or unchecked content. Hosts must retain both payload objects for every readable revision; no API migration is required.

Update the packaged Core verification guide to describe the executed content/authority contracts and the host-owned lifecycle boundaries.
