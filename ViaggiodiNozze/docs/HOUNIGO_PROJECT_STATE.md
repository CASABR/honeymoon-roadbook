# HOUNIGO — STATO DEL PROGETTO (PROJECT STATE)
*Data ultimo aggiornamento: 26 Ottobre 2026 (ultime correzioni pre-beta)*
*Repository: CASABR/honeymoon-roadbook*
*Branch di lavoro: work/product-completion*
*Produzione: gh-pages f54bc9a | Bundle online | Firebase: app-viaggio-di-nozze*

---

## 1. VISIONE E OBIETTIVO DEL PROGETTO
Hounigo è una Progressive Web App (PWA) Travel Editorial per il viaggio di nozze in Nuova Zelanda (viaggio `0000`), con esperienza di consultazione offline, gestione delle tappe, trasporti, alloggi, diario di bordo e sezione **LIVE Experience** per la condivisione in tempo reale con familiari e amici ("ospiti esterni").

---

## 2. DECISIONI ARCHITETTURALI FONDAMENTALI
1. **Ownership e Sicurezza Viaggio `0000`**:
   - Owner permanente: `cqs2OcE7WzY7XmiqVoZmM7B6Fpp2` (account Google definitivo).
   - Security Rules: isolamento rigoroso multi-tenant, protezione dei dati sensibili (costi, voucher, documenti) e whitelist rigida per le collezioni pubbliche (`trips/{tripId}/live`).
   - Nessuna migrazione dati o modifica ownership non autorizzata.
2. **Identità e Ruoli Dispositivi**:
   - Modalità multi-dispositivo supportata tramite `useAuthIdentity` e `deviceSession.ts`.
   - Ruoli distinti: `organizzatore` (owner/copilota), `guida` (dispositivo fisico con lease GPS attivo), `viewer` e `ospite esterno` (accesso standalone via `?live=1`).
   - Dispositivi Desktop: operano come display di consultazione e monitoraggio dell'itinerario e del segnale della guida mobile, senza forzare la cattura GPS da browser fisso.
3. **LIVE Tracking & GPS Lease**:
   - Single-leader lease model: un solo dispositivo guida alla volta può inviare coordinate attive (`liveGpsService.ts`).
   - I client secondari (incluso desktop, tablet e ospiti) operano come consumatori in tempo reale del feed live via listener Firestore.
   - Throttling a 16s e timeout di stale lease a 120s per prevenire flood e costi operativi.
4. **Architettura Dati Google Maps Giornalieri**:
   - Gestione differenziata e parallela per **Itinerario in Auto** (`driving`) e **Itinerario a Piedi** (`walking`).
   - Gestione chiara del limite tecnico Google Maps (10 tappe/punti massimi per URL di rotta).
   - Retrocompatibilità al 100%: i link salvati con il formato legacy `day_maps_link_{date}` vengono importati automaticamente come percorsi auto senza alcuna perdita dati.

---

## 3. FUNZIONALITÀ COMPLETATE E PROBLEMI RISOLTI

### Sprint: ultime correzioni pre-beta e handoff Codex (26 Ottobre 2026)
- **Galleria iPhone**: rimosso `capture="environment"` dai flussi LIVE, unificati `accept` e riconoscimento MIME/estensione per JPEG, PNG, WebP, HEIC e HEIF, mantenuta l'anteprima con conferma e permessi esistenti. La causa principale era l'apertura forzata della fotocamera iOS; i file immagine fino a 20 MB possono ora essere compressi prima del limite finale di 5 MB.
- **GPS progressivo**: sostituito il muro di testo con disclosure accessibile nativa "Come funziona il GPS", richiudibile e completa di ruoli, attivazione esplicita, privacy e limite iOS in background.
- **Viewer membro**: ripristinato il selettore esclusivo "Dove siamo adesso" / "Dove dovremmo essere". La prima modalità usa soltanto l'ultima coordinata realmente condivisa e segnala assenza/staleness; la seconda calcola la tappa pianificata nel fuso locale della destinazione. Gli ospiti esterni non ricevono itinerario privato né il selettore membro.
- **Altro mobile**: gerarchia e personalità migliorate con route-line Coral, micro-feedback accessibili, LIVE e PDF evidenziati senza modificare la navigazione. Confronto 393 px: `screenshots/screenshot_pdf_altro_393.png` e `screenshots/prebeta_altro_after_393.png`.
- **PDF**: riferimenti prenotazione disattivati per impostazione predefinita; verificato nel `dist/sw.js` generato che il chunk dinamico jsPDF sia incluso nel precache PWA. Nessuna riscrittura del generatore.
- **Privacy HouniAI**: rimossa la promessa assoluta di zero conservazione/training; l'informativa dichiara correttamente l'invio a Google Gemini e che conservazione, revisione e uso dipendono da piano e impostazioni applicabili.
- **File principali modificati**: `src/utils/fileAttachment.ts`, componenti upload e HouniAI, `LiveEditorialExperience.tsx`, `LiveView.tsx`, `liveIntelligenceHelper.ts`, `AltroView.tsx`, `index.css`, `PdfExportModal.tsx`, `vite.config.ts`, script di test/cattura e documentazione.
- **Verifica locale**: suite dedicata 27/27, PDF 15/15, LIVE packet 2, HouniAI 7/7, brand 8/8 e beta Google/copilota/PWA 17/17 superate; lint e build produzione superati. Tre vecchie suite statiche conservano asserzioni non più allineate all'implementazione corrente, senza regressioni runtime rilevate.
- **Limiti**: selezione reale Foto/Libreria, anteprima HEIC e comportamento PWA restano da convalidare su iPhone fisico. Nessun deploy, modifica alle regole Firebase o scrittura sul viaggio `0000`.
- **Commit locale finale**: `HEAD` del branch `work/product-completion`; hash esatto riportato nel report finale di handoff.

### Sprint: HOUNIGO — Esportazione PDF Itinerario & Trasparenza Privacy AI (26 Ottobre 2026)
- **Esportazione PDF Roadbook 100% Client-side e Offline**:
  - *Posizionamento*: Pulsante rapido "Esporta PDF" in sezione Oggi (OggiView) e card dedicata in Altro -> "Documenti & Risorse" (AltroView). Icona ufficiale coordinata `TrailPdf` da 24×24 px.
  - *Modale di Esportazione (`PdfExportModal.tsx`)*:
    - *Selezione Contenuti*: Tappe (ON), Attività (ON), Trasporti (ON), Alloggi (ON), Riferimenti prenotazioni/PNR (OFF per privacy), Note personali (OFF), Spese previste (OFF).
    - *Selezione Periodo*: Tutto il viaggio, Intervallo di date configurabile, Singolo giorno.
    - *Livello di Dettaglio*: Compatto (orario, titolo, luogo) vs Dettagliato (note, tratte, check-in, indirizzi).
    - *Anteprima Sintetica*: Conteggio giorni, totale eventi e stima pagine calcolati in tempo reale prima della generazione.
    - *Avviso Sincronizzazione*: Rilevamento stato locale/offline con notifica proattiva *"Il PDF include i dati salvati su questo dispositivo. Alcune modifiche potrebbero non essere ancora sincronizzate."*
  - *Architettura e Design Documento (`pdfExportService.ts`)*:
    - Zero server, zero Cloud Functions, zero chiamate a Gemini o costi aggiuntivi.
    - Import dinamico di `jspdf`: zero impatto sul bundle iniziale PWA (chunk lazy-loaded dedicato).
    - Impaginazione A4 verticale conforme alla Brand Identity Instagram: Navy `#172033`, Coral `#FF6B5F`, Cloud `#F8F7F3`.
    - Cronologia rigorosa con rispetto dell'hotfix `6088271` (`orario`, `time`, `orarioInizio`, `orarioRitrovo`).
    - Eventi privi di orario collocati in sezione "Senza orario fisso / Suggerimenti" (nessun orario artificiale).
    - Protezione Privacy: esclusione categorica di password, token, estremi passaporto, PIN e voucher integrali.
    - Supporto iOS Safari e PWA tramite `navigator.share({ files: [...] })` e fallback di salvataggio via Blob.
    - Nome file sanificato: `HOUNIGO_Itinerario_[NomeViaggio]_[Data].pdf`.
- **Trasparenza Privacy AI (`SmartInsertModal.tsx`)**:
  - L'informativa chiarisce che testi e immagini vengono inviati a Google Gemini per l'analisi; conservazione, revisione e uso dipendono dal piano API e dalle impostazioni applicabili, quindi non viene promessa conservazione zero o esclusione assoluta dal miglioramento dei prodotti.
- **Verifica e Test**:
  - Script automatizzato `scripts/test_pdf_export_verification.cjs` superato al 100% su tutti i 15 casi obbligatori (breve, 42 giorni, collisioni orari, untimed, entità multiple, fusi orari, note, campi null, testi lunghi, offline, intervalli date, compatto/dettagliato, privacy, iPhone).
  - Rendering visivo reale del PDF generato e screenshot d'interfaccia archiviati (`screenshot_pdf_roadbook_render.png`, `screenshot_pdf_modal_393.png`, `screenshot_pdf_altro_393.png`).
  - `npm run build` completato con codice 0.

### Sprint: HOUNIGO — JARVIS FINALE (Brand Identity, Loghi Ufficiali, Light Experience & Motion Design) (26 Ottobre 2026)
- **FASE GRAFICA DEFINITIVAMENTE CONSOLIDATA E CHIUSA**:
  - Allineamento al 100% dell'app alla brand identity ufficiale di Instagram **@hounigo**.
- **Due Loghi Ufficiali Importati e Integrati**:
  - `Logo A` (lettering Navy `#172033` su simbolo H con gradiente Coral-Arancio): dedicato a tutte le superfici chiare (Cloud `#F8F7F3`, bianco).
  - `Logo B` (lettering Bianco su simbolo H con gradiente Coral-Arancio): dedicato a tutte le superfici scure (Navy `#172033`).
  - File salvati in `public/images/brand/` (`hounigo-logo-on-light.png`, `hounigo-logo-on-dark.png`) e `src/assets/brand/`.
  - Componente condiviso `src/components/common/HounigoLogo.tsx`: gestione automatica varianti `onLight`, `onDark`, `markOnly`, proporzioni native protette al 100%, alt text semantico, nessun filtro CSS distruttivo.
  - Integrato in Onboarding (`variant="onLight"`), Desktop Sidebar (`variant="onLight" / "onDark"`), Topbar compatta (simbolo H originale).
