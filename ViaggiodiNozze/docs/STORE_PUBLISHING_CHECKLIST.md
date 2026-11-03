# HOUNIGO — Checklist Tecnica per Pubblicazione Futura su App Store e Google Play

> **Nota di Vincolo**: Documento strategico e preparatorio. Nessun costo immediato (0 €), nessuna creazione prematura di wrapper nativi finché la PWA e l'esperienza d'uso non sono consolidate.

---

## 1. Android TWA (Trusted Web Activity) & Root Domain
- [ ] **Digital Asset Links (`assetlinks.json`)**:
  - TWA richiede l'hosting del file in `https://<dominio>/.well-known/assetlinks.json` con MIME type `application/json` e risposta HTTP 200.
  - **Criticità GitHub Pages su subpath**: L'attuale URL `casabr.github.io/honeymoon-roadbook/` non controlla la radice `casabr.github.io/.well-known/assetlinks.json`. Se l'utente non possiede o non può dedicare la radice dell'intero account GitHub `casabr.github.io`, la verifica TWA di Google fallisce (la barra URL del browser rimarrà visibile).
- [ ] **Alternative Hosting Gratuite con Radice Dedicata**:
  - **Cloudflare Pages** (consigliata, piano Free): permette routing nativo su radice `hounigo.pages.dev` o dominio personalizzato gratuito (.tk/.eu/qualsiasi), controllo totale di `/.well-known/` e integrazione diretta con il Worker push esistente.
  - **Firebase Hosting** (piano Spark Free): controllo radice `hounigo-roadbook.web.app`, configurabile tramite `firebase.json` con header dedicati.
  - **Vercel** (piano Hobby Free): supporta radice e rewrite immediati.
- [ ] **Generazione TWA con Bubblewrap**:
  - Utilizzare `@bubblewrap/cli` per creare il pacchetto Android Studio (`.aab`) a partire dal `manifest.json`.
  - Configurare firma release con Keystore protetto (`upload-keystore.jks`).

---

## 2. iOS Capacitor & Push Native
- [ ] **Integrazione Capacitor (iOS)**:
  - `@capacitor/core`, `@capacitor/ios`, `@capacitor/push-notifications`, `@capacitor/geolocation`.
  - Generazione workspace Xcode via `npx cap add ios`.
- [ ] **Push Notification iOS (APNs vs Web Push)**:
  - Su iOS, una PWA salvata su Home (iOS 16.4+) supporta Web Push solo se aggiunta alla Home e con interazione esplicita.
  - Un wrapper Capacitor in WKWebView **non** supporta la Web Push standard del browser: richiede token nativo APNs (Apple Push Notification service) registrato tramite `@capacitor/push-notifications` e inoltrato a Cloudflare Worker/Firebase Cloud Messaging (FCM).
  - Il Cloudflare Worker push attuale è già predisposto con payload JSON compatibile con bridge FCM v1 / APNs.
- [ ] **Riconoscimento Safe Area iOS**:
  - Già implementato con `env(safe-area-inset-top)` e `env(safe-area-inset-bottom)` nel layout di HOUNIGO.

---

## 3. Privacy Policy, GDPR & Cancellazione Account
- [ ] **Privacy Policy Pubblica**:
  - Pagina web statica pubblica (es. `https://.../privacy.html` o sezione in `/info`) accessibile prima del download.
  - Specifica chiara su: geolocalizzazione opzionale e solo su consenso, token push memorizzati su Cloudflare D1 protetto, storage Firestore su Francoforte/Belgio (GDPR compliant), nessun tracker pubblicitario o profilazione commerciale.
- [ ] **Cancellazione Account (Requisito Obbligatorio Apple Guideline 5.1.1(v))**:
  - Apple e Google richiedono che se un'app permette l'accesso con account (Firebase Auth: Google/Email), deve fornire un pulsante in-app ben visibile: **"Elimina account e dati personali"**.
  - HOUNIGO dispone già della funzione di cancellazione guidata viaggio e revoca token push; andrà aggiunto un trigger per `user.delete()` in Firebase Auth per utenti non anonimi.

---

## 4. Identità Grafica, Icone e Splash Screen
- [ ] **Icone Android**:
  - Icona adattiva (Foreground SVG/PNG 432x432 px + Background a tinta unita `#0F172A`).
  - Maschere esagonali, cerchio e squircle supportate.
- [ ] **Icone iOS**:
  - Asset catalog `AppIcon.appiconset` a 1024x1024 px (senza trasparenze né canali alpha, come tassativamente richiesto da App Store Connect).
- [ ] **Splash Screen**:
  - Schermata di caricamento coordinata con il logo HOUNIGO editoriale su fondo dark/light, evitando flash bianchi all'avvio.

---

## 5. Requisiti Apple App Store (Guideline 4.2 Minimum Functionality)
- [ ] **Rischio Reiezione Guideline 4.2**:
  - Apple rigetta app che si limitano a visualizzare un sito web in una WKWebView senza funzionalità hardware o interazioni native distintive.
  - **Fattori di successo già integrati in HOUNIGO**:
    1. Funzionamento Offline reale con IndexedDB e Service Worker precache.
    2. Gestore GPS continuo con auto-centering e stato visivo freschezza coordinate.
    3. Notifiche push con gestione categorie e avviso imminente eventi.
    4. Navigazione touch intuitiva a rotelle native.
    5. HouniAI assistente integrato.
- [ ] **Account Apple Developer**:
  - Costo annuale di 99 $/anno (da attivare esclusivamente al momento effettivo dell'invio in review).

---

## 6. Requisiti Google Play Store & Test Chiuso (12 Tester per 14 Giorni)
- [ ] **Requisito 12 Tester per Account Personali Google Play**:
  - Per i nuovi account personali Google Play il requisito attuale prevede un **Closed Test con almeno 12 tester aderenti per almeno 14 giorni consecutivi** prima di poter richiedere l'accesso alla produzione.
  - Piano d'azione: Coinvolgere familiari, amici e partecipanti del viaggio prima del rilascio pubblico.
- [ ] **Account Google Play Console**:
  - Costo una tantum di 25 $ (da pagare solo al momento della creazione account).

---

## 7. Funzionalità Chiave: Offline, GPS, Autenticazione e Documenti
- [ ] **Offline**: Cache Service Worker per shell app + IndexedDB per tutti i documenti, tappe e orari consultabili anche in aereo o senza copertura.
- [ ] **GPS e Privacy**: Tracciamento solo durante consultazione attiva o sessione LIVE approvata. Nessun background location continuo abusivo che scarichi la batteria o attiri rifiuti in revisione Apple.
- [ ] **Visualizzazione Documenti/PDF**: Su iOS nativo, i PDF locali devono essere aperti tramite viewer nativo o `UIDocumentInteractionController` se il browser interno pone restrizioni sui blob IndexedDB.
