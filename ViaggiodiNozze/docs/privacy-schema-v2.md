# Privacy schema v2: coordinated rollout and compatible rollback

This is a data contract change inside the existing Firebase project. It does not require a new account, backend service or Cloudflare binding.

## Contract

- Financial fields and original conversion evidence belong in `trips/{tripId}/private_credentials`, accessible only to verified Owner/Copilota.
- Known shared fields use generated, bounded schemas. `publicSchemaVersion` is an integer. Only validated shared records receive version `2`.
- Viewer collection queries explicitly require `publicSchemaVersion == 2`. An unfiltered query must be denied. Per-document checks alone do not protect a collection query.
- Client and server field schemas are generated from the existing types and reviewed historical aliases by `scripts/generate_viewer_schema_rules.cjs`. Sensitive field lists are synchronized with `scripts/sync_sensitive_rules.cjs`. Neither script contacts Firebase.
- Nested secrets and unsupported legacy structures are retained in the private vault, including complete opaque values where necessary. Editors reconstruct them on read; the safe itinerary row remains public. Unknown structures must not be discarded merely to pass validation.
- Verified Viewer transitions quarantine sensitive local records in the existing isolated conflict archive before sanitizing the display cache. These archive copies must never be replayed into shared settings.
- Unshared photographs are local and scoped to authenticated user/trip. Unscoped historical local images are retained on disk but are not automatically exposed. Explicit LIVE publication is the only photo upload path.
- LIVE updates and public guestbook queries also require validated markers. Existing public text/photo posts need review and marking before appearing in the new public queries. The required composite indexes are in `firestore.indexes.json`.
- Storage privileges use actual Owner/Copilota membership, never the mere presence of an UID in `members`. LIVE deletion revokes the managed Storage object before hiding/removing the feed reference, and propagates failures. The `0000` feed record uses soft deletion after object revocation.

## Mandatory rollout gates

Do not deploy the frontend alone. An unchanged old dataset has no v2 markers, and dirty legacy documents must not become public by adding a marker without inspection.

1. With separate authorization, snapshot current shared documents and corresponding vault records using existing project access. The read-only audit script exports field paths only; it is not a complete data backup.
2. Review every affected path and conflict. A newer EUR value already in the vault takes precedence over a stale foreign-currency value in a shared document. Preserve conflicting originals in a private, non-UI audit record or protected backup. Never overwrite an existing vault value blindly.
3. Rehearse the cleanup with synthetic data or an isolated local copy. Prepare atomic per-record changes against the current read version: preserve/move financial data into the vault, replace the shared document with its sanitized projection, and stamp version 2 only if it matches the generated public schema. Do not use `merge:true` to remove leaked shared keys: omission would retain them.
4. Inventory active index/TTL definitions again before rollout and merge the two required indexes without deleting existing field overrides or TTL policies. During a coordinated maintenance window, activate the reviewed Firestore/Storage rules and indexes on the existing Firebase project; wait until indexes are ready. Old unfiltered Viewer queries will be refused. Do not relax rules to make legacy clients write again, and do not force deletion of indexes omitted by an out-of-date inventory.
5. Execute only the separately approved, reviewed cleanup plan. Include clean legacy records that need a v2 marker, existing LIVE posts and guestbook records. Review old gallery values in shared settings and deleted-photo/orphan Storage objects; do not automatically delete the only copy of a photograph.
6. Verify the audit again, then finalize the actual 1.6.0 publication metadata and build the reviewed release. Use existing GitHub Pages hosting only.
7. Verify real Google login/Drive consent with existing accounts, Owner/Copilota/Viewer isolation, and Safari/PWA on a physical iPhone. Emulator success does not certify active production rules, OAuth configuration, App Check, production index readiness, or physical-device behavior.

No step in this document authorizes production writes or deployment by itself.

## Rollback

Do not publish an untouched 1.5.16 build against v2 data. Preserve the original archive for provenance, and use a separately reviewed **1.5.16 compatibility build** retaining the current data splitter, schema-constrained queries, EUR calculations and secure LIVE components. Its overlay manifest identifies the exact backported files.

Keep hardened rules, indexes, current Firestore documents and conversion metadata. A rollback changes the frontend only; it never restores an old database backup, removes v2 markers, or reintroduces stale nominal currency values. Test the compatibility build against the same synthetic permissions and snapshot checks before approving its use. Existing queued writes from obsolete clients must stay blocked when they violate the schema.
