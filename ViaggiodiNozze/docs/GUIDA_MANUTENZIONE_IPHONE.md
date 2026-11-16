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
3. Compila i campi (protetti da blocco di sicurezza predefinito):
   - **Branch / Commit**: lascia `main` (oppure digita il branch da verificare/pubblicare).
   - **dry_run**: è **attivo per impostazione predefinita** (✅). Se tocchi subito "Run workflow", eseguirà solo una prova cloud senza toccare il sito online.
   - **Per pubblicare realmente**:
     1. Disattiva la casella **`dry_run`** (toglile la spunta).
     2. Nel campo **confirm**, digita esattamente la parola `CONFERMA`.
4. Tocca il pulsante verde **"Run workflow"**.
5. **Cosa vedi a schermo**:
   - Se `dry_run` era attivo (prova): vedrai il job **Verifica, Compilazione & Pacchetto PWA** completarsi in verde ✅, mentre il job **Pubblicazione Nativa** risulterà saltato (grigio). Nessuna modifica sarà apportata al sito online.
   - Se hai disattivato `dry_run` e digitato `CONFERMA`: il primo job compila e prepara l'artefatto, poi il secondo job distribuisce direttamente l'artefatto sul server CDN di GitHub Pages in circa **90 secondi**.

---

## 4. Come ripristinare una versione precedente (Rollback d'emergenza)

Se dopo una modifica l'app mostra un errore o un comportamento indesiderato durante il viaggio:

1. Apri Safari su:
   `https://github.com/CASABR/honeymoon-roadbook/actions/workflows/deploy.yml`
2. Tocca **"Run workflow"**.
3. Nel campo **Branch, commit SHA o tag**, inserisci il riferimento della versione stabile:
   - **Versione 1.6.6 stabile**: `a3207aa` (o tag `v1.6.6`)
   - **Versione 1.6.5 precedente**: `32e9449` (o tag `v1.6.5`)
4. Disattiva la casella **`dry_run`** e digita `CONFERMA`.
5. Tocca **"Run workflow"**.
6. GitHub Actions prenderà quella versione, inietterà automaticamente la compatibilità di compilazione se il vecchio commit non conteneva `react-router-dom`, compilerà la PWA e la rimetterà online in meno di 2 minuti.

---

## 5. Riepilogo Operazioni

| Operazione | Chi la esegue | Dove |
| :--- | :--- | :--- |
| Scrivere il codice e preparare il branch | **ChatGPT** | Connessione GitHub automatica |
| Compilare, eseguire lint e test automatici | **GitHub Actions** (cloud gratuito) | Tab `Actions` su GitHub |
| Verificare l'esito dei test | **Tu dall'iPhone** | Notifica GitHub o pagina `Actions` |
| Autorizzare il deploy in produzione | **Tu dall'iPhone** | Pulsante `Run workflow` con `CONFERMA` |
| Ripristino rapido (Rollback) | **Tu dall'iPhone** | `Run workflow` con SHA stabile (es. `a3207aa` o `32e9449`) |