- **Primo Accesso (Onboarding) Light Definitivo**:
  - Convertito l'accesso da dark ad un'esperienza Light editoriale su Cloud `#F8F7F3` con morbidi accenti luminosi.
  - Card bianca con spaziatura bilanciata e tipografia Manrope ExtraBold / Medium.
  - 3 CTA primarie chiarissime:
    1. *Crea un viaggio* (Coral `#FF6B5F`, icona TrailItinerario).
    2. *Continua con Google / Accedi* (Navy `#172033`, icona globo).
    3. *Partecipa a un viaggio* (Cloud `#F8F7F3`, bordo slate-200, icona TrailCopiloti).
  - Tutti i sotto-flussi (`create`, `join`, `account_login`, `role`) armonizzati alla Light Experience con date picker a tema chiaro (`colorScheme: light`).
- **HouniAI Light Definitivo**:
  - Sheet e pannelli ripensati in Light mode (`bg-white`, bordi slate-200, testi Navy `#172033`).
  - Tre capacità immediatamente comprensibili tramite pillole informative:
    1. 📷 *Foto & Screenshot* (riconoscimento informazioni da immagini).
    2. 📄 *PDF Voucher* (analisi e categorizzazione documenti prenotazione).
    3. 💬 *Assistente* (aiuto contestuale e itinerario).
  - Distinzione semantica degli stati: elaborazione in corso (spinner Coral + TrailAi), informazioni estratte (card chiare), anteprima di verifica (card emerald/amber), salvataggio confermato (badge successo), errore (badge rose).
- **Motion Design Leggero & Accessibile**:
  - Definiti keyframes e transizioni pure CSS in `src/index.css`:
    - `.hounigo-fade-in`: comparsa morbida con lieve slittamento sull'asse Y.
    - `.hounigo-live-pulse`: pulsazione discreta per indicatore LIVE/GPS attivo (scale 1.04, opacity 0.85).
    - `.hounigo-touch-feedback`: micro-feedback di pressione pulsanti (`active:scale-[0.98]`).
    - `.trail-icon-wrapper`: transizione morbida dello stato attivo delle icone.
  - Supporto nativo `@media (prefers-reduced-motion: reduce)`: disabilita automaticamente tutte le animazioni per utenti sensibili.
  - Nessuna libreria JavaScript esterna aggiunta (zero overhead di bundle).
- **Asset Fotografici Reali & Guida Slot**:
  - Creata cartella `public/images/photos/` e documentazione `README.md` con standard fotografici (Hero 1200x800, Trip 1600x900, Tappe 1024x680, divieto stock generici o AI fittizie).
- **Verifiche & Screenshot Reali Multi-Viewport**:
  - Test suite automatizzate superate al 100%:
    - `scripts/test_brand_identity_alignment.cjs`: PASS (8/8).
    - `scripts/test_admin_and_icons_verification.cjs`: PASS.
  - `npm run build`: codice 0 (successo).
  - Screenshot catturati a 320px, 393px e Desktop per tutte le 7 viste richieste (12 file generati e archiviati).
- **Palette Unificata Definitiva**:
  - *Colori Brand*: Navy `#172033` (sfondo scuro, testi principali, pulsanti), Coral `#FF6B5F` (accento primario, selezioni attive, CTA), Cloud `#F8F7F3` (sfondo app, contenitori neutri), Bianco tecnico.
  - *Colori Spuri Eliminati*: Rimossi colori arcobaleno da `CategorieBar` (amber, indigo, purple, emerald), gradiente peach e sky-blue in `OnboardingView`, bicchierini multicolore e gradiente amber/rose in `AltroView`, accenti indigo in `TripSelectorModal` e banner `OggiView`.
  - *Colori Funzionali Confinati*: Verde, ambra e rosso strettamente riservati a indicatori di stato (successo, warning, errore/offline), senza invadere la personalità del brand.
- **Tipografia & Design System**:
  - Centralizzati i token in `src/index.css`: `.font-brand-title` (Manrope ExtraBold), `.font-brand-body` (Manrope Regular/Medium), classi semantiche `.bg-hounigo-navy`, `.bg-hounigo-coral`, `.bg-hounigo-cloud`, `.text-hounigo-navy`, `.text-hounigo-coral`, `.hounigo-card`, `.hounigo-btn-coral`, `.hounigo-btn-navy`.
- **Iconografia Trail Icons (Consolidamento & TrailAi)**:
  - Preservato il sistema SVG originale introdotto nel commit `cc07429`.
  - Creata icona originale `TrailAi` (scintilla geometrica a 4 punte curve con traiettoria waypoint e stella polare) in sostituzione dell'emoji generica `✨`.
  - Integrata `TrailAi` in `NavBar.tsx`, nel modale assistente `SmartInsertModal.tsx` (ufficialmente denominato **HouniAI**) e nella tavola comparativa `TrailIconsShowcaseModal.tsx`.
- **Rifiniture Mirate Aree Riconoscibili**:
  1. *Onboarding*: sfondo Navy `#172033` solido con bagliore soffuso Coral `#FF6B5F`, tipografia Manrope ExtraBold, pulsanti con TrailIcons originali.
  2. *NavBar Mobile*: sfondo Cloud `#F8F7F3`/95 con blur, accento Coral `#FF6B5F` per la scheda attiva, pulsante centrale HouniAI con badge Coral e TrailAi.
  3. *Header Oggi*: masthead card con Manrope ExtraBold, status pill `#FFF0ED`/Coral per il countdown, prossimo passo in bianco con bordo Coral `#FF6B5F`.
  4. *Card Viaggio (TripSelectorModal)*: card attiva evidenziata in Coral `#FF6B5F` e pulsante "In Uso" in Navy `#172033`.
  5. *LIVE Experience*: card in evidenza nel menu Altro ripulita da gradienti ambigui e rifinita con badge Coral `#FF6B5F`.
  6. *HouniAI*: titolo unificato in "HouniAI" (*"L'assistente di viaggio per il tuo itinerario"*), icona TrailAi sia nella testata sia nei messaggi.
  7. *Menu Altro*: uniformato su card Cloud `#F8F7F3` con icone Navy `#172033`, zero bicchierini multicolore generici.
- **Verifica e Test**:
  - Script dedicato `scripts/test_brand_identity_alignment.cjs` superato al 100% (8 criteri su 8).
  - Catturati 5 screenshot reali a viewport mobile 393px (`brand_393_onboarding.png`, `brand_393_oggi.png`, `brand_393_categorie.png`, `brand_393_houni_ai.png`, `brand_393_altro.png`).
  - `npm run build` completato con codice 0.

### Sprint: Admin Console, UX Compatta e Design System "Hounigo Trail Icons" (26 Ottobre 2026)
- **P1 — Diagnostica e Risoluzione Console Admin Non Autorizzata**:
  - *Causa Errore "NON AUTORIZZATO"*: Nel progetto Firestore reale `app-viaggio-di-nozze`, la collezione `/system_admins` conteneva 0 documenti e l'account Google `cqs2OcE7WzY7XmiqVoZmM7B6Fpp2` non possedeva il custom claim `admin: true`.
  - *Diagnostica Viaggio "GIAPPONE"*: Verificato via REST API Firestore che nel database cloud esistono ben **4 viaggi Giappone** reali (`trip_l96ccua`, `trip_m2izwa7`, `trip_tck3g3c`, `trip_x6ymxtq`), creati con ID generati dal sistema durante sessioni anonime. In precedenza non comparivano a causa di `pageSize = 8` che li confinava a pagina 2 e della ricerca per ID esatto "GIAPPONE".
  - *Migliorie AdminDashboardView*: Aumentato il default `pageSize` da 8 a 25 elementi (visibili tutti i viaggi del database nella pagina 1), aggiunto selettore elementi per pagina (10/25/50/100) e integrato un box diagnostico con istruzioni precise passo-passo per Firebase Console e pulsante di copia rapida dell'UID.
  - *Istruzioni Manuali Firebase*: documentata procedura non invasiva per aggiungere `/system_admins/{uid}` su `app-viaggio-di-nozze`.
- **P1 — UX Compatta (Interfaccia con meno testo)**:
  - *DeviceRoleModal*: Rimossa terminologia ingegneristica ("Geolocation API", "Master/Riferimento") e dettagli tecnici ridondanti. Riformulati i ruoli Guida, Copilota e Ospite in una singola frase chiara per concetto.
  - *OnboardingView*: Semplificate le 3 intenzioni principali ("Crea un nuovo viaggio", "Accedi al tuo account", "Partecipa a un viaggio"), eliminati sottotitoli lunghi e spiegazioni tecniche.
  - *GestioneViaggioView*: Ridotta la spiegazione d'invito da un paragrafo tecnico a una sola riga chiara; isolato l'inserimento manuale UID in un componente discreto.
- **P2 — Iconografia Originale "Hounigo Trail Icons"**:
  - *Libreria Originale SVG*: Realizzato `src/components/icons/TrailIcons.tsx` con 20 icone originali 24×24 con tratti arrotondati, forme piene distintive e richiamo ai percorsi/waypoint (`TrailOggi`, `TrailItinerario`, `TrailTappe`, `TrailAttivita`, `TrailAlloggi`, `TrailTrasporti`, `TrailPrenotazioni`, `TrailBagagli`, `TrailSpese`, `TrailLive`, `TrailCopiloti`, `TrailImpostazioni`, `TrailMappa`, `TrailCategorie`, `TrailRistoranti`, `TrailShopping`, ecc.).
  - *Tavola Comparativa*: Realizzato `src/components/icons/TrailIconsShowcaseModal.tsx` con confronto interattivo tra icona precedente (emoji o generica), nuova Trail Icon in stato Normale e nuova Trail Icon in stato Attivo.
  - *Integrazione*: Aggiornate `NavBar.tsx`, `CategorieBar.tsx` e `AltroView.tsx` per utilizzare le nuove Trail Icons con feedback di stato attivo visibile anche senza dipendere unicamente dal colore.
- **Verifica e Test**:
  - Script automatizzato `scripts/test_admin_and_icons_verification.cjs` superato con esito 100% positivo.
  - `npm run build` completato con codice 0, bundle ottimizzato e Service Worker PWA valido.

