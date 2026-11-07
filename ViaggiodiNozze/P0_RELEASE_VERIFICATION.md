# HOUNIGO — Release Candidate Verification & Handoff (Missione Jarvis)

**Date:** 2026-11-07
**Status:** RELEASE CANDIDATE READY LOCALLY (awaiting explicit user authorization for `git push` / `gh-pages` deploy and final post-deploy OAuth check on physical iPhone).
**Target Trip:** `0000` (Honeymoon starting 2026-11-28)
**Safety Guarantees Enforced:** Zero writes/migrations on remote Firestore `0000`, zero changes to `firestore.rules` or `firestore.rules.lockdown`, zero changes to Cloudflare Worker/D1, zero secrets or private seeds in bundle or git history, zero push/deploy executed.

---

## 1. Consolidated Fixes in This Release Candidate

### A. P0 Security, Authentication & Persistence Consolidation (Fase 1)
1. **iOS Standalone PWA Google OAuth Recovery (`src/App.tsx`, `src/services/accountService.ts`, `src/components/modals/TripSelectorModal.tsx`)**:
   - `App.tsx` waits for `authStateReady()` and `checkPendingRedirectResult()` to resolve before allowing `signInAnonymously(auth)` fallback, preventing a fresh anonymous UID from preempting a returning Google OAuth redirect on iOS standalone PWA.
   - `accountService.ts` tracks `houni_oauth_redirect_pending` in `sessionStorage` across `signInWithRedirect` and `getRedirectResult`, never auto-linking a new anonymous UID (`linkWithPopup`/`linkWithRedirect` disabled for Google recovery) so the historical Google account (`ownerUid`) is recovered directly.
   - `TripSelectorModal.tsx` exits cleanly on `res.code === 'auth/redirect-started'` without triggering an error alert before browser navigation.
2. **Backend-Driven Role & Vault Access (`src/utils/useAuthIdentity.ts`, `src/utils/authSecurity.ts`, `src/services/syncService.ts`)**:
   - Reading `private_credentials` (PNR, PIN, prices, deposits, chunked vouchers/attachments) and publishing to Firestore strictly require a verified cloud identity (`cloudRole === 'owner' || cloudRole === 'copilota'`) for the active trip (`uid === ownerUid` or active `/trips/{tripId}/members/{uid}`).
   - `useAuthIdentity.ts` records verified member identity (`recordVerifiedTripAuth(tripId, activeUser.uid, memRole)`) so temporary offline/unverified transitions retain local editing capability (`canMutateLocally`) without granting vault access or cloud writes to unauthorized/revoked sessions.
   - Explicit backend revocation (`viewer` or removed membership) purges cached sensitive data and isolated queue entries for that trip.
3. **Isolated Persistent Queue & Local Persistence (`src/storage/pendingPushQueue.ts`, `src/services/syncService.ts`, `src/storage/storageService.ts`)**:
   - Pending cloud mutations are stored exclusively in the dedicated IndexedDB database `HounigoLocalQueueDB` (store `pending_pushes`, keyed by `[tripId, entityType, dataId]`), never in the synced `settings` store.
   - Notes (`NoteViaggioView`), deadlines (`scadenza`), prices/deposits (`cost`, `acconto`, `depositPaid`, `paymentStatus`), and chunked attachments survive app close/reopen, offline usage, and Firestore lockdown (`permission-denied`).

