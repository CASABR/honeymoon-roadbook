# P0 release verification ? 2026-11-07

Release status: HOLD. No push or deployment performed.

The queue key is a JSON tuple of trip ID, normalized entity type and entity ID. IndexedDB schema v2 migrates every valid v1 record in a single upgrade transaction, preserving payload, timestamp and mutation ID. Ambiguous records abort the complete upgrade without changing the original database. Browser persistence failures propagate instead of silently using volatile memory.

Pending edits survive authorization revocation and remain isolated from public settings. Remote writes require a server-verified role matching the current UID and trip, an online connection and no recorded revocation. UID/authorization changes during a write prevent acknowledgement and preserve the pending payload. Firestore Rules remain the final server-side authority; no rules were changed. Retry runs are serialized and stale acknowledgements cannot remove newer edits.

## PASS
- scripts/test_p0_queue_release.cjs: actual production modules with mocked Firebase; Google popup and redirect preserve the registered Owner UID; anonymous transition, denied writes, UID changes mid-write and authorized replay. Actual Chrome IndexedDB: legacy migration, identical entity IDs in two synthetic trips, payload preservation, stale acknowledgements, module reopening, deletes, scoped clear, persistence failure and atomic rollback on conflicting legacy records.
- scripts/test_deadlines.cjs: 11 checks.
- scripts/test_step1_semantic_preservation.cjs: 4 checks.
- test_updatedat_and_bookings_voucher_suite.cjs: 7 checks.
- scripts/test_release_versioning.cjs: 24 checks.
- scripts/test_step3_safe_duplication.mjs: 6 checks.
- test_trip_discovery_unit.mjs: account switching and reopening scenarios.
- scripts/test_price_helper.ts: 5 groups executed through TypeScript transpilation with console.assert converted to throwing assertions.
- npm run lint: exit 0, repository warnings remain.
- npm run build: TypeScript and production PWA build pass, bundle-size/import warnings remain.

## FAIL / incomplete validation
- scripts/test_prebeta_final_corrections.cjs fails on the obsolete pendingUploadPreview identifier: the unchanged LIVE implementation already uses pendingUploadItems. The failure is present independently of this P0 change.
- scripts/test_public_bundle_privacy.cjs cannot run because src/storage/seedActivities.ts is absent from HEAD and the working tree.
- Real Google OAuth on physical iOS standalone PWA is not exercised. Popup/redirect checks use Firebase mocks and do not establish browser/provider compatibility.
- Deployed Firebase Rules were neither modified nor revalidated remotely. Permission-denied behavior is tested using mocked Firebase writes, not an emulator or production writes.

Trip 0000, backups, Firestore Rules and Cloudflare were not modified. Tests use synthetic trips only. Existing unrelated source files were not edited by this P0 task. Repository HEAD advanced during verification and included the working-tree changes, including the OAuth companion implementation. Final cleanup removes the generated Chrome test profiles that became tracked in that intervening commit and ignores future test profiles.
