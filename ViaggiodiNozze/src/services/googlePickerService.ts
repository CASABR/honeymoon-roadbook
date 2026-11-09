/**
 * Servizio Google Drive & Google Picker per HOUNIGO.
 * 
 * Gestisce:
 * 1. Validazione e analisi link Google Drive (file, cartelle, docs, fogli).
 * 2. Verifica stato di configurazione Google Picker API e OAuth Client ID.
 * 3. Apertura sicura dei collegamenti Drive in nuova finestra per salvaguardare il ritorno su iPhone.
 * 4. Caricamento dinamico e avvio Google Picker con scope minimo `drive.file` quando configurato.
 */

export interface GoogleDriveParseResult {
  isValid: boolean;
  fileId?: string;
  isFolder: boolean;
  cleanUrl: string;
  error?: string;
}

export interface GooglePickerConfigStatus {
  isConfigured: boolean;
  clientId: string;
  apiKey: string;
  missingConfigs: string[];
}

export interface GooglePickerSelectedItem {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
}

/**
 * Valida un URL di Google Drive ed estrae in modo sicuro l'ID e il tipo di risorsa.
 */
export function parseGoogleDriveUrl(url: string): GoogleDriveParseResult {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return { isValid: false, isFolder: false, cleanUrl: '', error: 'Inserisci un indirizzo Google Drive valido.' };
  }

  // Verifica protocollo sicuro HTTPS
  if (!/^https:\/\//i.test(trimmed)) {
    return { isValid: false, isFolder: false, cleanUrl: '', error: 'Il link deve iniziare con https://' };
  }

  // Verifica dominio Google Drive / Google Docs / Google Drive viewer
  const isGoogleDomain = /^https:\/\/(?:drive|docs|sites)\.google\.com\//i.test(trimmed);
  if (!isGoogleDomain) {
    return {
      isValid: false,
      isFolder: false,
      cleanUrl: trimmed,
      error: 'Il link inserito non appartiene a Google Drive (drive.google.com o docs.google.com).'
    };
  }

  let fileId: string | undefined;
  let isFolder = false;

  // Cartella: /folders/ID
  const folderMatch = /\/folders\/([a-zA-Z0-9_-]+)/.exec(trimmed);
  if (folderMatch) {
    fileId = folderMatch[1];
    isFolder = true;
  } else {
    // File generico / Docs / Sheets / Slides
    const fileMatch = /\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/.exec(trimmed);
    if (fileMatch) {
      fileId = fileMatch[1];
    } else {
      // Formato parametro ?id=ID
      const idParamMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(trimmed);
      if (idParamMatch) {
        fileId = idParamMatch[1];
      }
    }
  }

  return {
    isValid: true,
    fileId,
    isFolder,
    cleanUrl: trimmed
  };
}

/**
 * Verifica se l'ambiente attuale possiede le credenziali per attivare Google Picker.
 */
export function getGooglePickerConfigStatus(): GooglePickerConfigStatus {
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const apiKey = (import.meta.env.VITE_GOOGLE_PICKER_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY || '').trim();

  const missing: string[] = [];
  if (!clientId) {
    missing.push('OAuth 2.0 Web Client ID (VITE_GOOGLE_CLIENT_ID)');
  }
  if (!import.meta.env.VITE_GOOGLE_PICKER_API_KEY && !import.meta.env.VITE_FIREBASE_API_KEY) {
    missing.push('Google Cloud API Key (VITE_GOOGLE_PICKER_API_KEY)');
  }

  return {
    isConfigured: Boolean(clientId && apiKey),
    clientId,
    apiKey,
    missingConfigs: missing
  };
}

/**
 * Apre in modo protetto il link Google Drive in una nuova scheda.
 * Preserva l'integrità della sessione PWA su iPhone e impedisce l'accesso a window.opener.
 */
export function openDriveUrlSafely(url: string): void {
  if (typeof window === 'undefined' || !url) return;
  const target = url.trim();
  if (!/^https:\/\//i.test(target)) return;
  window.open(target, '_blank', 'noopener,noreferrer');
}

// Stato caricamento SDK Google
let isGapiLoaded = false;
let isGsiLoaded = false;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Impossibile caricare lo script Google: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Avvia Google Picker con scope minimale `drive.file` se configurato.
 * Se non configurato o fallito, solleva un errore esplicito consentendo il fallback su inserimento URL.
 */
export async function openGooglePicker(options: {
  onSelect: (item: GooglePickerSelectedItem) => void;
  onError: (error: Error) => void;
  onCancel?: () => void;
}): Promise<void> {
  const status = getGooglePickerConfigStatus();
  if (!status.isConfigured) {
    options.onError(new Error(
      `Google Picker non configurato. Configura ${status.missingConfigs.join(' e ')} nella Google Cloud Console.`
    ));
    return;
  }

  try {
    // 1. Caricamento SDK gapi e Google Identity Services (GSI)
    if (!isGapiLoaded) {
      await loadScript('https://apis.google.com/js/api.js');
      await new Promise<void>((resolve) => {
        (window as any).gapi.load('picker', () => {
          isGapiLoaded = true;
          resolve();
        });
      });
    }

    if (!isGsiLoaded) {
      await loadScript('https://accounts.google.com/gsi/client');
      isGsiLoaded = true;
    }

    const google = (window as any).google;
    if (!google?.picker || !google?.accounts?.oauth2) {
      throw new Error('Librerie Google Picker non pronte nel browser.');
    }

    // 2. Richiesta token OAuth con scope minimale drive.file (zero accesso a file non selezionati)
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: status.clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (tokenResponse: any) => {
        if (tokenResponse?.error) {
          options.onError(new Error(tokenResponse.error_description || tokenResponse.error || 'Autenticazione Google non riuscita.'));
          return;
        }
        const accessToken = tokenResponse?.access_token;
        if (!accessToken) {
          options.onError(new Error('Access token Google non ricevuto.'));
          return;
        }

        // 3. Costruzione e visualizzazione del Picker
        try {
          const view = new google.picker.View(google.picker.ViewId.DOCS);
          view.setMimeTypes('application/pdf,image/png,image/jpeg,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet');

          const picker = new google.picker.PickerBuilder()
            .addView(view)
            .addView(new google.picker.DocsUploadView())
            .setOAuthToken(accessToken)
            .setDeveloperKey(status.apiKey)
            .setCallback((data: any) => {
              if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                const doc = data[google.picker.Response.DOCUMENTS][0];
                const fileId = doc[google.picker.Document.ID];
                const name = doc[google.picker.Document.NAME] || 'Documento Google Drive';
                const url = doc[google.picker.Document.URL] || `https://drive.google.com/file/d/${fileId}/view`;
                const mimeType = doc[google.picker.Document.MIME_TYPE];
                const sizeBytes = doc[google.picker.Document.SIZE_BYTES];

                options.onSelect({ id: fileId, name, url, mimeType, sizeBytes });
              } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
                options.onCancel?.();
              }
            })
            .build();

          picker.setVisible(true);
        } catch (pickerErr: any) {
          options.onError(new Error(pickerErr?.message || 'Errore apertura finestra Google Picker.'));
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: '' });
  } catch (err: any) {
    options.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

