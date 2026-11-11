# HOUNIGO — Preflight & Procedura di Rilascio Coordinato 1.6.0 e Rollback Compatibile

Stato live verificato in sola lettura (`2026-11-11`):
- Frontend live (`https://casabr.github.io/honeymoon-roadbook/`, `refs/heads/gh-pages` `07997561`): bundle `index-DPD6Gx-r.js` pre-1.6.0 (privo di `publicSchemaVersion` e conversione `currencyService`).
- Firestore Rules attive (`cloud.firestore` aggiornate `2026-11-08T17:45:55Z`, `508` righe): prive dei controlli schema v2 e dei nuovi metadati valutari. Note `firebaserules/releases`: nessun ruleset `firebase.storage` restituito dalla API releases.
- Indici Firestore live: `0` indici compositi attivi, `1` override singolo `*` (`ttl: false`, preservato in `ViaggiodiNozze/firestore.indexes.json`).
- Configurazioni `firestore.rules` e `storage.rules` alla radice del repository e in `ViaggiodiNozze/` sono identiche per SHA-256 (`f2a0a3cf...` e `25f5c69...`); `ViaggiodiNozze/firestore.freeze.rules` implementa il blocco temporaneo scritture su tutti i 19 viaggi.

**Nessuna scrittura o deploy è autorizzata da questo documento.**

## Orchestratore automatico e riprendibile (Ultimo Gate Operativo)

- Dry-run in sola lettura su produzione (`0` scritture): `cd ViaggiodiNozze && node scripts/release_160_orchestrator.cjs --mode=production --dry-run`
- Prova completa su emulatore isolato (freeze, crash/resume, fail-closed, riconciliazione offline, `19` viaggi): `cd ViaggiodiNozze && node scripts/test_release_gate_orchestration.cjs`
- Esecuzione reale (solo dopo via libera esplicito): `cd ViaggiodiNozze && node scripts/release_160_orchestrator.cjs --mode=production --execute-production --confirm=RELEASE_160_AUTHORIZED` (riprendibile con `--resume`, checkpoint in `backups/release-gate-checkpoint-160.json`, zero segreti nei log).

## Checklist eseguibile e porte GO / STOP (in ordine vincolato)

1. **Backup finale verificato (read-only — automatico)**
   - Comando: `cd ViaggiodiNozze && node scripts/snapshot_readonly_backup.cjs && node scripts/classify_and_plan_bonifica.cjs`
   - **Gate PASS:** SHA-256 valido, rilettura ok, `1.014+` condivisi, zero scritture reali. **STOP se:** errore HTTP, JSON illeggibile o checksum incoerente.
2. **Blocco server-side scritture concorrenti su tutti i 19 viaggi**
   - Attivazione temporanea di `ViaggiodiNozze/firestore.freeze.rules`: consente sole letture sicure e impone `if false` su tutte le scritture client (`1.5.16`, `1.6.0`, offline in rientro). Le modifiche locali offline restano in `HounigoLocalQueueDB` senza perdita di dati.
   - **Gate PASS:** regole freeze attive su tutti i 19 viaggi; transazioni server/REST autorizzate invariate. **STOP se:** fallisce l'applicazione delle regole di blocco.
3. **Indici compositi in anticipo (`0` downtime)**
   - Comando: `firebase firestore:indexes` (controllo preventivo) -> `firebase deploy --only firestore:indexes`
   - **Gate PASS:** entrambi gli indici (`updates` e `guest_messages`) risultano `READY`. **STOP se:** stato diverso da `READY` o errore creazione indici.
4. **Pubblicazione ponte frontend `1.6.0` (compatibile con regole attive e v2)**
   - Comandi: `cd ViaggiodiNozze && npm run build && node scripts/test_public_bundle_privacy.cjs && npm run deploy`
   - Nota sicurezza transizione: `1.6.0` gestisce in sicurezza record legacy puliti sotto regole attive (tenendo nascosti i record sporchi `requires_classification`) e commuta automaticamente a query `v2` appena le regole v2 entrano in vigore; aggiornare i client PWA prima di attivare il blocco query v2 riduce al minimo finestre di errore su Viewer legittimi.
   - **Gate PASS:** build exit `0`, privacy bundle `0` leak (`46` file), LIVE pubblico raggiungibile. **STOP se:** fallback bundle non raggiungibile o errori runtime in console.
5. **Bonifica transazionale dei 1.014 documenti (`663` sensibili, `5` legacy `orarioVisita`, `346` puliti + LIVE)**
   - Regola invariante: preservare sempre valori EUR più recenti in `private_credentials`, archiviare divergenze legacy in `privateNested._legacySharedConflict`, sostituire integralmente il doc condiviso (senza `merge:true`), marcare `publicSchemaVersion: 2`. **Escludere** dalla riscrittura pagamenti le `31` voci incerte del budget (`alloggio_16`, `alloggio_25`, 3 trasporti in checklist manuale).
   - **Gate PASS:** passaggio 2 idempotente a `0` scritture e `totGenerale` EUR su `0000` invariato (`12.542,78 €`). **STOP se:** fallisce una transazione o cambiano i totali EUR verificati.
6. **Verifica dati privati post-bonifica**
   - Comando: `node scripts/audit_shared_privacy.cjs --production-readonly --output ../backups/pre-bonifica-2026-11-11/post-bonifica-audit.json`
   - **Gate PASS:** `affectedDocuments === 0` e nessuna chiave sensibile in `live_feeds`. **STOP immediato se:** `affectedDocuments > 0` (non procedere con le regole fino a chiusura completa).
7. **Attivazione coordinata Firestore Rules v2 & Storage Rules**
   - Comando: `firebase deploy --only firestore:rules,storage` (dopo conferma indici `READY` al punto 3 e audit `0` al punto 6).
   - **Gate PASS:** regole v2 attive; eventuali vecchi client `1.5.16` offline ancora in coda con chiavi riservate o privi di split vengono bloccati server-side senza reintrodurre leak né resuscitare tombstone.
8. **Test rapido reale post-deploy (Owner / Copilota / Viewer / LIVE / GPS)**
   - Verificare con account reali: login Google + Picker/Drive, lettura/scrittura vault Owner & Copilota (incluso sync offline->online), Viewer con soli dati sanificati (`private_credentials` negato), LIVE cartoline + foto + delega GPS, Safari & PWA su iPhone fisico (Dynamic Island / tastiera).
9. **Controllo versioni & Rollback compatibile verificato**
   - Artefatto pronto e verificato in `backups/rollback-compat-1.5.16-v2/ViaggiodiNozze/dist` (`rollback-compatible-1.5.16-v2-dist.zip`, SHA-256 `d6973cd...`, `216` record / `940` valori privati verificati).
   - Comando emergenza (solo frontend; **mai** `1.5.16` grezza e **mai** rollback regole/database):
     `ViaggiodiNozze\node_modules\.bin\gh-pages.cmd -d C:\Users\CUSI\Documents\App-viaggio-di-nozze\backups\rollback-compat-1.5.16-v2\ViaggiodiNozze\dist --repo https://github.com/CASABR/honeymoon-roadbook.git`
