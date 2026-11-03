# Architettura gratuita e privacy-safe

## Decisione attiva

HOUNIGO 1.2.0 continua a usare Firebase Spark per autenticazione, Firestore e PWA. È predisposto un gateway separato per Cloudflare Workers AI Free, ma il frontend resta in modalità manuale finché il Worker non viene configurato, collaudato e distribuito con approvazione esplicita. Le Firebase Functions non devono essere distribuite.

## Costi e quote

- Workers AI Free include 10.000 Neurons al giorno. Superata la quota, le operazioni falliscono; l’uso ulteriore richiede un passaggio esplicito a Workers Paid.
- Workers Free offre 100.000 richieste al giorno e 10 ms CPU per richiesta. D1 Free offre 5 milioni di righe lette, 100.000 scritte al giorno e 5 GB; al limite le query falliscono fino al reset.
- Il gateway impone limiti anti-abuso calibrati sul consumo effettivo: 6 richieste/minuto, 30 richieste/giorno per UID+viaggio (~600 Neurons/giorno stimati su 10.000 disponibili) e 150/giorno globali, con reset a mezzanotte UTC (01:00/02:00 CET), rollback dei tentativi falliti e caching client-side.
- Non vengono configurati Workers Paid, AI Gateway credits, carte o account di fatturazione.

## Privacy

- Workers AI dichiara zero conservazione per l’inferenza standard e nessun uso dei Customer Content per addestrare modelli.
- Cloudflare può conservare metadati operativi senza contenuto e applica eccezioni legali/sicurezza previste dagli accordi.
- Il Worker non usa AI Gateway, R2, KV, cache AI o log applicativi. D1 conserva soltanto hash SHA-256 e contatori.
- Testo e immagini vengono inviati soltanto dopo informativa e consenso esplicito. I PDF testuali vengono estratti localmente con PDF.js; a Cloudflare arriva soltanto il testo necessario.
- PDF scannerizzati e immagini non sono dichiarati funzionanti finché il modello vision reale non supera i test remoti sintetici.

## Autorizzazione

- Il client invia il Firebase ID token via HTTPS.
- Il Worker verifica il token con Firebase Auth REST, quindi legge puntualmente viaggio e membership tramite Firestore REST usando lo stesso token.
- Firestore applica le Rules esistenti. Il Worker consente l’inferenza soltanto se `ownerUid`/`ownerId` corrisponde oppure il documento membro riporta `owner` o `copilota`.
- Nessuna credenziale Firebase Admin o chiave privata AI entra nel frontend.

## Tracciamento Accesso e Attività Utente (Privacy & Spark)

- **Ultimo Accesso (`lastAccessAt`)**: registrato al momento del login o avvio sessione autenticata.
- **Ultima Attività (`lastSeenAt`)**: registrata in modo leggero e discreto solo con sessione autenticata attiva e app visibile in primo piano (`document.visibilityState === 'visible'`).
- **Controllo Frequenza (Throttling)**: le scritture client sono limitate a un massimo di una ogni 15 minuti tramite cache locale `sessionStorage`, evitando consumo di scritture Firestore Spark (max 20.000 scritture/giorno).
- **Protezione Timestamp**: il valore deve coincidere con `request.time` (`serverTimestamp()`), impedendo falsificazioni orarie da parte del client.
- **Isolamento e Privacy**: ogni utente può scrivere solo sul proprio record `/users/{uid}` (`request.auth.uid == userId`); la lettura dell'elenco utenti è riservata esclusivamente ai Global Admin autorizzati in `/system_admins/{uid}`. Nessuna cronologia o coordinata GPS viene registrata.

## Modelli e licenze

- Testo e JSON: `@cf/meta/llama-3.1-8b-instruct-fast`, ospitato da Cloudflare e soggetto alla Meta Llama license.
- Vision: `@cf/meta/llama-3.2-11b-vision-instruct`, ospitato da Cloudflare; richiede accettazione preventiva della Meta License e Acceptable Use Policy.
- JSON Mode è supportato ma non garantisce sempre l’aderenza allo schema; il client mantiene parsing, revisione individuale, blocco duplicati e fallback manuale.

## Push futura

Workers Free, Cron Triggers, secret bindings e Web Crypto sono tecnicamente sufficienti per un prototipo Web Push gratuito. Non viene implementato ora: servono rotazione VAPID, isolamento, deduplicazione e prove reali su Android, iPhone e desktop. I promemoria in-app restano attivi.

## Fonti ufficiali verificate il 31 ottobre 2026

- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers AI data usage: https://developers.cloudflare.com/workers-ai/platform/data-usage/
- Workers AI errors: https://developers.cloudflare.com/workers-ai/platform/errors/
- Workers AI JSON Mode: https://developers.cloudflare.com/workers-ai/features/json-mode/
- Llama 3.1 8B Instruct Fast: https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fast/
- Llama 3.2 11B Vision: https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Firebase ID token verification: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Firestore REST with Firebase ID token: https://firebase.google.com/docs/firestore/use-rest-api

## Operazione esterna necessaria

Serve un account Cloudflare Workers Free senza carta. Dopo approvazione: creare D1, impostare il Firebase Web API key come secret Worker, accettare la licenza vision, distribuire il Worker ed eseguire `npm run test:cloudflare-ai:live` su un viaggio sintetico. Solo dopo un esito positivo si configura `VITE_HOUNIAI_WORKER_URL` e si prepara un deploy frontend separato.