### B. Visual & UX Bug Fixes (Fase 2)
1. **LIVE Photo Lightbox Centered via Portal (`src/views/altro/LiveEditorialExperience.tsx`)**:
   - Rendered both the full-screen photo lightbox and the multi-photo upload preview modal via `createPortal(..., document.body)` so parent containers with `transform` / `animate-fade-in` / `backdrop-filter` or scroll offsets cannot displace the fixed overlay.
   - Locked `document.body.style.overflow = 'hidden'` while open and restored on close.
   - Configured the lightbox with `fixed inset-0 z-[9999]`, iOS `env(safe-area-inset-top/bottom)` padding, a flex-centered stage (`items-center justify-center overflow-hidden`), `<img className="block h-auto w-auto max-h-[calc(100dvh-9.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-8rem)] mx-auto my-auto object-contain rounded-xl shadow-2xl" />`, and floating prev/next controls.
   - Verified in headless Chrome across vertical (9:16), horizontal (16:9), and panoramic (24:9) photos on both iPhone 15 Pro (`393x852`) and Desktop (`1280x900`) viewports.
2. **Confirmed Time ("Orario Confermato") Red Highlight & Label (`src/index.css`, Cards, Forms, `storageService.ts`, `OggiView.tsx`, `TimelineItemDetailModal.tsx`)**:
   - Added unlayered `.hounigo-ds-time-stamp.hounigo-ds-time-stamp-confirmed` rule in `src/index.css` (`color: #E11D48; background-color: #FFF1F2; border: 1px solid rgba(225, 29, 72, 0.38); font-weight: 900;` and dark-mode `#FF6B5F`).
   - Updated `AttivitaCard.tsx`, `TappaCard.tsx`, `RistoranteCard.tsx`, and `ShoppingCard.tsx` so `timeStatus === 'confermato'` renders `Ore HH:MM · Confermato` in red (`#E11D48`), never `Indicativo`, including when `AttivitaCard` has a distinct meeting time or is a `Spot fotografico`.
   - Fixed `LegacyPhotoStopForm` in `AttivitaForm.tsx` to preserve `timeStatus`, `openingHours`, `attachments`, `lightWindow`, and `photoSubject`, and made the `[✓ Confermato] [~ Indicativo]` selector always visible in `AttivitaForm`, `TappaForm`, `RistoranteForm`, and `ShoppingForm`.
   - Updated `OggiView.tsx` hero focus banner and `TimelineItemDetailModal.tsx` to highlight confirmed times in red (`ORE HH:MM · CONF.`).
3. **Modal Portal Centering (`src/views/altro/NoteViaggioView.tsx`, `src/views/altro/GestioneViaggioView.tsx`)**:
   - Wrapped note creation/edit and deletion modals (`NoteViaggioView.tsx`) and member removal modal (`GestioneViaggioView.tsx`) in `createPortal(..., document.body)` to prevent scroll-offset clipping on mobile viewports.

---

## 2. Verification Matrix Executed Locally

| Suite / Verification Check | Command | Scope | Result |
| :--- | :--- | :--- | :--- |
| TypeScript & Production Build | `npm run build` | `tsc -b && vite build` + PWA SW precache (45 files) | **PASS** |
| Pre-Beta & LIVE Suite (27 checks) | `node scripts/test_prebeta_final_corrections.cjs` | iOS HEIC/HEIF, LIVE multi-preview, GPS-first map, privacy, PDF, SW precache | **PASS (27/27)** |
| Public Bundle Privacy Gate | `node scripts/test_public_bundle_privacy.cjs` | 0 private seeds, 0 source maps, 0 secrets across 45 build files | **PASS (11/11)** |
| P0 Auth & Isolated Queue Suite | `node scripts/test_p0_queue_release.cjs` | UID/trip auth binding, Google popup/redirect recovery, `HounigoLocalQueueDB` isolation | **PASS** |
| P0 iPhone Regressions Suite | `node scripts/test_p0_iphone_regressions.cjs` | Vault auth guard, note persistence across reopen, chunked vouchers, prices/deadlines | **PASS (4/4)** |
| P0 Final Blocking Checks | `node scripts/test_p0_final_blocking_checks.cjs` | Queue isolation, 239 `private_credentials` price recovery (equal timestamps), revocation | **PASS (3/3)** |
| Firestore Lockdown Emulator Gate | `node scripts/test_release_gate_emulator.cjs` | 205 Rules matrix checks on `firestore.rules.lockdown` + SyncService lockdown retention | **PASS (205/205)** |
| Deadlines Suite | `npm run test:deadlines` | Deadline lifecycle, statuses, tombstones, Owner/Copilota permissions | **PASS (11/11)** |
| Release Versioning Suite | `npm run test:versioning` | Version alignment (`1.5.7`), changelog, service worker update handling | **PASS (24/24)** |
| UX Chronology & Import Suite | `npm run test:ux-refinements` | Timeline sorting, midnight times, layovers, Taxi, Photo Spot, Copilota editor, import queue | **PASS (12/12)** |
| Free Architecture Suite | `npm run test:free-architecture` | Cloudflare Worker AI binding, push queue gating, zero frontend secrets | **PASS (7/7)** |
| Phase 2A & 2B Headless Chrome UI | `verify_jarvis_phase2_ui.cjs` | LIVE lightbox portal centering (393x852 & 1280x900) + 5 confirmed card types in red `#E11D48` | **PASS** |
| Full Scoped Release Gate | `node scripts/test_release_gate_final.cjs` | Build + Pre-beta + Privacy + Queue + Emulator + Git whitespace/status/scope | **PASS (8/8)** |

