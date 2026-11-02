# HouniAI e push: attivazione controllata

Il codice locale usa una Cloud Function callable autenticata per applicare membership Owner/Copilota, App Check e limiti 6 richieste/minuto e 40/giorno per utente e viaggio. La produzione 1.2.0 resta invariata finché i prerequisiti seguenti non sono autorizzati e completati.

## Sequenza manuale unica

1. In Firebase Console aprire **Usage and billing > Details & settings** e verificare il piano. Se è Spark, autorizzare esplicitamente il passaggio a Blaze prima di distribuire Functions o Scheduler; impostare budget e avvisi in Google Cloud Billing.
2. In **App Check > Apps**, selezionare la web app HOUNIGO, registrare **reCAPTCHA Enterprise**, autorizzare `casabr.github.io` e usare la chiave sito pubblica in `VITE_FIREBASE_APP_CHECK_SITE_KEY`. Non attivare enforcement per Firestore, Auth o Storage.
3. Pubblicare prima un frontend di collaudo con la site key e verificare desktop, Android Chrome e PWA iPhone. Usare il debug token generato dalla console solo in sviluppo; non inserirlo in file o bundle.
4. Creare o ruotare la credenziale Gemini server-side con `firebase functions:secrets:set GEMINI_API_KEY`. Non usare variabili `VITE_*`, Firestore o file statici per il valore privato.
5. Generare una nuova coppia VAPID con `node scripts/generate_vapid.cjs` in una sessione privata. Salvare `VAPID_PRIVATE_KEY` e `VAPID_MAILTO` in Secret Manager, mettere solo la nuova `VAPID_PUBLIC_KEY` nell'ambiente frontend e non conservare l'output nei log.
6. Dopo autorizzazione separata, distribuire esclusivamente le Functions richieste. Abilitare enforcement App Check per Cloud Functions solo dopo il collaudo; le Rules dei dati non vanno modificate da questa procedura.
7. Le subscription legate alla vecchia VAPID devono essere disattivate e riattivate da ogni dispositivo. Verificare Owner e Copilota su un viaggio sintetico; Viewer, altro viaggio e App Check assente devono essere negati.
8. Provare chat, PDF, immagine, cinque prenotazioni approvate singolarmente, input invalido, offline e quota. Provare push con app aperta, in background, chiusa e schermo bloccato: accettazione server e visualizzazione fisica sono esiti distinti.
9. Solo dopo il collaudo preparare la release SemVer e il deploy frontend. Non usare il viaggio `0000`, non cancellare IndexedDB e non distribuire Rules o Functions senza nuova autorizzazione.

## Costi e protezioni

Cloud Functions, Secret Manager e Cloud Scheduler richiedono Blaze e sono a consumo. Con pochi tester il minimo teorico è **0 USD/mese** finché si resta nelle quote gratuite: Functions include 2 milioni di invocazioni/mese, Scheduler include 3 job/account e Secret Manager include 6 versioni attive e 10.000 accessi/mese. Oltre soglia, Gemini 3.1 Flash-Lite costa indicativamente 0,25 USD per milione di token input e 1,50 USD per milione output; verificare sempre i prezzi correnti prima dell'attivazione. Gli avvisi di budget non bloccano la spesa.

Fonti ufficiali: [Firebase pricing](https://firebase.google.com/pricing), [Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing), [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing), [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

Il dispatcher usa query limitate, job deterministici e nessuna scansione globale; HouniAI prova solo modelli Flash-Lite/Flash stabili e applica quote conservative.
