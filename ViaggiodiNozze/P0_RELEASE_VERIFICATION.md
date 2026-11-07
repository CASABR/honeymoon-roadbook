# Final frontend release gate - 2026-11-07

Status: READY FOR FRONTEND RELEASE, subject to the user's separate push/deploy authorization. Starting commit: a541913. No push, deployment, production access, Rules edit or backup modification was performed.

## The two previously failing suites

- LIVE preview: obsolete single-photo assertion. Commit 69abcf4 used pendingUploadPreview; 415856d replaced it with pendingUploadItems for multiple previews. The updated test verifies preview creation/rendering, no upload during selection, explicit confirmation, sequential uploads and clearing after success. PNG/JPEG/HEIC/HEIF and invalid-file checks execute the actual shared helper.
- Other assertions in the same suite were tied to replaced JSX labels/identifiers and PDF formatting. They now check the current role guards, marker guards, consent gate and opt-in condition without removing the assertions. The provider-specific privacy assertion follows the existing Cloudflare implementation; no Cloudflare implementation or settings changed.
- Real LIVE regression: the GPS-only mode had regained a planned-coordinate fallback and the initial mode had changed to both. Restored the previous GPS-first contract and made GPS-only return no coordinates when GPS is unavailable; planned markers remain excluded from GPS-only mode.
- Missing seeds: the cleanroom baseline 5e7160a already has no tracked private seed files. The privacy test incorrectly assumed those private fixtures still existed. Absent fixtures are now supported while any reintroduced private seed source fails the gate. All existing import, chunk, precache, secret, source-map, embedded-document and disabled-seeding checks remain. Negative controls verify that secret/import detectors still detect synthetic violations.

## Final results

- Production build: PASS (TypeScript + Vite + PWA; existing bundle/import warnings only).
- scripts/test_prebeta_final_corrections.cjs: PASS, 27 checks.
- scripts/test_public_bundle_privacy.cjs: PASS, 11 exclusion checks over 45 build files; private seed sources/imports/chunks and detected secrets all zero.
- scripts/test_p0_queue_release.cjs: PASS, production-module authorization/sync tests and real Chrome IndexedDB migration, isolation, payload retention, stale ACK, reopening, delete, storage-failure and migration-rollback cases.
- scripts/test_release_gate_emulator.cjs: PASS, 205 actual Rules matrix checks for Owner, Copilota, Viewer, Firebase anonymous, unauthenticated and revoked identities, using the unchanged lockdown snapshot. Includes a previously allowed identity removed from both membership representations, frozen synthetic 0000 and an operational synthetic trip.
- Production SyncService against actual emulator Rules: PASS. Pending payload survives anonymous -> historical Google Owner UID; a UID change alone sends nothing; verified Owner write is denied by lockdown and leaves prices, deposits, voucher and attachment payload intact; changed UID and offline state cannot reuse authorization.
- Git diff whitespace and scope: PASS. Only the two affected test files, the minimal LIVE correction, emulator/final-gate test runners and this report change.

One final build and affected-suite run was performed. The new emulator harness initially failed due to its synthetic JWT signature and an emulator missing Italian-language error bundle. The harness was corrected to use an unsecured emulator JWT and English Java resources, and only that failed emulator test was rerun to PASS. Rules were never changed to obtain PASS.

The reproducible command for this scoped gate is: node scripts/test_release_gate_final.cjs

## Rules and data isolation

Unmodified local production-lockdown snapshot: firestore.rules.lockdown, SHA-256 4AC30845C9A0C0715F6F7864B1AEA068E592CD75E51346A7D9752756C11CD558. The jar loads that exact file, and the test verifies its bytes remain unchanged. Emulator: loopback 127.0.0.1:8189, project demo-hounigo-release-gate, no export/import or real credentials. Synthetic emulator 0000 is unrelated to real trip 0000. No production Firestore endpoint is used. The existing lockdown intentionally continues to reject writes to real 0000 after a frontend release; retaining those local changes is expected, not a frontend release blocker.

## Post-deploy acceptance

Real Google OAuth popup/redirect on physical iPhone standalone PWA is COLLAUDO POST-DEPLOY. Confirm historical Owner UID and unchanged pending-count/payload after redirect/reopening. This device/provider acceptance step does not block authorization to publish the frontend. No claim is made that it has already been exercised on the physical iPhone.
