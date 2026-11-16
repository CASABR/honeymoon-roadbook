# Guida alla Manutenzione e Pubblicazione da iPhone (Senza PC)

Questa guida spiega come modificare, verificare e pubblicare **HOUNIGO** direttamente dall'iPhone durante il viaggio di nozze, in modo 100% gratuito e senza usare il computer.

---

## 1. Come chiedere una modifica a ChatGPT

Quando desideri correggere o ritoccare qualcosa durante il viaggio:

1. **Apri l'app ChatGPT su iPhone**.
2. **Descrivi chiaramente la modifica** indicando:
   - Quale elemento o schermata vuoi modificare (es. *tappe*, *orari*, *testo*, *card*).
   - Cosa deve fare la modifica.
   - **Regola fondamentale**: chiedi sempre a ChatGPT di **lavorare su un branch separato** (es. `work/fix-orari-tappe`), senza toccare direttamente `main` e senza pubblicare nulla.
3. **Esempio di messaggio per ChatGPT**:
   > *"Voglio aggiornare l'orario della tappa del 30 dicembre alle ore 10:00. Prepara la modifica sul branch `work/aggiorna-tappa-30dic` nel repository `CASABR/honeymoon-roadbook`. Non pubblicare e non toccare il branch main."*

---

## 2. Come verificare che la modifica sia pronta e superi i test

ChatGPT preparerà la modifica e creerà una Pull Request (o un push sul branch).

1. Apri **Safari** (o l'app **GitHub**) sul tuo iPhone e vai su:
   `https://github.com/CASABR/honeymoon-roadbook/actions`
2. Vedrai l'azione **"CI - Verifica & Test HOUNIGO"** avviata automaticamente sul tuo branch.
3. Entro **60-90 secondi**, vedrai una **spunta verde** ✅:
   - Ha controllato che il codice non abbia errori.
   - Ha verificato che la compilazione PWA funzioni.
   - Ha eseguito tutti i test di sicurezza e integrità dati.
4. Se vedi una ❌ rossa, la modifica ha un problema: puoi dire a ChatGPT *"I test su GitHub sono falliti, correggi l'errore"* prima che qualunque cosa vada online.

---

## 3. Come pubblicare la nuova versione dal tuo iPhone

Quando la modifica è approvata e unita in `main`:

1. Su iPhone, apri Safari su:
   `https://github.com/CASABR/honeymoon-roadbook/actions/workflows/deploy.yml`
2. Tocca il pulsante **"Run workflow"** (in alto a destra).
3. Compila i due campi:
   - **Branch / Commit**: lascia `main` (oppure digita il branch da pubblicare).
   - **Prova senza pubblicare (Dry run)**:
     - Se vuoi fare solo una prova di compilazione cloud: seleziona la casella ✅ *dry_run*.
     - Se vuoi pubblicare davvero online: lascia la casella non selezionata e lascia scritto `CONFERMA`.
4. Tocca il pulsante verde **"Run workflow"**.
5. In circa **1 minuto**, GitHub Actions compilerà l'app in cloud e la pubblicherà automaticamente su GitHub Pages (`gh-pages`).

---

## 4. Come ripristinare una versione precedente (Rollback d'emergenza)

Se dopo una modifica l'app mostra un errore o un comportamento indesiderato:

1. Apri Safari su:
   `https://github.com/CASABR/honeymoon-roadbook/actions/workflows/deploy.yml`
2. Tocca **"Run workflow"**.
3. Nel campo **Branch, commit SHA o tag**, inserisci lo SHA dell'ultima versione sicuramente funzionante:
   - Esempio versione 1.6.6: `17606cb`
   - Esempio versione 1.6.5: `3136582`
4. Digita `CONFERMA` e tocca **"Run workflow"**.
5. GitHub Actions prenderà immediatamente quella vecchia versione, la ricompilerà e la rimetterà online, annullando il problema in meno di 2 minuti.

---

## 5. Riepilogo Operazioni

| Operazione | Chi la esegue | Dove |
| :--- | :--- | :--- |
| Scrivere il codice e preparare il branch | **ChatGPT** | Connessione GitHub automatica |
| Compilare, eseguire lint e test automatici | **GitHub Actions** (cloud gratuito) | Tab `Actions` su GitHub |
| Verificare l'esito dei test | **Tu dall'iPhone** | Notifica GitHub o pagina `Actions` |
| Autorizzare il deploy in produzione | **Tu dall'iPhone** | Pulsante `Run workflow` su `deploy.yml` |
| Ripristino rapido (Rollback) | **Tu dall'iPhone** | `Run workflow` inserendo lo SHA precedente |
