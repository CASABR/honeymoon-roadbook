# HOUNIGO — MATRICE DI RILASCIO BETA (BETA RELEASE MATRIX)
*Data target: 28 Ottobre 2026*
*Obiettivo: Prima release stabile fruibile da un gruppo di beta tester esterni (Web/PWA).*

---

## 1. CRITERI DI QUALITÀ PER LA RELEASE CANDIDATE (RC)

| Area | Criterio Minimo Richiesto | Stato Attuale | Note Operative |
| :--- | :--- | :--- | :--- |
| **Accesso & Onboarding** | 3 percorsi chiari: Organizza, Accedi, Partecipa. Nessun gergo tecnico (UID, Firestore). | PUBBLICATO | OnboardingView a 3 intenzioni con rapido accesso Google |
| **LIVE Desktop** | Consultazione mappa e GPS senza assumere il ruolo guida. Gestione sicura timestamp e tripId. | PUBBLICATO | Rimosso fallback '0000', schermo di selezione recuperabile |
| **LIVE Mobile** | Schermata compatta, gerarchia chiara, controlli guida raggruppati, responsive 393/320px. | PUBBLICATO | LiveEditorialExperience con mappa 220-360px e controlli comprimibili |
| **Galleria Foto Multi-Device** | Condivisione pubblica foto organizzatore -> ospiti indipendenti. | BLOCCATO | Locale attivo; disclaimers beta espliciti; storage cloud post-beta |
| **Card Trasporti** | Check-in su riga compatta, orari IATA leggibili, azioni biglietto/PNR chiare. | PUBBLICATO | TrasportoCard con check-in su singola riga orizzontale |
| **Card Google Maps** | Gestione itinerari auto/piedi, limite 10 tappe chiaro, retrocompatibilità link. | PUBBLICATO | DayMapsCard verificata e integrata |
| **Architettura Sezione Altro** | Divisione chiara tra funzioni quotidiane, gestione viaggio e impostazioni tecniche. | PUBBLICATO | AltroView riorganizzata in 3 sezioni editoriali |
| **Console Admin Globale** | Nascosta ai tester. Autorizzazione rigorosa `system_admins`. UI snella se non autorizzato. | PUBBLICATO | Rimosso accesso da menu utenti, isolata con ?admin=1 |
| **Persistenza & Offline** | Nessuna perdita dati, funzionamento offline di base (IndexedDB + LocalStorage). | PUBBLICATO | Verificato con test di persistenza e tombstone |

---

## 2. STATO DELLE FUNZIONALITÀ PER IL 28 OTTOBRE 2026

### Funzionalità ABILITATE per la Beta
1. **Onboarding Semplificato**: Creazione nuovo viaggio, accesso multi-dispositivo Google/Email, inserimento codice invito copilota.
2. **Consultazione Itinerario & Tappe**: Giornate, tappe, attività, note di viaggio.
3. **Card Maps Giornaliera**: Link separati auto/piedi con stima tappe e avviso limite Google Maps.
4. **Logistica Trasporti & Alloggi**: Visualizzazione chiara orari, check-in sintetico, voucher e PNR.
5. **LIVE Experience (Consultazione & Diario)**: Mappa satellitare con posizione reale/prevista, feed messaggi con paginazione a 10 e reazioni.
6. **Gestione Collaborazione**: Invito copilota e assegnazione ruolo dispositivo.

### Funzionalità DISABILITATE o CONTRASSEGNATE COME BETA
1. **Galleria Fotografica Pubblica Multi-Device**: La memorizzazione locale delle foto è attiva sul dispositivo di chi scatta; la sincronizzazione istantanea remota verso gli ospiti è contrassegnata come "In arrivo con Storage Cloud".
2. **Console Amministratore Globale**: Esclusa dalla navigazione utente standard e accessibile unicamente tramite parametro URL riservato (`?admin=1`).

---

## 3. PROTOCOLLO DI COLLAUDO DISPOSITIVI FISICI
- [ ] **Test Telefono A (Organizzatore)**: Accesso account permanente, creazione/apertura viaggio, avvio trasmissione LIVE.
- [ ] **Test Telefono B (Copilota)**: Apertura tramite link invito, ricezione sessione copilota, modifica spesa/nota.
- [ ] **Test Desktop/PC (Viewer)**: Consultazione live feed e mappa interattiva senza GPS locale.
- [ ] **Test Safari iOS**: Blocco schermo e ripresa della sessione LIVE senza eccezioni.