---

## 3. Post-Deploy Real iPhone Checklist (Owner & Copilota)

Once the frontend is published to `gh-pages`, perform this 5-minute acceptance check on the physical iPhones before unlocking Firestore:

1. **Aggiornamento PWA (Owner & Copilota)**:
   - Aprire la PWA dalla schermata Home su iPhone con connessione attiva, attendere il banner/ricaricamento automatico del Service Worker (versione `1.5.7`) oppure chiudere dallo switcher iOS e riaprire.
2. **Recupero Identità Google (iPhone Owner)**:
   - Aprire **Altro → Account e Sincronizzazione** (o il selettore viaggio) e toccare **Accedi con Google**.
   - Completare il login Google e verificare che il badge mostri **Organizzatore (Owner)** e che l'UID corrisponda allo storico `ownerUid` del viaggio `0000` (senza creazione di nuovi UID anonimi).
3. **Visibilità Prezzi, PNR, PIN e Allegati (Owner & Copilota)**:
   - Aprire una card Alloggio/Volo/Attività: verificare che prezzi, caparre, PNR/PIN (nel retro card) e allegati/voucher multi-chunk si aprano regolarmente.
4. **Persistenza Locale Note, Scadenze e Orario Confermato**:
   - Creare una nota di prova in **Note Viaggio** e impostare una tappa/attività su **✓ Confermato**: verificare che l'orario sul fronte card appaia in **rosso (`Ore HH:MM · Confermato`)**.
   - Chiudere completamente la PWA su iPhone e riaprirla: verificare che la nota e l'orario confermato siano ancora presenti (conservati in `ViaggiodiNozzeDB` e nella coda isolata `HounigoLocalQueueDB` anche con lockdown attivo).
5. **Galleria Foto LIVE**:
   - Aprire **Altro → Live**, scorrere fino al diario e toccare una foto (verticale e orizzontale): verificare che il lightbox si apra centrato a tutto schermo senza tagli o spostamenti.

---

## 4. Exact Controlled Release Procedure (Upon User Authorization)

When ready to publish the Release Candidate to production (`main` + `gh-pages`):

```powershell
cd c:\Users\CUSI\Documents\App-viaggio-di-nozze\ViaggiodiNozze

# 1. Final gate verification
node scripts/test_release_gate_final.cjs

# 2. Fast-forward push to main (from parent repo root)
cd c:\Users\CUSI\Documents\App-viaggio-di-nozze
git push origin main

# 3. Publish static PWA bundle to GitHub Pages
cd c:\Users\CUSI\Documents\App-viaggio-di-nozze\ViaggiodiNozze
npm run deploy
```
