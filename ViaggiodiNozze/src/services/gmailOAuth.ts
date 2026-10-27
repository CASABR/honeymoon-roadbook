export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export const GMAIL_UNAVAILABLE_MESSAGE =
  'Gmail non è autorizzato per questo account. L’accesso Google a Hounigo non include automaticamente la lettura delle email. Puoi continuare subito caricando un PDF o una foto, oppure incollando il testo della conferma.';

export function getFriendlyGmailMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  const message = error instanceof Error ? error.message : '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Autorizzazione Gmail annullata. Puoi usare subito PDF, foto o testo email.';
  }
  if (message.includes('Nessuna email di viaggio')) {
    return 'Non sono state trovate conferme di viaggio leggibili. Prova con un PDF, una foto o incolla il testo dell’email.';
  }
  return GMAIL_UNAVAILABLE_MESSAGE;
}