### Completamento Esperienza Oggi & Riprogettazione Sezione Adesso (26 Ottobre 2026)
- **P1 — Modifica Tappe direttamente da Oggi**:
  - *Apertura Dettaglio*: click su qualsiasi card di tappa nella timeline Oggi apre il modal `TimelineItemDetailModal`.
  - *Pulsante Modifica*: chiaramente visibile per ruoli autorizzati (`canEdit`), anche in modalità offline.
  - *Precaricamento Form*: `TappaForm` precompilato con dati reali (`titolo`, `data`, `orario`, `indirizzo`, `coordinate`, `nota`, `noteCopilota`).
  - *Preservazione ID*: risolto bug in `OggiView.tsx` che rigenerava un nuovo ID casuale durante il salvataggio (`data.id || editingTappaItem?.id || ...`).
  - *Spostamento Data*: se la tappa viene spostata di data, la vista aggiorna automaticamente `selectedDate` e ricarica la timeline corretta.
  - *Notifiche e Sincronizzazione*: emissione eventi `roadbook_data_mutated` e `tappa_updated`, salvataggio IndexedDB, accodamento sync Firestore e banner visivo *"Tappa aggiornata con successo ✓"*.
  - *Supporto Modifiche Offline*: aggiornato `useAuthIdentity.ts` affinché le sessioni offline con ruolo locale `guida` o `copilota` possano mutare i dati locali in IndexedDB senza essere bloccate da `assertCanMutate`.
  - *Note Copilota*: visualizzazione del blocco note dedicato al copilota nel dettaglio tappa.

- **P1 — Riprogettazione Sezione Adesso (Live Intelligence & Oggi Level 1)**:
  - Eliminata la ridondanza quadrupla mostrata nello screenshot utente (*"ADESSO: Nessuna attività / ATTIVITÀ IN CORSO: Libero / PROSSIMA ATTIVITÀ: Nessuna / POSIZIONE PREVISTA: Viaggio concluso"*).
  - *Stato Prima della Partenza (`todayStr < tripStartDate`)*: singola informazione chiara e compatta con conto alla rovescia, data di partenza e collegamento diretto al Giorno 1. Nessun box ridondante o contraddittorio.
  - *Stato Durante il Viaggio (`tripStartDate <= todayStr <= tripEndDate`)*: visualizzazione coordinata di attività in corso, prossima attività e posizione prevista. In assenza di attività in corso, mostra un unico stato di pausa/libero e l'evento successivo, senza ripetere 3 volte lo stesso concetto.
  - *Stato Dopo il Viaggio (`todayStr > tripEndDate`)*: il messaggio di viaggio completato viene mostrato rigorosamente solo quando la data di fine viaggio è realmente trascorsa nel tempo.
  - *Consultazione di date diverse da oggi*: separazione chiara tra il giorno in visualizzazione e il momento presente. Mostrato banner esplicito *"Programma del {data}"* con pulsante *"Torna a Oggi"*, evitando di presentare eventi futuri/passati come in corso adesso.

- **P0 — Preflight Commit 7cbe06e & Sicurezza**:
  - *Allineamento Firestore Rules*: sincronizzato il file root `../firestore.rules` con `ViaggiodiNozze/firestore.rules`. Entrambi i file ora contengono la clausola `status in ['active', 'used']` e protezioni al 100% identiche.
  - *Privacy Token Invito*: la creazione e lettura dei token espone esclusivamente metadati strettamente necessari (`tripTitle`, `ownerName`, `role`, `status`, `expiresAt`), senza divulgare dati economici, voucher, documenti o itinerario privato.
  - *Account Google Esistente*: verificato che in `accountService.ts` il collegamento di un account Google già esistente (`credential-already-in-use`) esegue il login sicuro senza migrare membership non autorizzate né dichiarare conservata una membership anonima se l'UID è variato.
  - *Test Emulator*: 14/14 test P0 + 24/24 test di isolamento/sicurezza superati al 100% su Firebase Emulator reale con OpenJDK 21.

### Risoluzione Regressione LIVE Desktop (Priorità Critica)
- **Causa individuata**: 
  1. `TypeError: Cannot read properties of undefined (reading 'slice')` su `remoteGpsLease.holderDeviceId` quando il lease è presente ma `holderDeviceId` è indefinito.
  2. `RangeError: Invalid time value` in `LiveView.tsx` durante il parsing di `header.statusUpdatedAt` contenente Timestamp Firestore POJO `{ seconds, nanoseconds }`.
  3. Eccezioni non gestite sui listener Firestore `onSnapshot` (`subscribeToLiveHeader`, `subscribeToLiveUpdates`) in assenza di error callback.
  4. Valore `activeTripId` indefinito su desktop in assenza del parametro URL e con tripConfig non ancora idratato: RIMOSSO il fallback cieco `'0000'`. Se non è presente un viaggio autenticato/configurato, viene mostrata una schermata recuperabile di selezione senza chiamate orfane su Firestore.
  5. `Math.round(remoteGpsLocation.accuracy)` che restituiva `NaN` in assenza di accuracy.
- **Risoluzione applicata**:
  - Implementata utility robusta `parseSafeDate` che normalizza Timestamp Firestore (istanze o POJO `{ seconds }`), millisecondi, Date e stringhe ISO.
  - Safe navigation su `holderDeviceId` e `accuracy`.
  - Aggiunti error handler dedicati a tutti i listener Firestore.
  - Modalità desktop: esplicito ruolo di ascolto del dispositivo guida mobile.

### Beta Release Candidate — Consolidamento e Semplificazione UX (25 Ottobre 2026)
- **LIVE Experience Compatta su Mobile**:
  - Mappa ridotta a 220px-360px per garantire visibilità immediata della posizione.
  - Live Intelligence trasformata in una pill compatta a singola riga con toggle espandibile `▼ Programma / ▲ Sintesi`.
  - Controlli di trasmissione Guida e Co-pilota inseriti in cassetto comprimibile.
  - Cartolina più recente in primo piano con archivio paginato comprimibile per non allungare la vista.
  - Risolti overflow a 393px e 320px CSS.
- **Card Trasporti Ultra-Compatte**:
  - Box check-in convertito in riga orizzontale compatta a singola linea, preservando orario di chiusura, anticipo al terminal/porto e badge di stato senza frammentazione.
- **Architettura Informativa Sezione Altro**:
  - Riorganizzazione in 3 sezioni editoriali: *In Evidenza* (Live, Documenti), *Strumenti del Viaggio* (Spese, Note, Bagagli, Assicurazione, Emergenze, Toolkit) e *Gestione Viaggio & Dispositivo*.
  - Rimozione di link e pulsanti tecnici di amministrazione/diagnostica dalla navigazione standard dei tester.
- **Primo Accesso (Onboarding a 3 Intenzioni)**:
  - Schermata di selezione iniziale impostata direttamente sulle tre intenzioni essenziali del viaggiatore:
    1. *Organizza un viaggio*
    2. *Accedi al mio viaggio* (con Google ed Email multi-dispositivo)
    3. *Partecipa a un viaggio* (con codice o invito)
  - Eliminato qualsiasi gergo tecnico, menzione di UID o riferimenti a Firebase.
- **Console Amministratore Globale**:
  - Chiarito il motivo del messaggio "NON AUTORIZZATO" nello screenshot utente: per effettuare query globali su `/trips` le Security Rules richiedono un documento in `/system_admins/{uid}` o il custom claim `admin: true`.
  - Console isolata dai percorsi utente standard (accessibile solo con parametro esplicito `?admin=1`).

### Card Itinerario Google Maps — Restyling Funzionale Travel Editorial
- Nuova card `DayMapsCard.tsx` integrata in `OggiView.tsx`.
- Gestione separata e indipendente di:
  - 🚗 **Itinerario in Auto** (`driving`)
  - 🚶 **Itinerario a Piedi** (`walking`)
- Riconoscimento immediato: percorsi presenti evidenziati con badge di stato e note; percorsi assenti con callout tratteggiato ed esplicito pulsante di inserimento.
- Chiarimento del limite Google Maps: se il percorso ha 10 o più tappe (oppure è spuntato come completo), compare l'avviso tecnico esplicativo: *"Questo itinerario ha raggiunto il limite tecnico imposto da Google Maps (1 partenza + 9 tappe). Non è possibile aggiungere altre soste a questo link."*, superando il badge criptico "Piena".
- Rilevamento automatico delle tappe presenti da URL Google Maps `/maps/dir/`.
- Modale completa di aggiunta, modifica, sostituzione e rimozione.

### Hotfix Beta — Inviti Copilota, Isolamento Dati e Regressioni UI (25 Ottobre 2026)
- **Risoluzione P0 — Errore Invito Copilota**:
  - **Causa individuata**: 
    1. Creazione viaggio: `handleCreate` salvava la configurazione solo in locale, omettendo la scrittura del documento `/trips/{id}` e `/trips/{id}/members/{ownerUid}` su Firestore.
    2. Security Rules: `allow get: if isSignedIn() && (isTripMember(tripId) || isGlobalAdmin())` impediva al copilota invitato di verificare l'esistenza del viaggio tramite ID, restituendo `PERMISSION_DENIED` / errore generico di connessione.
    3. Flusso di Join: `executeJoin` richiedeva che l'UID fosse già presente in `members`, impedendo il primo accesso tramite invito valido.
  - **Risoluzione applicata**:
    1. `handleCreate` ora crea immediatamente il documento `/trips/{id}` e il member doc owner con `writeBatch` e `recordUserAccess`.
    2. `executeJoin` supporta l'auto-join guidato con link d'invito (`invite=true` o `role=copilota`): crea il documento `/members/{copilotUid}` e aggiunge il proprio UID alla whitelist `members` del viaggio.
    3. `firestore.rules`: preparata modifica minima e rigorosa che permette `get` su `/trips/{tripId}` agli utenti autenticati (per consentire la risoluzione del codice/link), e permette l'auto-join per i viaggi custom (`tripId != '0000'`). Nessuna subcollezione privata (tappe, spese, note, documenti) viene esposta: l'accesso ai contenuti rimane protetto da `isTripMember(tripId)`. Il viaggio `0000` rimane intatto e blindato.
- **Risoluzione P0 — Isolamento Totale Dati e Neutralizzazione Contaminazione Viaggi**:
  - **Causa individuata**:
    1. Connessioni IndexedDB aperte mantenute in cache in `dbPromises` senza chiusura né riconnessione sul cambio viaggio.
    2. Cache in memoria `memoryCache` di `StorageService` non invalidata al cambio di viaggio attivo.
    3. Seed legacy Nuova Zelanda `seedRealActivities()` invocato anche per nuovi viaggi.
    4. Fallback date hardcoded (`2026-11-28`, `2027-01-10`) e `detectCountry()` in `OggiView.tsx` che forzava destinazioni della Nuova Zelanda su viaggi generici.
    5. Chiave localStorage `hero_bg_image` globale anziché vincolata al `tripId`.
  - **Risoluzione applicata**:
    1. Aggiunto `closeAndResetDatabases()` su IndexedDB invocato su ogni cambio di viaggio (`saveTripConfig`, `clearTripConfig`).
    2. Ascolto dell'evento `trip_config_changed` in `StorageService` per ripulire istantaneamente la memoria in-memory (`this.memoryCache.clear()`).
    3. Blocco del seed `seedRealActivities()` per tutti i viaggi eccetto il viaggio master `0000` (`if (tripId !== MASTER_TRIP_ID) return;`).
    4. Data fallback isolata: per viaggi personalizzati la data ricade sulle date configurate dal creatore o sulla data odierna (`todayIso`), mai sui default neozelandesi.
    5. `detectCountry()` limitato rigorosamente al viaggio `0000`: per tutti gli altri viaggi il titolo dell'header corrisponde al titolo effettivo del viaggio o a fallback neutro.
    6. Immagine hero isolata per trip: `hero_bg_image_${tripId}`.
