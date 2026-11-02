# Piano bonifica GitHub per HOUNIGO 1.4.0

Nessuna operazione remota è autorizzata o eseguita da questo documento.

## 1. Stato verificato della cleanroom locale

- **Cleanroom `main`**: commit `5e7160a`, codice completo di HOUNIGO 1.4.0 sovrapposto alla cronologia pulita senza importare commit compromessi.
- **Cleanroom `gh-pages`**: commit `918da67`, tree identico al bundle 1.4.0 attualmente pubblicato (`7a2b499`).
- **Verifica privacy cronologia**: `PASS` (4.920 oggetti analizzati, 0 marker privati, 0 percorsi seed riservati rilevati).
- **Sicurezza preservata**: hotfix contro le cancellazioni automatiche (`d95858f`) pienamente attivo e verificato.
- **Backup permanente verificato (fuori da C:\tmp e fuori dal repo)**:
  - Posizione: `C:\Users\CUSI\Documents\hounigo-backups\hounigo-cleanroom-140-complete.bundle` (SHA-1 verificato, include `main` e `gh-pages`).
  - Archivio VAPID ruotata: `C:\Users\CUSI\Documents\hounigo-backups\hounigo-vapid-rotation.json`.
  - Backup precedenti archiviati: `hounigo-cleanroom-pre-130.bundle`, `hounigo-cleanroom-130-complete.bundle`.

## 2. SHA remoti attuali verificati (sola lettura)

- `origin` (`CASABR/honeymoon-roadbook`):
  - `refs/heads/main`: `1dfd423f83b1538e652c80c59d1da5f564373df8`
  - `refs/heads/gh-pages`: `7a2b499959e46257b2d38b7c380da5b20a0f2dcc`
- Fork `J4CIVY/honeymoon-roadbook`:
  - `refs/heads/main`: `17c544dcdeff31def3d63fe30f70e834aa51e247` (0 commit avanti, 112 commit indietro)

## 3. Gestione fork J4CIVY (account terzo separato)

Dato che `J4CIVY` è un account terzo non amministrabile da `CASABR`:
- **Richiesta formale e cortese da inviare al proprietario (tramite GitHub issue/email pubblica o messaggio)**:
  ```markdown
  Subject: Important: Request to delete or re-synchronize fork of honeymoon-roadbook

  Hi,
  We noticed that you maintain a public fork of CASABR/honeymoon-roadbook.
  The original repository has recently undergone a critical history rewrite and privacy sanitization to remove sensitive personal travel details that were accidentally committed in early stages.

  Because your fork still references the old commits, we kindly ask you to either:
  1. Delete your fork `J4CIVY/honeymoon-roadbook` from repository Settings; or
  2. Re-create / re-synchronize it from the new clean `main` branch.

  Thank you very much for your understanding and cooperation!
  ```

## 4. Segnalazione formale per GitHub Support (in inglese)

Da inviare tramite [GitHub Support](https://support.github.com/contact) (Categoria: *Account or Data Privacy / Repository Data*):

```markdown
Subject: Request to purge cached commits and pull request refs following history rewrite for sensitive data removal

Dear GitHub Support Team,

I am writing on behalf of the owner of repository:
https://github.com/CASABR/honeymoon-roadbook

We have recently rewritten the git history of this repository to permanently purge accidentally exposed sensitive personal data and booking identifiers from early development commits. The sanitized history is now in place on both the `main` and `gh-pages` branches.

We request your assistance with the following:
1. Please run garbage collection (`git gc --prune=now`) on `CASABR/honeymoon-roadbook` to purge unreachable / orphaned commits, cached pull request refs, and web view caches associated with the old commit SHAs.
2. The old tip SHA for `main` was: 1dfd423f83b1538e652c80c59d1da5f564373df8
3. The old tip SHA for `gh-pages` was: 7a2b499959e46257b2d38b7c380da5b20a0f2dcc
4. The new sanitized tip SHA for `main` is: 5e7160adfa7d93a0a4135d2b1925efd4936ffef1
5. The new sanitized tip SHA for `gh-pages` is: 918da67060dfcac7b8280e0462780b9fba9e76cc

Additionally, a public fork exists at:
https://github.com/J4CIVY/honeymoon-roadbook (tip SHA: 17c544dcdeff31def3d63fe30f70e834aa51e247)
This fork was created by a third party and contains the historical commits. Could you please advise on GitHub's policy and technical steps to unlink or clean the cached commit objects across the network fork cluster to ensure the exposed data is completely purged?

Thank you for your assistance.
```

## 5. Procedura di sostituzione cronologia atomica (con force-with-lease)

Eseguire da PowerShell esclusivamente con autorizzazione esplicita:

```powershell
# 1. Verifica preliminare SHA
git ls-remote origin

# 2. Push atomico protetto con lease
git -C C:\tmp\hounigo-cleanroom push origin 5e7160adfa7d93a0a4135d2b1925efd4936ffef1:refs/heads/main --force-with-lease=refs/heads/main:1dfd423f83b1538e652c80c59d1da5f564373df8
git -C C:\tmp\hounigo-cleanroom push origin 918da67060dfcac7b8280e0462780b9fba9e76cc:refs/heads/gh-pages --force-with-lease=refs/heads/gh-pages:7a2b499959e46257b2d38b7c380da5b20a0f2dcc
```

## 6. Piano di verifica immediata post-sostituzione

Subito dopo il push:
1. `node scripts/verify_online_deploy.cjs` (verifica HTTP 200, script `index-*.js`, `manifest.webmanifest`, `favicon.svg`).
2. Verifica live Service Worker (`sw.js`).
3. Verifica HouniAI Cloudflare (`node scripts/test_houniai_secure_gateway.cjs`).
4. Scansione bundle pubblico (`node scripts/test_public_bundle_privacy.cjs`).
5. Verifica coerenza commit (`git -C C:\tmp\hounigo-cleanroom log -n 5 --oneline`).

## 7. Revoca e rotazione credenziali

- **Chiavi VAPID Web Push**: vecchia chiave deprecata, nuova coppia generata in `hounigo-vapid-rotation.json` pronta per secret Wrangler.
- **Chiave Firebase Web API**: verificare restrizioni HTTP referrer (`https://casabr.github.io/*`) nella console Google Cloud API Credentials.
- **Codici prenotazione e dati personali**: non sono credenziali informatiche e non vanno alterati nei viaggi reali.

## 8. Prevenzione reintroduzione da vecchi clone

- Tutti i vecchi cloni locali della cronologia pre-bonifica devono essere eliminati o ri-clonati (`git clone https://github.com/CASABR/honeymoon-roadbook.git`).
- Configurare su GitHub (Settings -> Branches) la protezione sul branch `main` per consentire push solo dopo fast-forward o richiedere pull request da branch puliti.
