# LIVE — Matrice di preservazione funzionale

Verifica eseguita sul codice del commit sorgente `8b7c2b7` prima del redesign. La UI finale mantiene una sola sorgente per GPS (`liveGpsService`) e feed (`liveService`).

| Funzione preesistente | Ruoli autorizzati | Azione UI finale | Verifica | Stato |
|---|---|---|---|---|
| Lettura posizione pubblica | Owner, Copilota, Viewer, Ospite | Sezione **Posizione** | Emulator: lettura solo punto attivo e recente | Preservata |
| Avvio GPS | Owner | **Condividi posizione** | Emulator + test UI | Preservata |
| Pausa GPS | Dispositivo guida | **Pausa** | Emulator: lease prima, punto pubblico poi | Preservata |
| Ripresa GPS | Owner | **Riprendi** | Emulator + test UI | Preservata |
| Arresto GPS | Dispositivo guida / Owner | **Ferma condivisione** sempre visibile nello stato attivo | Emulator: il lease nasconde subito il marker | Preservata |
| Singola guida | Owner assegna; Guida pubblica | Pannello **Chi guida** | Emulator rifiuta dispositivi concorrenti | Preservata |
| Trasferimento al Copilota | Owner verso Copilota con device registrato | **Assegna** | Emulator + pulsante disabilitato senza device reale | Preservata |
| Revoca / ripresa guida | Owner | **Prendi guida** / **Riprendi guida** | Emulator | Preservata |
| GPS negato | Owner / Guida | Errore contestuale + **Riprova GPS** | Test UI | Preservata |
| Offline | Tutti | Stato **Offline**, azioni remote disabilitate | Test UI / browser | Preservata |
| Posizione scaduta | Tutti | Stato esplicito; marker pubblico assente | Emulator + test UI | Preservata |
| Posizione reale | Tutti quando pubblica | Marker coral **Dove siamo** | Test UI / browser | Preservata |
| Posizione prevista | Solo membri | Marker navy **Programma** | Test intelligence / browser | Preservata |
| Entrambi i marker | Solo membri | Vista mappa **Insieme** | Test UI / browser | Preservata |
| Attività attuale | Solo membri | Blocco **Adesso** | Test intelligence | Preservata |
| Prossima tappa | Solo membri | Blocco **Prossima tappa** | Test intelligence | Preservata |
| Privacy itinerario | Ospite escluso | Programma e tappe non renderizzati | Test UI + helper guest | Preservata |
| Messaggio organizzatori | Owner / Copilota in scrittura; tutti in lettura | **Modifica** nel Diario | Test UI | Preservata |
| Nuovo aggiornamento | Owner / Copilota autorizzato | **Nuovo ricordo** | Test UI + regole feed | Preservata |
| Eliminazione aggiornamento | Owner / Copilota autorizzato | **Elimina** sulla voce | Test UI + servizio | Preservata |
| Foto manuali | Owner / Copilota autorizzato | **Aggiungi foto** | Test UI | Preservata, locale |
| Foto verticali e lightbox | Tutti | Griglia editoriale + apertura foto | Browser mobile | Preservata |
| Eliminazione foto | Owner / Copilota autorizzato | **Elimina** su foto e lightbox | Test UI | Preservata, locale |
| Foto pre-partenza | Utente modificatore, giorno 1 | Card in Oggi; foto visibile nel Diario | Suite pre-partenza | Preservata |
| Cartolina pre-partenza LIVE | Utente autorizzato | Condivisione esplicita e rimovibile | Suite pre-partenza | Preservata |
| Reazioni | Tutti online | Quattro reazioni sotto ogni ricordo | Emulator regole + test UI | Preservata |
| Link ospiti | Tutti | **Condividi** e **Condividi link ospiti** | Test UI / browser | Preservata |
| Vista esterna | Ospite | Posizione pubblica, Diario, Interazioni | Emulator privacy + browser | Preservata |
| Informativa privacy | Tutti | Pannelli espandibili contestuali | Test UI | Preservata |
| Apertura editoriale LIVE | Tutti | Reveal iniziale breve | Browser 393/320/desktop + reduced motion | Preservata |
| Aggiornamento marker reale | Tutti quando pubblica | Transizione solo per coordinate accurate e spostamenti contenuti | Test statico + browser | Preservata |
| Marker previsto | Solo membri | Marker navy statico | Test statico + browser | Preservata |
| Feedback GPS confermato | Tutti quando pubblica | Impulso singolo sul nuovo timestamp | Test statico + browser | Preservata |
| Reveal foto salvata | Owner / Copilota autorizzato | Reveal dopo `onUploadPhoto` risolto | Test statico | Preservata |

## Limiti dichiarati

- Le fotografie locali non vengono presentate come sincronizzate: senza uno storage immagini autorizzato LIVE pubblica soltanto cartoline testuali.
- Safari/iOS può sospendere il GPS in background; l’interfaccia mostra sempre lo stato e non promette tracking continuo.
- Nessuna Rule, membership, ownership o dato reale è stato modificato.
- Il collaudo Safari/PWA su iPhone fisico e il GPS a due dispositivi restano verifiche hardware separate.
