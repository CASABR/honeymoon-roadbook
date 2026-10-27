# HOUNIGO — HANDOFF COMPLETAMENTO PRODOTTO & PASSAGGIO BETA
*Data target: 28 Ottobre 2026*
*Branch di riferimento: work/product-completion*

---

## 1. OBIETTIVO E STATO ATTUALE
Il progetto HOUNIGO si trova nella fase conclusiva di consolidamento per la Beta Release Candidate del 28 Ottobre 2026. L'obiettivo primario è fornire una Progressive Web App impeccabile per tester esterni, priva di bug bloccanti (P0), con un'architettura informativa pulita e coerente, e senza ambiguità d'uso.

---

## 2. DECISIONI IMMUTABILI E REGOLE DI STABILITÀ
1. **Ownership e Sicurezza Viaggio 0000**:
   - Owner permanente: `cqs2OcE7WzY7XmiqVoZmM7B6Fpp2` (account Google permanente).
   - Nessuna modifica a ownership, permessi Firestore o Security Rules.
   - Il viaggio reale protetto `0000` non può essere cancellato o corrotto.
2. **Accesso e Autorizzazioni Globali**:
   - Nessun fallback indiscriminato ad hardcoded `0000` in assenza di autenticazione o selezione viaggio.
   - Privilegi amministrativi globali dipendenti rigorosamente da whitelist server-side `/system_admins/{uid}` o custom claim `{ admin: true }`.
   - La Console Amministratore Globale resta esclusa dalla navigazione utente ordinaria e dai percorsi dei beta tester.
3. **Flussi Git e Deploy**:
   - Lavorare unicamente sul branch `work/product-completion`.
   - Nessun commit o push diretto su `main`.
   - Nessun deploy automatico senza preventiva approvazione del report di regressione.

---

## 3. RIEPILOGO STATO COMPONENTI CHIAVE

| Componente | Stato Operativo | Azione Richiesta |
| :--- | :--- | :--- |
| `LiveView.tsx` | Risolto crash desktop, rimosso fallback '0000' | Inserire schermo recuperabile in assenza di tripId |
| `LiveEditorialExperience.tsx` | Funzionante ma troppo lungo su mobile | Compattare mappa, riassunto GPS, cassetti collassabili |
| `TrasportoCard.tsx` | Boarding pass con check-in | Compattare avviso check-in in una singola riga |
| `DayMapsCard.tsx` | Completa (auto e piedi, limite 10 tappe) | Testata e integrata |
| `AltroView.tsx` | Elenco disomogeneo di card | Riorganizzare in: In Evidenza, Strumenti, Gestione, Impostazioni |
| `OnboardingView.tsx` | Procedura con troppi passaggi tecnici | Ridurre a 3 intenzioni dirette (Organizza, Accedi, Partecipa) |
| `AdminDashboardView.tsx` | Query protetta da Firestore Rules | Mantenere fuori dalla navigazione ordinaria e snellire UI |

---

## 4. LIVE FINAL EXPERIENCE — 27 OTTOBRE 2026

- LIVE usa tre aree raggiungibili: **Posizione**, **Diario**, **Interazioni**.
- La mappa distingue il GPS pubblico dal luogo previsto e mostra entrambi solo quando esistono coordinate reali.
- GPS, pausa, ripresa, stop, trasferimento e revoca continuano a usare `liveGpsService`; nessun secondo watcher è stato introdotto.
- L’itinerario previsto resta privato per gli ospiti; documenti, prenotazioni, spese e membership non entrano nel feed pubblico.
- Diario, foto locali, lightbox, cartoline, eliminazione, reazioni e link ospiti restano raggiungibili.
- La foto pre-partenza del commit `8b7c2b7` rimane nel diario locale con cartolina LIVE facoltativa e rimovibile.
- Gmail mantiene `gmail.readonly`; PDF/foto e testo email restano le alternative immediate.
- Matrice e prove puntuali: `docs/LIVE_FEATURE_PRESERVATION.md`.
- Verifica visiva completata con emulazione reale a 393 px e 320 px: stato attivo, GPS assente, dark mode, Diario, Interazioni e card pre-partenza senza overflow o sovrapposizioni.
- Test finali superati: suite LIVE, pre-partenza/Gmail, HouniAI, Firebase Emulator per ruoli/privacy GPS e build PWA con chunk LIVE e jsPDF in precache.