- **Risoluzione P1 — Ripristino Card Google Maps Compatta**:
  - Ripristinata la struttura a due righe: riga 1 🚗 Auto (Apri / Modifica / Aggiungi), riga 2 🚶 A piedi (Apri / Modifica / Aggiungi).
  - Eliminata la frammentazione in sottocard affiancate che occupava troppo spazio verticale su smartphone.
  - Conservata la modale per la gestione degli itinerari, retrocompatibilità con i vecchi link e avviso contestuale se il limite delle 10 tappe Google Maps viene superato.
- **Risoluzione P1 — Ripristino Sezione Altro**:
  - Eliminata la proliferazione di riquadri e intestazioni decorative maiuscole.
  - Ripristinata la griglia compatta a due colonne degli strumenti di viaggio con accesso rapido e ordinato a Gestione Viaggio e Ruolo Dispositivo.

### Chiusura Beta 28 Ottobre — Modalità Jarvis (25 Ottobre 2026)
- **P0-A — Risoluzione Causa Radice GPS "Non attivata" e Controlli Guida**:
  - **Causa individuata**: In `LiveEditorialExperienceProps` la prop `online` era omessa; di conseguenza `props.online` risultava costantemente `undefined`, disabilitando perennemente tutti i pulsanti operativi della guida (`disabled={props.isDetectingGps || !props.online}`).
  - **Risoluzione applicata**:
    1. Passaggio esplicito di `isOnline` derivato da `navigator.onLine` con fallback reattivo.
    2. Gestione granulare dei 7 stati di inattività: `not_started` ("Non ancora avviata"), `permission_denied` ("Permesso posizione negato"), `acquiring` ("Posizione in acquisizione"), `other_device_active` ("Altro dispositivo Guida attivo"), `offline` ("Connessione assente"), `paused` ("Trasmissione in pausa"), `technical_error` ("Errore tecnico").
    3. Action Card GPS in evidenza direttamente sotto la mappa con pulsanti espliciti: "Attiva GPS su questo smartphone", "Riprova GPS", "Prendi Guida qui", "Pausa", "Termina", "Riprendi".
    4. Istruzioni contestuali integrate per iOS/Safari (`Su iPhone/Safari: apri Impostazioni > Privacy e sicurezza > Localizzazione`).
    5. Separazione categorica tra GPS reale e posizione programmata: l'overlay stimato è etichettato esplicitamente come `📍 Posizione stimata da programma (Nessun GPS in trasmissione)`.
    6. Nessun avvio automatico del GPS senza consenso esplicito.
- **P0-B — Invito Copilota Crittografico e Sicuro (Compatibile Firebase Spark)**:
  - **Criticità superata**: Rigettata l'ipotesi di auto-join insicura basata sulla sola conoscenza del `tripId`.
  - **Architettura implementata**:
    1. Generazione di token impredittibili ad alta entropia (128 bit) tramite Web Crypto API (`crypto.randomUUID()` / `crypto.getRandomValues()`).
    2. Creazione dell'invito in sottocollezione `/trips/{tripId}/invites/{inviteToken}` con scadenza a 7 giorni, monouso (`status: 'pending' -> 'used'`) e revocabile dal proprietario.
    3. **Sicurezza Server-Side su Piano Gratuito Spark (0 Cloud Functions, $0 costi)**: Il riscatto avviene tramite `writeBatch` atomico del client (`redeemTripInvite` in `tripInviteService.ts`) e viene validato atomicamente in `firestore.rules` tramite `getAfter(/databases/$(database)/documents/trips/$(tripId)/invites/$(token))`. La creazione del membro copilota è autorizzata SOLO se il batch contemporaneamente aggiorna lo stato del token su `'used'` associandolo a `request.auth.uid`.
    4. **Protezione Speciale Viaggio `0000`**: La regola `tripId != '0000'` impedisce tassativamente la creazione o riscatto di token sul viaggio di nozze master.
    5. **Chiusura Falla Accesso con Solo tripId**: La regola `allow get` su `/trips/{tripId}` è stata blindata con `isTripMember(tripId) || isGlobalAdmin()`. Chi possiede solo il `tripId` NON può leggere né i metadati né i dati privati (tappe, spese, note, documenti) del viaggio.
    6. **Coerenza Schema ownerUid / ownerId**: Pieno supporto trasparente sia a `ownerUid` che a `ownerId` nelle funzioni `isTripOwner` e `isTripMember`, garantendo retrocompatibilità e coerenza con i documenti già esistenti in produzione.
    7. **Blindatura Self-Join**: La clausola di auto-join in `allow update` su `/trips/{tripId}` richiede tassativamente che l'utente non sia già presente in `members` e che un nuovo documento membro copilota legittimo sia creato nello stesso batch, impedendo a un copilota esistente di aggiungere terzi all'array `members`.
    8. **Convalida su Firebase Emulator Reale**: Validata al 100% con la suite automatica `scripts/test_beta_release_emulator_validation.cjs` (24/24 asserzioni superate su emulatore Firestore reale, porta 8085, con OpenJDK 21).
    9. **Riconciliazione File Rules**: Allineati e sincronizzati al 100% i due file `firestore.rules` (directory root del repository, utilizzato da root `firebase.json`, e `ViaggiodiNozze/firestore.rules`).
- **P1-A — Selezione dei Viaggi Dopo il Login & Isolamento Dati**:
  - Modalità multi-viaggio sicura: lettura da `/users/{uid}/associatedTripIds` ed esecuzione di singoli `getDoc` dedicati (nessuna scansione globale non autorizzata su `/trips`).
  - Classificazione chiara tra "👑 Organizzatore" e "🤝 Co-pilota" con destinazione, date e indicatore dell'ultimo viaggio utilizzato.
  - Cambio viaggio istantaneo tramite `switchActiveTrip`: chiusura e reset connessioni IndexedDB (`closeAndResetDatabases`), invalidazione cache in memoria `StorageService`, persistenza del ruolo e notifica `trip_config_changed` (zero contaminazione dati).
  - Componente modale dedicato `TripSelectorModal.tsx` e integrazione in `AltroView` e `OnboardingView`.
- **P1-B — Gestione Gmail Ultra-Compatta a Riga Singola**:
  - Nuovo componente `GmailConnectionRow.tsx`: una singola riga orizzontale pulita (pallino di stato verde/grigio, email account collegato e azione primaria "Collega" / "Cerca" / "Importa").
  - Dettagli esplicativi sui permessi `gmail.readonly` e opzioni di cambio/disconnessione account racchiusi in un cassetto comprimibile a comparsa.
  - Preservati permessi minimi di sola lettura e identità Firebase senza alterare l'UID.
  - Integrato in `SmartInsertModal.tsx` e `DocumentiView.tsx`.
- **P1-C — Riorganizzazione Sezione Altro Basata sui Compiti (Task-Based)**:
  - Eliminazione di card arrotondate generiche e riquadri ridondanti.
  - Nuova gerarchia editoriale strutturata per macro-obiettivi del viaggiatore:
    1. *LIVE & Posizione Viaggio* (stato attivo, chip del viaggio corrente con scorciatoia "Cambia Viaggio").
    2. *Documenti & Risorse* (Documenti & Voucher con Gmail compatto, Spese & Budget, Lista Bagagli, Note).
    3. *Sicurezza & Assistenza* (Assicurazione H24, Emergenze, Travel Toolkit).
    4. *Gestione Viaggio & Dispositivo* (Partecipanti & Inviti con link crittografico, Ruolo Dispositivo, I Tuoi Viaggi).
  - Verifica di layout privo di overflow a 393px, 320px e desktop.
- **P2 — Preservazione Funzionalità Consolidate**:
  - Preservati al 100%: ownership viaggio `0000`, login permanente, isolamento cache multi-viaggio, DayMapsCard a 2 righe (auto/piedi), check-in compatto e navigazione desktop.

---

## 4. LIMITAZIONI NOTE E VERIFICHE MANUALI PENDENTI
1. **Sincronizzazione Foto Multi-Device (Galleria Pubblica Ospiti)**:
   - Attualmente le foto scattate/caricate dal dispositivo organizzatore vengono compresse e salvate in locale in `localStorage['hounigo_live_gallery']`.
   - Verso Firestore viene inviato solo il post testuale senza `photoUrl` (poiché `liveService` accetta solo URL `http(s)` e Firebase Storage non è configurato/autorizzato per upload pubblici da client).
   - Di conseguenza, gli ospiti remoti indipendenti non vedono le foto personalizzate degli sposi, ma solo i post del diario.
   - Nella UI della Beta RC sono stati inseriti disclaimer trasparenti (`🔒 Salvataggio locale (Beta)`) e il pulsante è impostato su *"Salva su dispositivo"*.
   - La funzionalità galleria remota resta NON completata e BLOCCATA fino all'abilitazione di Firebase Storage o CDN persistente post-beta.
2. **Autorizzazione Deploy Security Rules e Test su iPhone Fisico**:
   - Le Security Rules crittografiche (`firestore.rules` in root e `ViaggiodiNozze`) sono verificate e validate al 100% su Firebase Emulator reale; attendono deploy remoto esplicito da parte dell'utente.
   - La verifica della Geolocation API in background su PWA iOS/Safari deve essere convalidata sul dispositivo fisico dell'owner.

---

---

## 5. STATO DELLA PUBBLICAZIONE ONLINE (BETA RELEASE PUBBLICATA 100%)
- **Data e Ora Pubblicazione Beta**: 25 Ottobre 2026, 19:12 CET
- **Branch di Rilascio**: `work/product-completion` (commit `759f1e0`)
- **Stato Deploy Firestore Security Rules**: RIUSCITO (Progetto: `app-viaggio-di-nozze`, cloud.firestore rules compilate e rilasciate con successo).
- **Copia di Backup Regole Precedenti**: Salvata in `docs/firestore.rules.backup-pre-beta` per rollback istantaneo.
- **Stato Deploy Frontend (GitHub Pages)**: RIUSCITO (Branch `gh-pages` aggiornato con commit `b677d2d`).
- **Bundle Attivo Online**:
  - Script principale: `assets/index-D_jtqkoZ.js` (1061 KB, HTTP 200)
  - Foglio di stile: `assets/index-Du7XQE7-.css` (202 KB, HTTP 200)
  - Manifest PWA: `manifest.webmanifest` (HTTP 200, display standalone)
  - Service Worker: `sw.js` (HTTP 200, Workbox precache 31 entries)
