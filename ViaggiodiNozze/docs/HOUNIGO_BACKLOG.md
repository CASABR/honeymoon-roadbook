# HOUNIGO — BACKLOG DI PROGETTO
*Data ultimo aggiornamento: 25 Ottobre 2026*
*Stati ammessi: DA FARE | IN CORSO | IMPLEMENTATO | TESTATO | PUBBLICATO | VERIFICATO SU DISPOSITIVO REALE | BLOCCATO*

---

## ATTIVITÀ APERTE & SPRINT BETA RELEASE CANDIDATE (TARGET: 28 OTTOBRE 2026)

### 1. LIVE Desktop — Risoluzione Certa e Rimozione Fallback Indiscriminato
- **Priorità**: P0 (Critica / Bloccante)
- **Stato**: IMPLEMENTATO
- **Dipendenze**: Nessuna
- **Criteri di Accettazione**:
  - Nessun crash su desktop in Mappa Interattiva e LIVE Tracking GPS. [SUPERATO]
  - Desktop in sola consultazione senza forzare cattura GPS o assumere ruolo guida. [SUPERATO]
  - Gestione robusta dei timestamp Firestore (supporto POJO `{ seconds }`, millisecondi, Date). [SUPERATO]
  - Errori di rete e permessi intercettati e spiegati. [SUPERATO]
  - Rimosso il fallback indiscriminato `activeTripId || '0000'`: in assenza di tripId autenticato o autorizzato, mostrare schermata recuperabile di selezione viaggio senza chiamate a vuoto su Firestore. [SUPERATO]

### 2. Sincronizzazione Galleria LIVE Pubblica su Dispositivi Ospiti
- **Priorità**: P0 / Architetturale
- **Stato**: BLOCCATO
- **Dipendenze**: Decisione e autorizzazione architettura Storage (Firebase Storage / CDN)
- **Criteri di Accettazione**:
  - Gli ospiti remoti indipendenti attualmente non vedono le immagini salvate localmente in `localStorage['hounigo_live_gallery']`.
  - Nessuna introduzione di Base64 su Firestore né permessi pubblici di scrittura senza autorizzazione.
  - Funzionalità dichiarata come non completata nella galleria pubblica per trasparenza, in attesa di configurazione Firebase Storage.

### 3. LIVE Più Compatto su Smartphone
- **Priorità**: P1
- **Stato**: IN CORSO
- **Dipendenze**: LiveEditorialExperience.tsx
- **Criteri di Accettazione**:
  - Sintesi immediata della posizione e ultimo aggiornamento GPS.
  - Altezza mappa ottimizzata per schermi mobile (240px-280px su smartphone).
  - Controlli guida e trasferimento riuniti in pannello/cassetto comprimibile.
  - Anteprima fotografica orizzontale scorrevole mantenuta.
  - Ultima cartolina in evidenza e accesso pulito all'archivio paginato.
  - Nessun overflow o taglio a 393px e 320px CSS.

### 4. Card Trasporti e Card Principali Estremamente Compatte
- **Priorità**: P1
- **Stato**: IN CORSO
- **Dipendenze**: TrasportoCard.tsx
- **Criteri di Accettazione**:
  - Riduzione dell'altezza complessiva della card.
  - Orari e destinazioni in massima evidenza.
  - Avviso check-in sintetizzato in una riga compatta ed elegante.
  - Dettagli secondari e modali operativi facilmente accessibili.
  - Testi chiaramente leggibili anche da utenti non digitalizzati.

### 5. Sezione Altro, Impostazioni e Gestione Viaggio — Riorganizzazione Architettura Informativa
- **Priorità**: P1
- **Stato**: IN CORSO
- **Dipendenze**: AltroView.tsx, SettingsMenu.tsx, DesktopNavigation.tsx
- **Criteri di Accettazione**:
  - Funzioni quotidiane subito raggiungibili (LIVE, Documenti, Spese, Bagagli, Note, Assicurazione, Emergenze, Toolkit).
  - Gestione viaggio in posizione coerente e non duplicata.
  - Impostazioni tecniche e ruolo dispositivo raggruppate e non invasive.
  - Rimozione della Console Amministratore e diagnostiche tecniche dai menu utente standard dei tester.

