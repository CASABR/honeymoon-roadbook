# HouniAI Worker Free

Gateway distribuito su Cloudflare Workers Free. Usa esclusivamente l’AI binding Cloudflare, senza AI Gateway o provider esterni. Il frontend di produzione usa questo endpoint e mantiene il fallback manuale.

## Sicurezza

- Verifica il Firebase ID token tramite Firebase Auth REST.
- Legge puntualmente viaggio e membership tramite Firestore REST con lo stesso token; le Firestore Rules restano applicate.
- Accetta soltanto Owner o Copilota, mai richieste anonime.
- D1 conserva esclusivamente hash non reversibili e contatori; prompt, documenti e risposte non vengono salvati o registrati.
- CORS ammette soltanto `https://casabr.github.io`.
- Limiti: 2 richieste/minuto e 5/giorno per UID+viaggio, 20/giorno globali. Gli errori bloccano la richiesta.

## Modelli

- Testo/JSON e immagini: `@cf/qwen/qwen3.8-27b`, modello Cloudflare-hosted con licenza Apache 2.0 compatibile con l'uso nell'Unione Europea.
- I modelli Meta Vision non vengono utilizzati né accettati.
- I PDF testuali vengono convertiti localmente nella PWA; il file PDF non raggiunge Cloudflare.
- PDF scannerizzati e immagini non sono dichiarati funzionanti finché non superano il test remoto reale.

## Stato operativo

1. Account **Workers Free** verificato senza metodo di pagamento o abbonamento Paid.
2. D1 `hounigo-ai-rate-limits` creato con giurisdizione UE e migration applicata.
3. `FIREBASE_WEB_API_KEY` configurata come secret Wrangler; nessuna credenziale Admin o service account è utilizzata.
4. Worker disponibile su `https://hounigo-ai.nunzio114.workers.dev`, con CORS limitato a HOUNIGO.
5. Modello configurato: `@cf/qwen/qwen3.8-27b`; nessuna licenza Meta Vision accettata.
6. Il collaudo end-to-end usa Firebase SDK, un viaggio sintetico temporaneo e identità Owner/Copilota/estraneo create e rimosse dalla singola esecuzione di `npm run test:cloudflare-ai:live`.
7. `VITE_HOUNIAI_WORKER_URL` è configurato per la build di produzione; nessuna chiave AI viene distribuita nel frontend.

Il test live usa cinque richieste sintetiche, rispetta i limiti temporali del Worker e non salva automaticamente alcun risultato.

Non configurare Workers Paid, AI Gateway credits o un metodo di pagamento.
