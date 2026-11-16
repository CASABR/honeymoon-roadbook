# Foto LIVE su KV Free — preparazione locale, 12 novembre 2026

## Stato e costo

Implementazione locale disattivata per impostazione predefinita. Nessun namespace,
account, abbonamento, binding o migrazione cloud creato/applicato; nessun deploy e
nessuna modifica a Firestore, regole o viaggio reale 0000. Nessuna nuova dipendenza.

Workers KV è incluso in Workers Free, senza necessità di passare a Paid o associare
un metodo di pagamento. Le quote gratuite sono limiti bloccanti, non credito da
consumare prima di un addebito. Questa garanzia vale mantenendo l'account sul piano
Free: NON attivare Workers Paid, R2, Images, trasformazioni a consumo o billing.

Il README del gateway documenta il precedente controllo Workers Free. La verifica
GET del piano attuale con il token Wrangler già presente ha restituito HTTP 403:
il piano corrente e l'assenza di abbonamenti/metodi di pagamento devono quindi
essere controllati nuovamente in dashboard PRIMA di qualsiasi attivazione.

Fonti ufficiali consultate:
- https://developers.cloudflare.com/kv/platform/pricing/
- https://developers.cloudflare.com/kv/platform/limits/
- https://developers.cloudflare.com/kv/concepts/how-kv-works/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/best-practices/read-replication/

KV Free: 1 GB per account, 100.000 letture/giorno, 1.000 scritture/giorno,
1.000 cancellazioni/giorno, 1.000 list/giorno; reset giornaliero 00:00 UTC.
Il traffico in uscita KV non ha un prezzo aggiuntivo. Workers Free ha 100.000
richieste/giorno per account e 10 ms di CPU per richiesta: niente disponibilità
illimitata garantita. Un abuso può esaurire le quote e rendere indisponibili anche
HouniAI/push dello stesso account, ma non deve generare addebiti sul piano Free.

## Architettura e protezioni

- Stesso Worker `hounigo-ai`, nuove sole route `/v1/live-photos/...`.
- Nuovo namespace KV `LIVE_PHOTOS` per JPEG binari. Nessun base64 o blob in Firestore.
- D1 `RATE_LIMITS` già esistente: due nuove tabelle isolate, nessuna modifica a
  contatori/schema AI o push. D1 serve per prenotazioni atomiche e revoche forti;
  KV da solo non è adatto a contatori concorrenti o revoche immediate.
- Il frontend ridisegna l'immagine su canvas JPEG, massimo 1600 px e 512.000 byte
  (500 KiB); qualità/dimensione adattive. Immagini semplici possono essere più
  piccole di 300 KB, senza gonfiarle artificialmente.
- Il server verifica firma/struttura JPEG baseline, dimensioni, limite byte anche
  su stream, rimuove nuovamente segmenti APP/EXIF/XMP/ICC e commenti, rifiuta SVG,
  formati inattesi, immagini incomplete e dati aggiunti in coda. Non è uno scanner
  antivirus o un decoder fotografico completo; l'output è servito solo come JPEG
  con `nosniff`.
- Upload, conferma e DELETE richiedono Origin HOUNIGO, ID token verificato mediante
  Firebase Auth REST e appartenenza attuale Owner/Copilota letta da Firestore con
  quel token. Il solo array `members` non basta; Viewer e anonimi sono rifiutati.
  Nessun service account o segreto Cloudflare è distribuito al frontend.
- L'ID pubblico è generato server-side con 192 bit casuali; nessuna API di elenco.
  Una foto pendente risponde 404 anche conoscendone l'URL. Solo chi l'ha caricata
  può confermarla: un cambio account non pubblica le immagini private precedenti.
- Dopo la scelta esplicita di condividere: upload pendente -> post LIVE con solo
  URL HTTPS -> conferma server del post v2 corrispondente -> stato pubblicato.
  Solo allora la lettura ospite senza login è ammessa. La foto pre-partenza usa
  lo stesso flusso. In caso di mancata conferma si tenta revoca e oscuramento del
  riferimento al post; l'interfaccia non segnala successo.
- DELETE verifica l'editor, scrive prima un tombstone D1 e poi tenta la rimozione
  KV. Ogni GET interroga D1 primary prima e dopo KV, senza cache HTTP/CDN: una
  replica KV obsoleta non scavalca il tombstone. Se la pulizia fisica KV fallisce,
  l'URL è comunque revocato da D1 e il file scade automaticamente.
- La copia locale viene conservata prima di tentare rete/pubblicazione; gli errori
  quota/non attivato sono espliciti. I tentativi offline esplicitamente richiesti
  restano nella coda fotografica locale esistente. Nessuna modifica alla sync dei
  dati del viaggio. Le gallerie private non vengono sincronizzate nei settings.

## Limiti applicativi deliberatamente conservativi

- 400 prenotazioni di upload TOTALI, massimo 512.000 byte ciascuna: meno di 205 MB.
  Il limite include errori e foto eliminate e NON viene rimborsato automaticamente.
  Questa scelta impedisce a retry, cancellazioni e corse concorrenti di superare
  il tetto reale. Cancellare una foto non ripristina uno slot. La quota non si
  azzera dopo il viaggio senza una revisione manuale autorizzata.
- 80 upload/giorno globali, 20/giorno per utente, 3/minuto per utente.
- 20.000 richieste di lettura/giorno, 1.000 mutazioni/giorno, 120 richieste/minuto
  per IP, 12 tentativi autenticazione/minuto per IP, 10 mutazioni/minuto per utente.
  La quota letture non blocca da sola il percorso di cancellazione autenticato.
