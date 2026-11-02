# Attivazione push Cloudflare Free

Stato: implementazione locale pronta, non distribuita e disattivata senza `VITE_PUSH_WORKER_URL` e `VITE_VAPID_PUBLIC_KEY`.

## Garanzie

- Worker e D1 Free interrompono le operazioni al superamento delle quote; non è configurato un piano a consumo.
- Subscription, job e deduplica restano in D1; prompt AI e documenti non vengono coinvolti.
- Ogni chiamata richiede Firebase Auth e membership Owner/Copilota.
- Prima di ogni invio pianificato la membership viene ricontrollata in sola lettura con credenziali server-side.
- Payload generici: niente nomi, PNR, codici, documenti o dettagli della prenotazione.
- Massimo applicativo: 100 invii/giorno; cron ogni 5 minuti; massimo 20 job per esecuzione.

Riferimenti: [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 Free limits](https://developers.cloudflare.com/d1/reference/faq/), [Web Push su Workers](https://developers.cloudflare.com/agents/agent-class/communication-channels/webhooks/push-notifications/).

## Operazioni remote da autorizzare

1. Verificare ancora `Workers Free`, assenza di metodo di pagamento e nessun upgrade.
2. Eseguire `node scripts/generate_vapid.cjs --out=C:\tmp\hounigo-vapid-rotation.json`; lo script non stampa la chiave privata.
3. Applicare la migration: `npx wrangler d1 migrations apply hounigo-ai-rate-limits --remote --config cloudflare/houniai-worker/wrangler.jsonc`.
4. Configurare con `wrangler secret put` i secret `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `FIREBASE_SERVICE_ACCOUNT_EMAIL` e `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`; non inserirli nei file versionati.
5. Usare un service account dedicato con sola lettura di `trips/{tripId}` e `trips/{tripId}/members/{uid}`; non concedere scrittura sui viaggi.
6. Distribuire il Worker solo dopo il dry-run e ripetere i test AI esistenti per escludere regressioni.
7. Eseguire una build frontend con URL push e sola chiave VAPID pubblica, senza pubblicarla.
8. Ricevere realmente la notifica di prova su desktop, Android e iPhone PWA Home; solo dopo autorizzare il deploy frontend.
9. Eliminare il file VAPID temporaneo dopo la configurazione e conservare la procedura di rotazione privata.

La vecchia VAPID non viene riutilizzata. Le subscription precedenti saranno sostituite automaticamente quando la PWA rileverà la nuova chiave pubblica.