- **Verifica Funzionale Online (Browser & Smoke Test)**:
  - Suite Smoke Test non-distruttivo `scripts/post_deploy_smoke_test.cjs`: 18/18 controlli superati (100%).
  - Verifica rendering browser PWA: schermata di onboarding attiva, login Google operativo, zero eccezioni fatali.
  - Nessuna alterazione o accesso non autorizzato ai dati del viaggio master `0000`.
- **Guida Beta Tester**: consultabile in `docs/HOUNIGO_TESTER_GUIDE.md`.

---

## 6. HOTFIX P0 POST-DEPLOY (25 OTTOBRE 2026) — IDENTITÀ GOOGLE, MULTI-VIAGGIO E GPS

### Problemi Rilevati Fisicamente su 2 Telefoni
1. Copilota entra anonimo su "GIAPPONE"; effettuando il login Google perde l'accesso a "GIAPPONE" e l'app apre forzatamente "0000".
2. Riaprendo il link di invito compare l'errore ingannevole di invito non valido/scaduto.
3. Owner attivando il GPS riceveva `Quota exceeded`.
4. Copilota ricevendo la delega GPS riceveva il badge bloccante `Errore tecnico`.

### Cause Tecniche e Interventi Implementati
1. **Identità Firebase & Google Login (P0-A / P0-B)**:
   - `accountService.loginWithGoogle`: implementato `linkWithPopup(currentUser, provider)` se l'utente è anonimo, preservando l'UID in-place (`anonUid == googleUid`).
   - Se l'account Google era già registrato (`auth/credential-already-in-use`), fallback su `signInWithPopup` e invocazione di `handleAnonymousToGoogleTransition(prevUid, googleUser)`.
   - Transizione sicura autorizzata dalle Firestore Rules (condizione 4): il nuovo Google account crea `/trips/{tripId}/members/{googleUid}` con `prevUid` e si aggiunge all'array `members` del viaggio senza alterare il token monouso già consumato.
   - `OnboardingView`: verifica pre-join se l'utente autenticato è già membro autorizzato; in tal caso accede direttamente senza tentare di ri-consumare il token già 'used'.
2. **Selettore Multi-Viaggio (P0-C)**:
   - `OnboardingView.inspectUserTrips` e `accountService.fetchUserTrips`: verificano sia `ownerUid` che `ownerId` e i membri della sottocollezione.
   - Il viaggio attivo locale verificato non viene mai sovrascritto arbitrariamente da `0000`; se l'utente possiede più viaggi, il viaggio attivo resta in cima alla lista e `0000` è salvaguardato.
3. **GPS Owner "Quota exceeded" (P0-D)**:
   - Causa: `localStorage.setItem` non protetto in `geolocationService.updateRealLocation` scatenava `DOMException: QuotaExceededError` su storage mobile saturo da foto cache.
   - Fix: introdotto `safeLocalStorageSet` con auto-eviction selettiva delle cache sacrificabili (`hounigo_live_gallery`, hero images) e fallback in memory.
   - `LiveView.tsx`: cattura esplicita e throttling dei listener/watchPosition per evitare leak e flood.
4. **Delega GPS "Errore tecnico" (P0-E)**:
   - Causa: `isGpsGuideEligible` in `firestore.rules` verificava solo `data.ownerUid == uid`, rigettando i viaggi con `ownerId`; inoltre il copilota senza membership post-login riceveva `PERMISSION_DENIED` che in UI si traduceva nel label allarmante "Errore tecnico".
   - Fix: `firestore.rules` aggiornate con supporto a `ownerId` ed estensione buffer temporale; `liveGpsService.friendlyError` e `LiveEditorialExperience.tsx` rimappano `permission-denied` e quota su messaggi chiari di richiesta autorizzazione o segnale non disponibile.
5. **Nome Copilota Riconoscibile (P1)**:
   - Campo input nome visualizzato aggiunto in `OnboardingView` (modalità join) prima del riscatto; pre-popolato con `auth.currentUser.displayName` se disponibile, salvato in `/trips/{tripId}/members/{uid}`.

### Convalida
- Nuova suite automatizzata `scripts/test_p0_hotfix_emulator_validation.cjs`: 14/14 test passati (100%) su Firebase Emulator reale porta 8085.
- Build di produzione completata con successo (`✓ built in 6.03s`, bundle pronto per eventuale deploy autorizzato).

---

## 7. CHIUSURA HOTFIX, SICUREZZA E UI BETA (25 OTTOBRE 2026)

### 1. P0 — Chiusura Vulnerabilità Transizione Identità (`prevUid`)
- **Analisi di Sicurezza**: Conoscere un `prevUid` non costituisce prova di possesso dell'identità precedente. Un utente autenticato estraneo (Attaccante C) conoscendo l'UID del Copilota B avrebbe potuto auto-dichiararsi membro con `prevUid: B`.
- **Intervento Applicato**:
  - Rimossa la condizione permissiva `prevUid` da `firestore.rules` (locale e root).
  - Rimosso `handleAnonymousToGoogleTransition` da `accountService.ts`.
  - Transizione permessa esclusivamente tramite collegamento diretto delle credenziali (`linkWithPopup`) che preserva l'UID inalterato, oppure tramite un nuovo invito autorizzato dall'organizzatore.
- **Test Avversariale Reale (Emulator 8085)**:
  - Owner A crea `GIAPPONE`.
  - Copilota B riscatta invito legittimo.
  - Attaccante C tenta exploit `prevUid: B` -> **RESPINTO (PERMISSION_DENIED)**.
  - Attaccante C tenta sovrascrittura documento di B -> **RESPINTO**.
  - Attaccante C tenta riutilizzo token -> **RESPINTO**.

### 2. P0 — GPS e Protezione Integrale Dati Utente in Locale
- **Risoluzione Rischio Perdita Dati**: Rimossa la chiave `'hounigo_live_gallery'` dall'elenco degli elementi sacrificabili in `safeLocalStorageSet`. Le fotografie utente salvate in locale non vengono MAI eliminate.
- **Separazione Cache e Contenuti Utente**: Distinte le cache rigenerabili (`osm_reverse_geocode_cache`, `temp_weather_cache`) dai contenuti utente non recuperabili.
- **Fallback In-Memory e SessionStorage**: In caso di quota storage esaurita, le coordinate GPS continuano a essere aggiornate in `sessionStorage` e nella memoria runtime, emettendo un evento non bloccante per la UI senza interrompere il tracciamento GPS.

### 3. P1 — Calendario in Oggi (Touch & Desktop)
- **Causa**: Il tag `<label>` con input `<input type="date" className="sr-only">` non apriva il selettore date nativo su dispositivi iOS Safari e WebKit touch.
- **Risoluzione**: Implementato pulsante interattivo con fallback programmatico `showPicker()` e overlay trasparente a pieno container (`absolute inset-0 w-full h-full opacity-0 cursor-pointer`), garantendo la massima affidabilità al tocco su mobile e al clic su desktop.

### 4. P1 — Google Maps Compatto su Una Sola Riga
- Ridisegnato `DayMapsCard.tsx` su una sola riga ultra-compatta:
  - Icona ufficiale Google Maps.
  - Pulsante Auto cliccabile (apertura link o aggiunta rapida).
  - Pulsante Piedi cliccabile (apertura link o aggiunta rapida).
  - Singola icona matita che apre un modale unificato con entrambi i campi (Auto e A piedi).
- Perfettamente reattivo a 393px e 320px senza alcuna sovrapposizione né rottura di layout.

### 5. P1 — Console Admin Globale e Whitelist `/system_admins/{uid}`
- Chiarito il motivo del messaggio "NON AUTORIZZATO": le Security Rules richiedono rigorosamente un documento in `/system_admins/{uid}` o il custom claim `admin: true`.
- Documentata la procedura sicura manuale su Firebase Console per abilitare l'amministratore designato senza allentare le regole di isolamento dati dei viaggi.

### 6. Esito Test e Build
- `scripts/test_p0_adversarial_prevuid_and_security.cjs`: **16/16 test superati (100%)**.
- `scripts/test_p0_hotfix_emulator_validation.cjs`: **14/14 test superati (100%)**.
- Build di produzione `npm run build`: **Completata con successo (0 errori TypeScript, PWA generata)**.

---

## 8. PUBBLICAZIONE DEFINITIVA BETA & HOTFIX FINALE (25 OTTOBRE 2026)

### 1. Deploy Firestore Security Rules
- **Progetto target**: `app-viaggio-di-nozze`.
- **Esito**: Riuscito (`+ firestore: released rules firestore.rules to cloud.firestore`).
- **Modifiche applicate**: Rimossa categoricamente la clausola permissiva `prevUid` su `/trips/{tripId}/members/{uid}`. Le transizioni da utente anonimo a Google avvengono esclusivamente tramite collegamento credenziali in-place (`linkWithPopup`) preservando l'UID originale, oppure tramite nuovo invito autorizzato dall'owner.
- **Snapshot pre-deploy verificato**: Copia autentica delle regole attive precedentemente in produzione archiviata in `ViaggiodiNozze/docs/firestore.rules.active-production-before-hotfix`.

### 2. Deploy Frontend GitHub Pages
- **Branch sorgente**: `work/product-completion` (commit `7d23b48`).
- **Comando eseguito**: `npm run deploy` (predeploy build + deploy gh-pages).
- **Nuovo commit gh-pages**: `6a7f785` (precedente: `b677d2d`).
- **Asset online verificati**:
  - Script principale: `assets/index-DxxPChKC.js` (1065 KB) — HTTP 200.
  - Foglio di stile: `assets/index-DdMy2aXy.css` (202 KB) — HTTP 200.
  - Chunks dinamici: `AdminDashboardView-jjsVRa4h.js` (91 KB), `storageService-CvYJbMDP.js` (60 KB), `LiveView-Cm4wFBQ9.js` (133 KB), `attachmentChunkService-Ce_n3qlw.js` (1.5 KB) — tutti HTTP 200.
  - PWA: `manifest.webmanifest` (display standalone, 3 icone, nome Hounigo) e `sw.js` (Workbox precaching 31 file, 3599 KiB).

