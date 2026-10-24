# Proposta minima Rules per LIVE GPS

Stato: patch locale validata su Firebase Emulator. Non distribuita.

## Schema

- `/live_feeds/{tripId}/gps_control/current`: lease privato, leggibile solo da Owner e Copilota autorizzato.
- `/live_feeds/{tripId}/locations/current`: ultimo punto pubblico in whitelist, leggibile anche senza autenticazione.

Il lease contiene esclusivamente `holderUid`, `holderDeviceId`, `status`, `updatedAt` ed `expiresAt`.
La posizione contiene esclusivamente `lat`, `lng`, `accuracy`, `city`, `country`, `updatedAt`, `publisherDeviceId` e `status`.

## Garanzie applicate

- Solo l'Owner crea, assegna, trasferisce, rinnova o riattiva il lease.
- Il destinatario deve essere l'Owner o un membro con ruolo `copilota` già esistente.
- Esiste un solo lease `current`; una riassegnazione invalida subito il dispositivo precedente.
- Il titolare può solo passare da `active` a `paused` o `stopped`, senza cambiare identità, dispositivo o scadenza.
- Pausa e arresto aggiornano lease e stato pubblico nello stesso batch atomico.
- Una posizione attiva richiede UID, device, stato e scadenza coerenti con il lease verificato tramite `getAfter`.
- `updatedAt` coincide con `request.time`; il lease dura al massimo 24 ore.
- Le coordinate attive sono limitate a una scrittura ogni 15 secondi.
- Viewer, estranei e ospiti non possono pubblicare coordinate né gestire il lease.
- Ospiti e Viewer leggono `locations/current` soltanto quando lease e posizione sono attivi, non scaduti e associati allo stesso dispositivo.
- Una posizione non aggiornata da oltre due minuti diventa illeggibile a Ospiti e Viewer anche se il dispositivo è offline e il lease non è ancora scaduto.
- Dopo pausa, arresto, revoca/trasferimento o scadenza, le coordinate non sono più leggibili pubblicamente; restano accessibili solo a Owner e Copilota autorizzati per gestione operativa.
- Non sono ammessi storico GPS, cancellazione client o campi aggiuntivi.
- Il trasferimento GPS non modifica `ownerUid`, membership o ruoli.

## File della patch

- `firestore.rules`
- `ViaggiodiNozze/firestore.rules`
- `ViaggiodiNozze/test_live_gps_rules_patch.cjs`

La copia nested delle Rules è stata inoltre riallineata alla whitelist `devices` già presente nella Rules root e richiesta dalla suite di regressione esistente.

## Rischio residuo

`holderDeviceId` è un identificatore client pseudonimo, non un'attestazione hardware. Le Rules impediscono due lease simultanei e respingono il vecchio dispositivo dopo il trasferimento, ma un client compromesso dello stesso utente che conosca l'identificatore potrebbe impersonare quel dispositivo. Una garanzia hardware richiederebbe infrastruttura server aggiuntiva, esclusa da questo sprint.

La posizione arrestata non viene cancellata automaticamente e non è più leggibile da ospiti o Viewer. Owner e Copilota autorizzati possono ancora consultarla per gestione operativa; non viene mantenuto uno storico.
