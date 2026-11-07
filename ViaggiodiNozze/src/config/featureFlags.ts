/**
 * HOUNIGO 1.5.8 — Release Candidate Feature Flags
 * Gestione centralizzata e conservativa per rilascio progressivo:
 * - Funzioni abilitate: non introducono rischi di abuso né dipendenze da server a pagamento.
 * - Funzioni condizionate / disabilitate: protette da feature flag fino all'attivazione
 *   di meccanismi autoritativi server-side (es. rate-limiting, verifica Google Cloud Console).
 */

export const FEATURE_FLAGS = {
  /**
   * Scrittura pubblica anonima di messaggi ospiti nel LIVE (Guestbook).
   * DISABILITATA (false) per evitare abusi, spam o flood del database Firestore
   * sul piano gratuito Firebase Spark in assenza di un endpoint backend con rate-limiting.
   * La lettura del guestbook e la moderazione da parte di Owner/Copilota restano ATTIVE.
   */
  LIVE_GUEST_MESSAGES_PUBLIC_WRITE: false,

  /**
   * Sincronizzazione automatica diretta con Gmail via OAuth.
   * Condizionata al completamento della verifica dell'app e dello scope gmail.readonly
   * da parte di Google Cloud Trust & Safety.
   * Il fallback trasparente (Smart Insert via testo, PDF, screenshot o file .eml) è ATTIVO.
   */
  GMAIL_DIRECT_OAUTH_SYNC: false,

  /**
   * Delega temporanea della trasmissione GPS LIVE al Copilota.
   * ATTIVA (true), protetta da lease crittografico con scadenza e verifica di unicità
   * nelle Security Rules server-side di Firestore.
   */
  LIVE_GPS_COPILOT_DELEGATION: true,

  /**
   * Ricerca Globale su tutte le entità del roadbook con filtraggio dei dati privati
   * e funzionalità Trova/Sostituisci protetta per Owner e Copilota.
   */
  GLOBAL_SEARCH_AND_REPLACE: true,

  /**
   * Card Foto Pre-Partenza (solo Giorno 1, rimozione EXIF, toggle LIVE)
   * e campi Check-in/Check-out indipendenti dal pagamento.
   */
  PRE_DEPARTURE_CARD_AND_CHECKIN: true,

  /**
   * Console Manager con derivazione destinazione e associazione assistita copiloti
   * con protezione assoluta del viaggio master 0000.
   */
  CONSOLE_MANAGER_COPILOT_TOOLS: true
} as const;