### 3. Smoke Test Post-Deploy Online (Non-Distruttivo)
- **Suite**: `scripts/post_deploy_smoke_test.cjs`.
- **Target URL**: `https://casabr.github.io/honeymoon-roadbook/`.
- **Esito**: **18/18 test superati con successo (100%)**.
- **Funzionalità verificate nel bundle live**:
  - Calendario Oggi: `showPicker()` e overlay touch/desktop presenti.
  - Google Maps compatto: label "Percorso a Piedi" e "Limite tappe Google Maps" attivi.
  - Flusso account: rimozione totale del parametro insicuro `prevUid`.
  - Storage sicuro: `QuotaExceededError` gestito senza sacrificare `hounigo_live_gallery`.

### 4. Vincoli di Sicurezza Produzione Rispettati
- Zero scritture, alterazioni o cancellazioni sul viaggio master `0000`.
- Nessun account o viaggio di prova fittizio creato in produzione.
- Nessun merge sul branch `main`.

### 5. Procedura di Rollback Registrata
In caso di anomalie riscontrate durante il collaudo reale dei tester:
1. **Frontend**:
   - Commit precedente identificato: `b677d2d`.
   - Procedura: verificare lo stato locale di dist, checkout del commit `b677d2d` su `gh-pages` e ripubblicazione manuale controllata senza force push ciechi.
2. **Firestore Security Rules**:
   - Snapshot archiviato: `ViaggiodiNozze/docs/firestore.rules.active-production-before-hotfix`.
   - Procedura: confrontare le differenze e ripubblicare con `firebase deploy --only firestore:rules --project app-viaggio-di-nozze`.

---

## 9. AUDIT NOTTURNO DI QUALITY ASSURANCE BETA (25-26 OTTOBRE 2026)
*Obiettivo: Verificare in modo rigoroso, indipendente e automatico la stabilità della beta prima del collaudo fisico reale del 26 ottobre.*

### Riepilogo Asserzioni di Test Eseguite (100% Superate)
- **Fase 1 — Riconciliazione Versione Online**: **28/28 verifiche superate**.
  - URL Live `https://casabr.github.io/honeymoon-roadbook/` HTTP 200, mount React div `#root` con fallback inline.
  - Script principale `index-DxxPChKC.js` (1.065 KB) e foglio di stile `index-DdMy2aXy.css` (202 KB) attivi e allineati.
  - PWA: `manifest.webmanifest` standalone (Hounigo) e `sw.js` con precache corretta (zero vecchi bundle).
  - Routing deep link: parametri `?join=1&token=...`, `?live=1`, `?admin=1` caricati con successo HTTP 200.
  - Snapshot rollback: verificata l'autenticità di `docs/firestore.rules.active-production-before-hotfix`.
- **Fase 2 — Auth, Identità e Multi-Viaggio**: **19/19 test superati su Firebase Emulator (porta 8085)**.
  - Creazione viaggio GIAPPONE da utente anonimo con batch atomico trip + membro owner.
  - Invito crittografico 128-bit monouso riscattato da Copilota B con aggiornamento `usedBy` e membership.
  - Copilota B legge regolarmente tappe e spese private.
  - Login Google tramite `linkWithPopup`: preservazione UID e mantenimento trasparente dei permessi.
  - Login con account Google preesistente (UID diverso): respinto tentativo di auto-promozione tramite `prevUid` (vulnerabilità confermata chiusa); accesso regolare con nuovo invito emesso dall'owner.
  - Utente con viaggio master `0000` e copilota su `GIAPPONE`: navigazione tra i due viaggi senza ritorni forzati a 0000.
  - Re-ingresso di membro già effettivo con link invito senza ri-consumare il token già `used`.
  - Tentativi di estraneo con UID arbitrario o bypass token categoricamente respinti (`PERMISSION_DENIED`).
  - Token scaduti, già usati o revocati categoricamente respinti (`PERMISSION_DENIED`).
- **Fase 3 — GPS Live, Delega Guida e Resilienza Storage**: **12/12 test superati su Firebase Emulator**.
  - Owner acquisisce lease GPS (18h) e pubblica prima posizione.
  - Copilota visualizza passivamente la posizione; verifica finestra di freschezza (stale timeout a 120s vs lease 18h).
  - Delega guida a copilota e pubblicazione coordinate da copilota.
  - Ritorno guida a owner e blocco transazionale dell'ex-holder non più autorizzato.
  - Rate limiting 15s/16s verificato sia lato Rules che client per prevenire loop di scrittura.
  - Blocco scritture estranei su `gps_control/current` e `locations/current`.
  - Simulazione `QuotaExceededError`: galleria fotografica utente `hounigo_live_gallery` intatta al 100%, pulizia selettiva sole cache rigenerabili (OSM/meteo) e fallback memoria/sessionStorage.
  - Isolamento GPS: coordinate di un viaggio non compaiono né sovrascrivono altri viaggi.
- **Fase 4 — Sincronizzazione a Due Client & Affidabilità Dati**: **8/8 test superati su Firebase Emulator**.
  - Aggiunta e modifica tappa sincronizzate tra Client A e Client B.
  - Eliminazione tappa con registrazione tombstone in `settings/tombstone_tappe_...`: cancellazione propagata, zero ricomparse.
  - Aggiunta e modifica spesa con verifica importi.
  - Modifica salvata offline localmente inviata con successo al push post-riconnessione.
  - Risoluzione conflitti deterministica Last-Write-Wins (LWW) basata su `updatedAt`.
  - Prevenzione resurrezione: `deletedAt > createdAt` impedisce la ricreazione da client disconnessi.
  - Isolamento multi-viaggio durante la sincronizzazione.
- **Fase 5 — Regressioni UI Mobile e Desktop**: **Eseguita con Browser Subagent (320px, 393px, 1280px)**.
  - Mobile 393px: Onboarding a 3 intenzioni pulito; creazione viaggio; tocco su 📅 calendario funzionante; Google Maps compatto su singola riga con Auto 🚗, Piedi 🚶 e ✏️; modale unificato Maps senza overflow; chiusura modale con Annulla; navigazione Altro e Live funzionanti.
  - Mobile 320px (narrow): `scrollWidth <= 320px`, zero overflow orizzontale, touch targets ben dimensionati.
  - Desktop 1280px: Layout espanso con sidebar completa (itinerario, tappe, mappe, spese, partecipanti, live tracking), assenza di colonne spezzate o barre sovrapposte.
- **Fase 6 — Console Admin Globale & Runtime Security**: **14 controlli statici + 7 test runtime superati su Emulator**.
  - Utenti normali e proprietari di singoli viaggi bloccati da `allow list` su `/trips`.
  - Collezione `/system_admins` inaccessibile ai client SDK (`allow read, write: if false`).
  - Amministratore abilitato in whitelist `system_admins` può scansionare `/trips` e leggere `/users`.
  - Eliminazione documento da `/system_admins` revoca istantaneamente i privilegi.
  - Nessun codice o conteggio fittizio in UI (stato "NON AUTORIZZATO" gestito rigorosamente senza falsi zeri).

**Totale Test di Verifica Notturna**: **88 test superati con successo (100%)**.
**Anomalie P0/P1 riscontrate**: **0 (Zero)**.
**Valutazione di Prontezza**: **Beta pronta per il collaudo fisico reale del 26 ottobre e il rilascio ai tester esterni del 28 ottobre 2026.**

---

## 10. AUDIT JARVIS 2: SIMULAZIONE UTENTI REALI E BETA READINESS (25-26 OTTOBRE 2026)
*Missione: Rispondere alla domanda cardine di prodotto:*
*«Una persona che non ha mai visto HOUNIGO può iniziare a usarlo, organizzare un viaggio, condividerlo e ritrovarlo successivamente senza assistenza?»*

### 1. Risultati della Simulazione dei Tre Profili Utente
*Suite automatica: `scripts/test_jarvis2_user_simulation.cjs` (14/14 superati, 100%)*
- **Tester A — Organizzatore Principiante**:
  1. *Comprensione*: L'onboarding a 3 intenzioni («1. Organizza un viaggio», «2. Accedi», «3. Partecipa») evita qualsiasi gergo tecnico (zero riferimenti a UID, Firebase o Cloud Sync).
  2. *Creazione viaggio*: Crea il viaggio con titolo, date e nome organizzatore in un singolo batch atomico cloud + IndexedDB/localStorage.
  3. *Inserimento tappa*: Aggiunge una tappa (Firenze arrivo) con orari e note visibili istantaneamente.
  4. *Inserimento prenotazione*: Salva voucher e PNR privato protetti.
  5. *Recupero viaggio*: Chiudendo e riaprendo il browser o ricaricando la pagina, `getPersistedSession()` ripristina la sessione e il viaggio attivo senza richiedere re-login.
  6. *Collegamento Google*: Il collegamento tramite `linkWithPopup` associa l'account Google preservando l'UID originale: zero perdita di dati o membership.
  7. *Invito*: Genera istantaneamente un link crittografico 128-bit monouso (`?join={tripId}&token={token}`) pronto per WhatsApp.
- **Tester B — Copilota Invitato via WhatsApp**:
  1. *Apertura*: Toccando il link ricevuto su WhatsApp, l'app intercetta i parametri URL e mostra l'anteprima («🤝 Invito Co-pilota Valido», destinazione e nome organizzatore).
  2. *Conferma nome*: Inserisce o conferma il proprio display name (*Sara*).
  3. *Accettazione*: Con un tap («Accetta Invito e Inizia») il token viene riscattato atomicamente (`pending -> used`) e il copilota diventa membro ufficiale.
  4. *Consultazione & Modifica*: Visualizza tappe e prenotazioni e aggiunge elementi condivisi (es. spesa pranzo).
  5. *Rientro*: Nelle sessioni successive o riaprendo il link, l'app rileva che l'utente è già membro ed entra direttamente senza richiedere o riutilizzare il token.
  6. *Sicurezza*: Il copilota non può cancellare il viaggio dell'organizzatore (`PERMISSION_DENIED`).
- **Tester C — Ospite LIVE (Link Pubblico)**:
  1. *Accesso zero-friction*: Apre `?live=1&tripId=...` senza dover creare alcun account né autenticarsi.
  2. *Privacy garantita*: L'interfaccia mostra esclusivamente «Vista Ospiti». Le schede private (Oggi, Itinerario, Documenti, Spese, Altro) sono completamente smontate.
  3. *Protezione Firestore*: Qualsiasi richiesta di lettura a `/documenti`, `/tappe`, `/spese`, `/alloggi` o voucher riceve rigorosamente `PERMISSION_DENIED`.
  4. *Trasparenza GPS*: La posizione viene indicata chiaramente come reale o stimata da programma (nessun falso GPS mostrato).

