# Cronologia aggiornamenti HOUNIGO

Questo file contiene esclusivamente versioni di cui è verificabile la pubblicazione. Le release preparate ma non ancora pubblicate restano fuori dalla cronologia visibile nell’app.

## 1.6.1 — 2026-11-11

- Copertura Dynamic Island iPhone in PWA/Safari e contrasto barra di stato
- Eliminato ritorno involontario verso l'alto durante scroll e sync cloud

## 1.6.0 — 2026-11-11

- Integrazione Google Picker, data di rilascio locale nella modale info e rifiniture iPhone/Dynamic Island
- Sistema budget interamente in EUR con conversione automatica verificabile e metadati privati protetti
- Separazione dati riservati schema v2, regole Firestore/Storage potenziate e sincronizzazione offline/LIVE sicura

## 1.5.16 — 2026-11-09

- Gestione rate-limit notifiche push con countdown e protezione invii multipli
- Distinzione esplicita invio simulato dry-run rispetto a broadcast reale in Admin

## 1.5.15 — 2026-11-09

- Onboarding con accesso Google in evidenza nella schermata iniziale
- Percorso dedicato per accesso con account e credenziali preesistenti

## 1.5.14 — 2026-11-09

- Correzione overflow orizzontale Documenti su iPhone e layout responsive pulsanti
- Distinzione comandi Google Drive esterno e collegamento protetto documenti con categorie
- Card foto pre-partenza compatta e orario effettivo di pubblicazione nel fuso locale utente

## 1.5.13 — 2026-11-09

- Integrazione collegamenti Google Drive nella cartella Documenti con apertura protetta e selettore categorie

## 1.5.12 — 2026-11-09

- UX LIVE desktop panoramica per ospiti con banner discreto e riordino schermata Altro con accesso rapido Google Drive
- Ricerca rapida con badge sezioni, parita logo chiaro e scuro e safe area migliorata per notch e home indicator iPhone
- Sottocategoria Task per tappe con data orario link e note persistiti offline e sincronizzabili

## 1.5.11 — 2026-11-09

- Invito e adesione Copilota nativa: convalida crittografica token, onboarding e sync automatico in tempo reale.
- Share sheet di sistema con fallback appunti, note copilota con badge visivo e handover guida GPS reattivo.

## 1.5.10 — 2026-11-08

- Condivisione GPS LIVE in tempo reale con delega guida, protezione batteria e rate-limiting 15s.
- Ricezione automatica posizioni su Copilota e protezione privacy su pagina pubblica ospiti.

## 1.5.9 — 2026-11-08

- Sincronizzazione automatica bidirezionale in tempo reale tra Owner e Copilota.
- Scritture atomiche batch per cassaforte e dati pubblici con isolamento safe per documenti non versionati.