### 6. Primo Accesso (Onboarding Immediato a 3 Intenzioni)
- **Priorità**: P1
- **Stato**: IN CORSO
- **Dipendenze**: OnboardingView.tsx
- **Criteri di Accettazione**:
  - 3 intenzioni principali visibili al primo sguardo:
    1. Organizza un viaggio (Crea)
    2. Accedi al mio viaggio (Google / Email multi-dispositivo)
    3. Partecipa a un viaggio (Codice o link invito)
  - Eliminazione di gergo tecnico (UID, Firebase, ruoli astratti) dal primo accesso.
  - Progressive disclosure: informazioni richieste solo al momento del bisogno.
  - Ingresso rapido al roadbook senza schermate inutili intermedie.

### 7. Console Admin Globale — Protezione Tester e Procedura Autorizzazione
- **Priorità**: P1
- **Stato**: IMPLEMENTATO
- **Dipendenze**: firestore.rules, AdminDashboardView.tsx
- **Criteri di Accettazione**:
  - Chiarito il motivo del "NON AUTORIZZATO": l'utente è owner del viaggio `0000`, ma non è registrato in `/system_admins/{uid}` in Firestore né possiede il custom claim `admin: true`.
  - Preparata procedura minima server-side per abilitare esclusivamente l'amministratore legittimo.
  - Console nascosta dalla navigazione standard dei tester.
  - Interfaccia semplificata in stato non autorizzato senza stack trace invasivi.

---

## TABELLA DI AVANZAMENTO GLOBALE

| P0-01 | Risoluzione Regressione LIVE Desktop & Rimozione Fallback '0000' | P0 | PUBBLICATO | 25/10/2026 |
| P0-02 | Audit Sincronizzazione Galleria Fotografica Multi-Device | P0 | BLOCCATO | 25/10/2026 |
| P1-01 | Riorganizzazione Compatta LIVE Experience Mobile | P1 | PUBBLICATO | 25/10/2026 |
| P1-02 | Restyling Compatto Card Trasporti (Check-in su riga singola) | P1 | PUBBLICATO | 25/10/2026 |
| P1-03 | Audit Architettura Informativa Sezione Altro & Impostazioni | P1 | PUBBLICATO | 25/10/2026 |
| P1-04 | Semplificazione Onboarding a 3 Intenzioni Dirette | P1 | PUBBLICATO | 25/10/2026 |
| P1-05 | Isolamento Console Admin Globale dal Percorso Tester | P1 | PUBBLICATO | 25/10/2026 |
| MAP-01 | Nuova Card Maps Travel Editorial (Auto & Piedi) | P1 | PUBBLICATO | 25/10/2026 |
| MAP-02 | Gestione Limite Tecnico 10 Tappe Google Maps | P1 | PUBBLICATO | 25/10/2026 |
| MAP-03 | Migrazione Dati Retrocompatibile Link Preesistenti | P1 | PUBBLICATO | 25/10/2026 |
| LIVE-01 | Parsing Sicuro Timestamp Firestore Multi-Formato | P0 | PUBBLICATO | 25/10/2026 |
| LIVE-02 | Desktop Readonly & No Auto-Guide Role Switch | P0 | PUBBLICATO | 25/10/2026 |
| PK2-02 | Cartolina di Viaggio (Paginazione 10 msg, Ordinamento, Delete Sposi) | P1 | PUBBLICATO | 25/10/2026 |
| PK2-03 | GPS Affidabile (4 stati, Timestamp HH:mm — data, Avviso iOS) | P1 | PUBBLICATO | 25/10/2026 |
| PK0-01 | Ownership Permanente Viaggio `0000` (`cqs2OcE7...`) | P0 | IMPLEMENTATO / VERIFICATO | 24/10/2026 |