- I contatori sono separati da HouniAI. Le quote complessive Workers/D1/KV restano
  condivise nell'account: controllare l'uso esistente prima dell'attivazione.
  Il provider può bloccare prima dei tetti applicativi se altre applicazioni
  consumano la quota. Nessun fallback verso un prodotto a pagamento.
- KV scade dopo 90 giorni dall'upload, anche per foto pubblicate. Non è un archivio
  permanente: conservare gli originali nel rullino. La copia locale nell'app usa
  lo spazio limitato del browser e non sostituisce un backup delle fotografie.
- KV è eventualmente consistente: subito dopo la pubblicazione un altro luogo
  può ricevere temporaneamente 404 e dover riprovare. La revoca di nuove letture
  passa invece da D1. Nessun servizio può cancellare copie già scaricate dagli ospiti.

## Attivazione futura — richiede autorizzazione separata

1. Dashboard Cloudflare dell'account esistente: verificare Workers Free, nessun
   abbonamento Paid/metodo di pagamento richiesto e almeno 205 MB KV disponibili
   nell'account. Se viene chiesta una carta o un piano a pagamento, FERMARSI.
2. Creare UN namespace KV (es. `hounigo-live-photos`) e collegarlo al Worker esistente
   come `LIVE_PHOTOS`. Non creare nuovi Worker o database.
3. Applicare soltanto `cloudflare/houniai-worker/migrations/0003_live_photos.sql`
   al D1 esistente `hounigo-ai-rate-limits`, dopo backup secondo il processo già
   usato. È solo CREATE TABLE/INDEX; non eseguire vecchie migrazioni alla cieca,
   non svuotare contatori/tabelle AI o push. È possibile usare la console SQL D1.
4. Per conservare il binding nei successivi deploy, inserire nel wrangler.jsonc
   locale, solo dopo aver ottenuto l'ID reale:

   ```json
   "kv_namespaces": [{ "binding": "LIVE_PHOTOS", "id": "ID_REALE_DEL_NAMESPACE" }]
   ```

   Conservare tutti i binding AI/D1, cron, variabili e secret esistenti. Il secret
   `FIREBASE_WEB_API_KEY` già usato dal gateway deve rimanere configurato.
5. Solo dopo il controllo Free e l'autorizzazione, impostare
   `LIVE_PHOTOS_ENABLED="true"` e `LIVE_PHOTOS_FREE_PLAN_CONFIRMED="true"` nella
   configurazione che verrà distribuita. Distribuire i moduli del Worker con il
   processo già usato. Le due variabili sono attualmente **false** nel codice.
6. Pubblicare successivamente il frontend approvato su GitHub Pages. Il servizio
   ricava l'origine dal già configurato `VITE_HOUNIAI_WORKER_URL`; non occorre un
   nuovo dominio né modificare la CSP esistente. L'override pubblico opzionale
   `VITE_LIVE_PHOTOS_WORKER_URL` non serve usando il Worker attuale.
7. Collaudo reale su un viaggio sintetico dedicato, MAI su 0000 per il test: telefono
   A con account Owner, telefono B prima Copilota e poi ospite in sessione privata.
   Salvare una foto locale e verificare che B non la veda; condividere la foto
   pre-partenza e una foto LIVE, attendere eventuale propagazione e verificare su B
   senza login. Ripetere upload come Copilota. Rimuovere da A e verificare che il
   vecchio URL diretto dia 404 da B; conservazione della copia locale da controllare.
   Verificare anche Viewer/estraneo negati agli upload, assenza rete e quota di test
   in ambiente isolato (non esaurire volutamente la quota cloud).
8. Controllare dashboard consumi e CPU Free durante il collaudo. I test locali non
   certificano il limite CPU edge, l'Auth reale o Safari fisico.

## Verifica locale e rollback

`node scripts/test_live_kv_free.cjs`: 18 gruppi isolati con SQLite reale in memoria,
KV simulato (anche replica obsoleta), HTTP Firebase simulato, funzioni effettive
Worker/frontend/card e compressione vera in Chromium. Non è un test cloud.
Build TypeScript/Vite/PWA e verifiche EUR/privacy/push/browser mantenute.

Il test AI storico pretende il blocco della terza richiesta, mentre il codice
precedente usa già 6/minuto: fallisce invariato. Allineando la sola fixture in
memoria alla costante reale passano i 9 gruppi; nessun limite AI è stato modificato.
Il test safe area aveva un percorso screenshot fuori workspace: eseguito con solo
il percorso di output reindirizzato in memoria, senza modificare il file dell'utente.

Prima delle modifiche sono state salvate copie in
`backups/live-kv-2026-11-12/before/` e hash in `before-sha256.json`. I tre file
Dynamic Island preesistenti sono rimasti byte per byte identici al loro stato
iniziale. Non è stato fatto alcun commit/push/deploy.

Rollback operativo futuro: disabilitare prima nuovi upload con
`LIVE_PHOTOS_ENABLED=false` soltanto come arresto completo di emergenza (blocca
anche le letture). Un rollback che deve mantenere le foto visibili deve mantenere
il modulo KV/D1 e i relativi binding; non ripristinare semplicemente il vecchio
client Firebase Storage. Non eliminare namespace o tabelle contenenti foto o
tombstone per fare rollback. Il rollback dati EUR e le regole Firebase restano
quelli già predisposti e non sono interessati da questo intervento.