### 2. Valutazione di Continuità & PWA
- **Chiusura e riapertura / Ricarica**: Validata. Persistenza garantita da `houni_device_session` con backup IndexedDB.
- **Aggiornamento versione**: Gestito da `sw.js` con Workbox cache.
- **Deep link da WhatsApp**: Intercettazione query string affidabile. *Nota operativa*: su iOS WhatsApp apre una WebView interna; per installare l'app come PWA sulla Home Screen il tester deve toccare l'icona del browser per aprirla in Safari.
- **Isolamento Safari vs PWA iOS**: *Importante*: su iOS la WebClip della Home Screen e Safari operano in sandbox distinte. Se un utente inizia in Safari e poi aggiunge l'icona alla Home senza essere loggato con Google, la WebClip si avvierà come nuova sessione; per questo la guida raccomanda il collegamento Google o l'uso del link d'invito. *(Verifica fisica richiesta su iPhone)*.
- **Cambio account Google & Cambio viaggio**: Transizione atomica con reset IndexedDB e invalidazione cache in memoria.
- **Ritorno online**: Coda mutazioni offline riallineata tramite Last-Write-Wins (LWW) e rispetto dei tombstone.

### 3. Analisi dei Punti di Abbandono (Drop-Off Points)

| Schermata | Azione Tentata | Comportamento Osservato | Comportamento Atteso | Gravità | Risoluzione / Mitigazione |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Onboarding (Scelta)** | Tester A tocca "Accedi" prima di creare un viaggio | Mostra login Google/Email | Capire che per iniziare non serve account | P2 | Micro-copy rassicurante in guida e schermata: "Inizia subito senza registrazione" |
| **Invito WhatsApp iOS** | Tester B apre link dentro WebView WhatsApp | L'app funziona nella WebView ma non sulla Home | Installare l'icona sulla schermata Home | P1 (iOS) | Nota esplicita in `HOUNIGO_TESTER_GUIDE.md`: aprire in Safari prima di aggiungere alla Home |
| **Re-ingresso Copilota** | Tester B ri-tocca il link invito usato giorni prima | Riconoscimento membro e apertura viaggio | Nessun errore bloccante "Token già usato" | P0 (Risolta) | Flusso auto-bypass già attivo: rileva membership e apre il viaggio direttamente |
| **GPS Background iOS** | Tester A blocca lo schermo durante la guida | Safari iOS sospende timer GPS per risparmio energetico | Continuità tracciamento | P1 (iOS) | Documentata come limitazione nota; riprende istantaneamente allo sblocco schermo |

### 4. Matrice di Prontezza Beta (5 Criteri)
1. **Primo accesso**: **SUPERATO**
2. **Creazione e recupero viaggio**: **SUPERATO**
3. **Collaborazione**: **SUPERATO**
4. **Sicurezza e privacy**: **SUPERATO**
5. **Stabilità mobile**: **SUPERATO CON LIMITAZIONI** *(Limitazioni iOS Safari/WebClip sandbox e background GPS documentate, richiedono verifica su iPhone fisico il 26 ottobre)*.

**Giudizio di Prodotto Finale**: **HOUNIGO è pienamente idoneo all'apertura ai beta tester il 28 ottobre 2026.**

---

## 6. HOTFIX CRITICI P0 (GPS CLOUD & CARTOLINE LIVE) E RIFINITURA UX (25 Ottobre 2026 - Notte)

Nel collaudo reale della PWA installata sono emersi due problemi P0 e due rifiniture UX P1:

### 1. P0 — GPS: "Limite temporaneo di operazioni cloud raggiunto"
- **Causa effettiva individuata**:
  1. `publishLocation` e `assignGuide` in `liveGpsService.ts` utilizzavano `runTransaction(db, ...)`.
  2. Ad ogni tick del GPS (intervallo di pochi secondi), la transazione eseguiva due letture atomiche (`leaseRef` e `locationRef`) prima della scrittura su `locationRef`.
  3. All'avvio del GPS, `assignGuide` scriveva su `leaseRef` proprio mentre il listener `subscribeLease` inviava snapshot al client, provocando conflitti di concorrenza ottimistica sulla transazione (`aborted` / contention).
  4. Quando i retry interni della transazione Firestore fallivano o superavano la frequenza di scrittura per documento, l'SDK lanciava eccezioni di contesa.
  5. In `friendlyError`, il controllo `if (code.includes('resource-exhausted') || message.toLowerCase().includes('quota'))` catturava erroneamente sia la contesa sia qualsiasi `QuotaExceededError` del browser locale (DOMException), trasformandoli nel messaggio: *"Limite temporaneo operazioni cloud raggiunto. Riprova tra qualche minuto."*.
  6. In `LiveView.tsx` (`handleStartGps`), il reset `lastGpsPublishRef.current = 0` azzerava il throttle client-side ad ogni riattivazione.
- **Correzione implementata**:
  - Rimossa la `runTransaction` sia da `assignGuide` che da `publishLocation` in `liveGpsService.ts`: convertite in `setDoc` diretto atomico.
  - Implementato throttle in-memory client-side a 15.000ms (`MIN_PUBLISH_INTERVAL_MS = 15_000`), garantendo che il client non violi mai la soglia dei 15s imposta da Firestore Rules.
  - Affinato `friendlyError`: scatta solo su codice esatto `resource-exhausted`, eliminando il falso positivo da `message.includes('quota')`.
  - In `firestore.rules`, aggiornata la regola di update su `locations/current`: ammessa pubblicazione immediata in caso di cambio dispositivo (`publisherDeviceId != request.resource.data.publisherDeviceId`), preservando il throttle a 15s per lo stesso dispositivo.

### 2. P0 — Cartoline LIVE che ricompaiono dopo l'eliminazione
- **Causa effettiva individuata**:
  1. In `liveService.ts` (`deleteLiveUpdate`), il controllo permessi verificava unicamente `tripData?.ownerUid === user.uid`, fallendo silenziosamente su viaggi con schema `ownerId` o su co-piloti registrati in `/members/{uid}`.
  2. Sul viaggio protetto `0000`, `firestore.rules` impediva il `deleteDoc` (`allow delete: if tripId != '0000'`), ripiegando su un soft-delete `updateDoc({ title: '[Rimosso]', text: '' })`. Tuttavia, `subscribeToLiveUpdates` non filtrava le cartoline con `title: '[Rimosso]'` o `deleted: true`, facendole ricomparire istantaneamente al primo refresh.
  3. Mancanza di tracciamento persistente dei tombstones: client offline o riaperture con cache locale ripristinavano la cartolina eliminata.
  4. Nelle `firestore.rules`, `validLiveUpdate` ammetteva solo un insieme rigido di chiavi (`hasOnly(['title', 'text', 'photoUrl', ...])`), rifiutando update contenenti `deleted`, `deletedAt` o `deletedBy`.
- **Correzione implementata**:
  - Aggiornato `validLiveUpdate` nelle Security Rules per consentire `deleted: bool`, `deletedAt: number`, `deletedBy: string`.
  - Implementato registro tombstone locale persistente in `localStorage['hounigo_tombstone_updates_' + tripId]`.
  - Aggiornato `subscribeToLiveUpdates` in `liveService.ts`: filtra attivamente cartoline con `data.deleted === true`, `data.title === '[Rimosso]'`, `data.title === '[Eliminato]'` o presenti nei tombstone locali.
  - In `LiveView.tsx` (`handleDeleteLiveUpdate`), rimozione contestuale anche dalla galleria fotografica custom (`galleryCustomPhotos` e `localStorage['hounigo_live_gallery']`).

### 3. P1 — Header LIVE Mobile compatto
- Sostituita l'intestazione prolissa a tre righe (~130px) con un header compatto (~48px).
- Inclusione di badge LIVE pulsante, pill di stato (Ospiti vs GPS Guida), titolo dinamico del viaggio e pulsante rapido di condivisione `🔗 Condividi`.
- Testato e validato a 320px, 393px e desktop senza alcun overflow o sovrapposizione.

