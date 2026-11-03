# Piano bonifica GitHub per HOUNIGO 1.5.1 (Focus Hotfix & Selettore Orario)

Nessuna operazione remota di riscrittura è eseguita senza autorizzazione esplicita.

## 1. Stato verificato della cleanroom locale

- **Cleanroom `main`**: commit `c9cc867cb161b97ca96a8be4ba86fe2aa4d41221` (`fcd1853`), codice HOUNIGO 1.5.1 completo con hotfix focus, TimePickerInput accessibile, TwoWheelTimePicker portal e moduli protetti.
- **Cleanroom `gh-pages`**: commit `89c341fe11f5121913035bf0a9f61f46d13dda5b` (`89c341f`), tree `f28866e7c2a0b3a3b4e210f6a0d0b7aac2f705a5` identico al bundle 1.5.1 attualmente pubblicato online (`a23cf31`).
- **Verifica privacy cronologia**: `PASS` (4.987 oggetti analizzati, 0 marker privati, 0 percorsi seed riservati rilevati).
- **Backup permanente verificato (fuori da C:\tmp e fuori dal repo)**:
  - Posizione: `C:\Users\CUSI\Documents\hounigo-backups\hounigo-cleanroom-151-complete.bundle` (verificato `bundle is okay`, 5 ref registrati).
  - Archivio VAPID: `C:\Users\CUSI\Documents\hounigo-backups\hounigo-vapid-rotation.json` (secret VAPID conservati separatamente e protetti).
  - Backup precedenti archiviati: `hounigo-cleanroom-pre-130.bundle`, `hounigo-cleanroom-130-complete.bundle`, `hounigo-cleanroom-140-complete.bundle`, `hounigo-cleanroom-140-push-complete.bundle`.

## 2. SHA remoti attuali verificati (sola lettura via ls-remote)

- `origin` (`CASABR/honeymoon-roadbook`):
  - `refs/heads/main`: `1dfd423f83b1538e652c80c59d1da5f564373df8`
  - `refs/heads/gh-pages`: `a23cf313e8aba8bd18e4ba488139859e0b23efb5`
- Fork `J4CIVY/honeymoon-roadbook`:
  - `refs/heads/main`: `17c544dcdeff31def3d63fe30f70e834aa51e247`

## 3. Gestione fork J4CIVY (account terzo separato)

Dato che `J4CIVY` è un account terzo non direttamente amministrabile da `CASABR`:
- **Richiesta privata da inviare al proprietario**:
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
3. The old tip SHA for `gh-pages` was: a23cf313e8aba8bd18e4ba488139859e0b23efb5
4. The new sanitized tip SHA for `main` is: c9cc867cb161b97ca96a8be4ba86fe2aa4d41221
5. The new sanitized tip SHA for `gh-pages` is: 89c341fe11f5121913035bf0a9f61f46d13dda5b

Additionally, a public fork exists at:
https://github.com/J4CIVY/honeymoon-roadbook (tip SHA: 17c544dcdeff31def3d63fe30f70e834aa51e247)
This fork was created by a third party and contains the historical commits. Could you please advise on GitHub's policy and technical steps to unlink or clean the cached commit objects across the network fork cluster to ensure the exposed data is completely purged?

Thank you for your assistance.
```

## 5. Procedura di sostituzione atomica (con force-with-lease)

NON ESEGUIRE SENZA ESPLICITA AUTORIZZAZIONE DEL PROPRIETARIO:

```powershell
git -C C:\tmp\hounigo-cleanroom push --atomic https://github.com/CASABR/honeymoon-roadbook.git c9cc867cb161b97ca96a8be4ba86fe2aa4d41221:refs/heads/main --force-with-lease=refs/heads/main:1dfd423f83b1538e652c80c59d1da5f564373df8 89c341fe11f5121913035bf0a9f61f46d13dda5b:refs/heads/gh-pages --force-with-lease=refs/heads/gh-pages:a23cf313e8aba8bd18e4ba488139859e0b23efb5
```
