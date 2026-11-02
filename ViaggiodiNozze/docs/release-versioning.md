# Versioning e release HOUNIGO

`package.json` è la fonte unica della versione installata. Una build non modifica mai la versione.

## Regole SemVer

- `patch`: correzioni compatibili.
- `minor`: nuove funzionalità compatibili.
- `major`: modifiche incompatibili.

## Preparazione approvata

1. Proporre senza modificare file:
   `npm run release:prepare -- patch --date YYYY-MM-DD --note "Novità verificata"`
2. Dopo approvazione, ripetere aggiungendo `--approve`.
3. Verificare e committare `package.json`, `package-lock.json` e `release-draft.json`.
4. Eseguire test e build della release candidata.

## Pubblicazione della cronologia

1. Dopo l’approvazione alla pubblicazione, proporre:
   `npm run release:publish -- --date YYYY-MM-DD --source SHA`
2. Ripetere con `--approve` per spostare il draft nella cronologia distribuita e rigenerare `CHANGELOG.md`.
3. Eseguire nuovamente test, build e controllo privacy prima del deploy autorizzato.

La cronologia nell’app contiene solo release marcate come pubblicate; il draft non viene importato dal frontend.
