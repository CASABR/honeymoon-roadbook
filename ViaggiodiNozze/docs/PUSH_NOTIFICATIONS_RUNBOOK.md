# Notifiche push HOUNIGO

## Stato

Il frontend registra la subscription soltanto dopo la conferma di una callable autenticata. Le Cloud Functions verificano membership, viaggio, dispositivo e destinatario; il Service Worker PWA visualizza payload generici e apre una route interna alla base `/honeymoon-roadbook/`.

Il sistema non è ancora pubblicato. Il deploy delle Cloud Functions richiede un progetto Firebase sul piano Blaze, come indicato nella [documentazione Firebase](https://firebase.google.com/docs/functions/get-started). Il dispatcher usa un solo job pianificato ogni cinque minuti; Firebase indica tre job Cloud Scheduler gratuiti per account, poi un costo per job, ma restano possibili costi di esecuzione e rete descritti nella [documentazione delle funzioni pianificate](https://firebase.google.com/docs/functions/schedule-functions).

## Configurazione manuale obbligatoria

1. Ruotare la coppia VAPID precedente: la vecchia chiave privata è stata presente nella cronologia Git e non deve più essere usata.
2. Generare una nuova coppia in ambiente privato.
3. Configurare i secret Functions `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_MAILTO`.
4. Configurare la stessa chiave pubblica nel build frontend come `VITE_VAPID_PUBLIC_KEY`.
5. Attivare Blaze e impostare budget e avvisi prima del deploy backend.
6. Con una nuova autorizzazione, pubblicare nell'ordine: Rules, Functions, frontend.
7. Chiedere agli utenti già iscritti di riattivare le notifiche dopo la rotazione.

Non distribuire file `.env`, chiavi private o output del Secret Manager. La conferma `accepted` del provider non equivale alla consegna sul dispositivo.

## Collegamento scadenze

Le Scadenze mostrano già i promemoria nell'app e sincronizzano Owner/Copilota tramite la raccolta `note`, senza nuove Rules. L'invio push pianificato delle scadenze resta disattivato finché non vengono completati i passaggi manuali sopra e autorizzati deploy di Rules e Functions. Dopo la rotazione VAPID occorre invalidare le vecchie subscription lato backend, richiedere una nuova attivazione esplicita sui dispositivi e collaudare il dispatcher su un viaggio di test, mai sul viaggio `0000`.

## Verifiche automatizzate

```powershell
npm run build --prefix functions
node scripts/test_push_notifications.cjs
npm run build
node scripts/test_public_bundle_privacy.cjs
```

I test verificano fusi IANA, assenza di orari inventati, isolamento per viaggio, autorizzazione, deduplicazione, revoca, deep link, assenza di Service Worker concorrenti e menu desktop. Non provano la ricezione fisica.

## Collaudo Chrome desktop

1. Accedere a un viaggio di test come Owner e attivare le notifiche dal menu Impostazioni.
2. Inviare la notifica di prova e annotare separatamente `accettata dal server` e `ricevuta`.
3. Ripetere con app in primo piano, scheda in background e browser chiuso.
4. Bloccare lo schermo se il sistema operativo consente notifiche browser a schermo bloccato.
5. Fare clic sulla notifica e verificare l'apertura della vista Oggi del viaggio corretto.
6. Negare il permesso dalle impostazioni browser, riaprire l'app e verificare lo stato revocato.

## Collaudo Android

1. Installare la PWA da Chrome e consentire le notifiche soltanto dal pulsante dell'app.
2. Ripetere prova in primo piano, background, PWA chiusa e schermo bloccato.
3. Verificare icona, testo generico e deep link alla vista prevista.
4. Cambiare viaggio, riattivare esplicitamente e verificare che non arrivino notifiche del viaggio precedente.
5. Disattivare dall'app e confermare che il test successivo venga rifiutato.

## Collaudo iPhone

Web Push richiede iOS/iPadOS 16.4 o successivo e una web app aggiunta alla schermata Home; il permesso deve partire da un'interazione diretta, come documentato da [WebKit](https://webkit.org/blog/13878/).

1. Aprire il sito in Safari, aggiungerlo alla schermata Home e avviarlo dall'icona.
2. Attivare dal pulsante Impostazioni e concedere il permesso iOS.
3. Ripetere prova con PWA aperta, in background, chiusa e dispositivo bloccato.
4. Toccare la notifica e verificare l'apertura della vista Oggi.
5. Revocare il permesso in Impostazioni iOS e verificare la diagnostica nell'app.

## Verifica collaborativa

Usare esclusivamente un viaggio di test con due account autorizzati. Una modifica locale dell'Owner deve notificare il Copilota, e viceversa; l'autore non deve ricevere la propria notifica. Bootstrap, pull cloud, riconciliazione e sync forzata non devono produrre notifiche. Nessun test deve essere eseguito sul viaggio `0000` senza autorizzazione specifica.