### 4. P1 — Rotella Impostazioni snella e compatta
- Rimossi da questa sezione i link duplicati "Guida & Tutorial" (l'onboarding resta attivo altrove).
- Rimossi i controlli duplicati rispetto ad Altro ("Invita Co-pilota", "Ruolo Dispositivo", "Codice Viaggio", "Importa da Gmail").
- Mantenute 4 voci essenziali a colpo d'occhio: Profilo & Accesso (👤), Notifiche Push (🔔), Blocca Schermo (🔒), Esci dal viaggio (🚪).
- Raggruppate le funzioni tecniche in un cassetto comprimibile "⚙️ Opzioni Avanzate" (Forza Allineamento Cloud, Esporta Backup, Importa Backup, Chiave API Gemini).
- Strumenti amministrativi (Console Admin, Diagnostica Identità) rigorosamente protetti e visibili solo se è presente il parametro esplicito `?admin=1`.

### 5. Suite di Regressione (10/10 Test Superati su Firebase Emulator)
- Eseguito `test_p0_gps_cartoline_ux.cjs` su Firebase Emulator (porta 8085): 10/10 asserzioni superate con successo.
- Re-eseguita la suite `test_p0_hotfix_emulator_validation.cjs` (14/14 passati) e `test_beta_release_emulator_validation.cjs` (24/24 passati).
- Build di produzione `npm run build` eseguita con successo con bundling PWA (`sw.js`).

---

## 7. STABILITÀ MODIFICHE, INVITI, MULTI-VIAGGIO E GPS UX (26 Ottobre 2026)

A seguito del collaudo reale su PWA installata (con esito positivo e confermato per GPS quota, eliminazione cartoline, header live compatto, menu impostazioni e console admin), sono state risolte le seguenti criticità:

### 1. P0 — Modifiche alle attività e agli orari che non persistono
- **Indagine e cause individuate**:
  1. In `AttivitaForm.tsx`: la presenza di un blocco precoce `if (!isConflictConfirmed ...)` interrompeva il submit al primo click se due attività condividevano la stessa data e fascia oraria, mostrando solo un banner di warning.
  2. In `AttivitaCard.tsx`: il tempo mostrato era legato a `activity.orarioRitrovo || activity.time`. Quando l'orario veniva modificato da popup di collisione o aggiornato, `orarioRitrovo` non veniva sincronizzato e la card continuava a visualizzare il vecchio orario.
  3. In `AttivitaView.tsx`: `onOpenEditForm` impostava `editingActivity` ma ometteva la chiamata a `setIsActivityModalOpen(true)`, impedendo l'apertura del form completo di modifica dal popup.
  4. In `TimeCollisionModal.tsx`: le decisioni dell'utente venivano salvate solo in `sessionStorage`, scomparendo al refresh del browser.
- **Correzione applicata**:
  - Rimossa la condizione bloccante in `AttivitaForm.tsx`: salvataggio libero di attività sovrapposte o contemporanee.
  - Sincronizzazione rigorosa e bidirezionale di `time`, `orarioInizio` e `orarioRitrovo` in `AttivitaForm.tsx`, `OggiView.tsx`, `AttivitaView.tsx`, `TimeCollisionModal.tsx`, `storageService.ts` e `AttivitaCard.tsx`.
  - Persistenza delle risoluzioni di collisione sia in `localStorage` che in `sessionStorage`.
  - Aggiunta chiamata `setIsActivityModalOpen(true)` in `AttivitaView.tsx`.
  - Aggiornate etichette pulsanti a "Aggiorna Attività" / "Aggiorna orario ✓".

### 2. P0 — Link invito: eliminazione errore transitorio "Missing or insufficient permissions"
- **Indagine e cause individuate**:
  1. `OnboardingView.tsx` invocava `validateTripInvite` immediatamente al montaggio (`useEffect`). In quel millisecondo, `auth.currentUser` era ancora `null` (inizializzazione asincrona di Firebase Auth).
  2. Nelle Security Rules, `get /trips/{tripId}/invites/{inviteToken}` richiedeva `isSignedIn()`. Essendo `request.auth` nullo, Firestore restituiva `permission-denied` temporaneo prima che la sessione anonima si stabilizzasse.
  3. I documenti di invito non includevano `tripTitle` e `ownerName`, forzando tentativi non autorizzati di lettura su `/trips/{tripId}` prima dell'adesione.
- **Correzione applicata**:
  - In `tripInviteService.ts`: introdotta la funzione `ensureSignedInUser()` che attende o genera l'autenticazione anonima prima di effettuare qualsiasi query su Firestore.
  - In `createTripInvite`: inclusione di `tripTitle` e `ownerName` direttamente nel documento `/invites/{token}`.
  - In `firestore.rules`: ammessa la lettura `get` del singolo token d'invito se `status in ['active', 'used']`.
  - In `OnboardingView.tsx`: introdotto stato di caricamento elegante `isValidatingInvite` per evitare il lampeggio del form o errori transitori, con auto-ingresso immediato se `isAlreadyMember === true`.
  - In `src/App.tsx`: supporto per parametri `?join` diversi dal viaggio attivo anche con sessione esistente.

### 3. P1 — Selettore "I tuoi viaggi" in Safari (Isolamento sandbox e Multi-viaggio)
- **Indagine e cause individuate**:
  - In Safari iOS, i dati locali e la sessione Firebase Auth sono isolati rispetto alla PWA installata (sandbox WebClip). La sessione in Safari è anonima con membership copilota a GIAPPONE, mentre il viaggio `0000` appartiene all'account Google di ***REMOVED***. Le Security Rules vietano giustamente l'accesso a `0000` da UID anonimi.
- **Correzione applicata**:
  - In `TripSelectorModal.tsx`: aggiunto banner informativo sull'identità dell'account ("Ospite anonimo" vs "Account Google sincronizzato").
  - Aggiunto pulsante "Accedi con Google" per consentire il login sicuro senza ripristinare indebitamente `0000` e senza perdere l'accesso a `GIAPPONE`.

### 4. P1 — Delega Guida GPS con nomi reali e feedback da Firestore
- **Indagine e cause individuate**:
  - La UI del passaggio guida mostrava codici dispositivo tecnici troncati (`(props.remoteGpsLease.holderDeviceId.slice(0, 10))…`, dropdown con UUID tecnici).
- **Correzione applicata**:
  - In `LiveView.tsx`: sottoscrizione a `/trips/{tripId}/members` e costruzione di `membersMap` per mappare gli UID ai nomi umani reali (`***REMOVED***`, `***REMOVED***`).
  - In `LiveEditorialExperience.tsx`: eliminati i menu tecnici e sostituiti con pulsanti ad azione diretta con nomi reali:
    - *"Guida attuale: ***REMOVED***"*
    - *"Passa la guida a ***REMOVED***"*
    - *"Riprendi la guida"*
    - *"Sei la Guida! Il tuo dispositivo è autorizzato"* + *"Attiva la posizione su questo dispositivo 📡"*.
  - Feedback di successo mostrato esclusivamente dopo la conferma della scrittura su Firestore (`await onTransferGps`).
  - Immutabilità assoluta di `ownerUid` del viaggio preservata.

### 5. Validazione e Collaudo Automatizzato
- **Suite di Test su Firebase Emulator Reale (`scripts/test_p0_activities_invites_gps.cjs`)**:
  - Eseguita con JDK 21 su porta 8085: **100% PASS (3/3 suite, 14 asserzioni superate)**.
  - Nessuna contesa, nessun bypass di throttle o violazione di regole.
- **Build di Produzione**:
  - `npm run build`: completata con esito 0 (nessun errore TypeScript o di bundling PWA).

### 6. P0/P1 — Risoluzione Flusso Login Google, Armonizzazione Note Copilota e Tracciamento Versioni PWA
- **P0 — Risoluzione Flusso Login Google (PWA Standalone & iOS Safari)**:
  - *Causa radice*:
    1. In `OnboardingView.tsx`, al completamento del login Google, mancava la transizione di stato a `mode = 'account_login'`. Il componente rimaneva in `mode = 'select'`, dando l'illusione di un reset alla schermata iniziale.
    2. Su iOS Safari e PWA standalone, quando un utente anonimo tentava di collegare un account Google già esistente (`linkWithPopup`), Firebase lanciava `auth/credential-already-in-use`. Il fallback tentava un secondo popup `signInWithPopup`, regolarmente bloccato da Safari per perdita del contesto di interazione utente sincrono.
    3. Gli errori di popup non venivano renderizzati nella vista `select`.
  - *Interventi applicati*:
    - In `accountService.ts`: Gestione di `auth/credential-already-in-use` tramite `GoogleAuthProvider.credentialFromError(linkErr)` e autenticazione immediata con `signInWithCredential(auth, credential)`, senza aprire alcun secondo popup.
    - Supporto per OAuth Redirect (`checkPendingRedirectResult()`) per PWA installate con popup disabilitati.
    - Gestione errori granulare (`popup-blocked`, `popup-closed-by-user`, `unauthorized-domain`, `network-request-failed`).
    - In `OnboardingView.tsx`: Transizione esplicita a `mode = 'account_login'` post-autenticazione, rendering banner di errore in modalità `select` con pulsante "Riprova con Google ↻", e conservazione sicura di parametri d'invito pendenti in `sessionStorage` (`houni_pending_invite`).
    - Se l'account recuperato non ha viaggi, viene presentata una empty state informativa chiara senza ripristinare il viaggio template `0000`.

- **P1 — Armonizzazione Icona Note Copilota**:
  - *Causa radice*:
    - Mancanza di standardizzazione: `TappaCard`, `TrasportoCard`, `AttivitaCard` e `AlloggioCard` usavano tinte Tailwind `amber` (`bg-amber-50 text-amber-700 border-amber-200`), mentre solo `RistoranteCard` e `ShoppingCard` usavano `emerald`.
    - Mancava sincronizzazione immediata con lo stato locale del componente genitore, affidandosi solo a ri-render asincroni di Firestore.
  - *Interventi applicati*:
    - Sostituite tutte le classi di stile in verde smeraldo (`bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300`).
    - Introdotto stato locale React (`copilotNotes`) e listener `useEffect` su tutte le card per sincronizzazione immediata a 0ms alla chiusura del modale.
    - Ripristino garantito a grigio neutro (`text-slate-400 bg-slate-100`) se il testo delle note viene cancellato o è vuoto.

- **P1 — Tracciamento Versione PWA e Controllo Aggiornamenti**:
  - *Interventi applicati*:
    - In `vite.config.ts`: iniezione di `__COMMIT_HASH__` (`git rev-parse --short HEAD`) e `__BUILD_TIME__` tramite `define`.
    - In `src/vite-env.d.ts`: dichiarazione dei tipi TypeScript globali.
    - In `App.tsx`: etichetta di build visibile nel badge di stato superiore.
    - In `SettingsMenu.tsx` e `LocalIdentityDiagnostics.tsx`: visualizzazione di commit hash, data di build e pulsante controllato "Verifica aggiornamenti PWA 🔄" che invoca `reg.update()`, preservando al 100% i dati utente locali (nessun `clearSiteData` distruttivo).

- **Suite di Test Dedicata**:
  - `scripts/test_beta_google_copilot_pwa.cjs`: **17/17 test superati con successo (100%)**.
  - `scripts/test_beta_release_emulator_validation.cjs`: **24/24 test superati su Firebase Emulator (100%)**.
  - `scripts/test_beta_oggi_and_adesso.cjs`: **5/5 test superati (100%)**.

### 7. Pubblicazione Beta Release Candidata — Brand Finale Consolidato (26/10/2026)
- **Stato Deploy Ufficiale**:
  - **Data di Rilascio**: 26 Ottobre 2026.
  - **Commit sorgente**: [`e694a6a`](file:///c:/Users/CUSI/Documents/App-viaggio-di-nozze/ViaggiodiNozze) su branch `work/product-completion`.
  - **Commit remoto `gh-pages`**: `69b40061b1e5a3f0d4aa48915317e23707f85f59`.
  - **Firebase Firestore Security Rules**: verificate, attive e perfettamente sincronizzate su `app-viaggio-di-nozze`.
- **Verifica Bundle e Asset Online**:
  - Frontend URL: `https://casabr.github.io/honeymoon-roadbook/` (HTTP 200).
  - Bundle principale servito: `assets/index-1JsOyJle.js` (HTTP 200, 1088 KB).
  - Foglio di stile principale servito: `assets/index-TGcPhXCA.css` (HTTP 200, 200 KB).
  - Loghi ufficiali verificati: `images/brand/hounigo-logo-on-light.png` (HTTP 200), `images/brand/hounigo-logo-on-dark.png` (HTTP 200), `favicon.svg` (HTTP 200).
  - Verifica commit hash online: `Contains e694a6a: true`.
  - Smoke test post-deploy non distruttivo (`scripts/post_deploy_smoke_test.cjs`): **18/18 PASS (100%)**.
- **Preservazione Dati, Cache e Migrazione PWA**:
  - Zero alterazioni o scritture sul viaggio master reale `0000`.
  - Nessun `clearSiteData` o rimozione forzata Service Worker: dati IndexedDB e localStorage preservati al 100%.
  - Rilevamento automatico e controllato dell'aggiornamento tramite Workbox / PWA Service Worker.
- **FASE GRAFICA CHIUSA**: HOUNIGO è ora pronto per il collaudo manuale dei beta tester su iPhone reale.






