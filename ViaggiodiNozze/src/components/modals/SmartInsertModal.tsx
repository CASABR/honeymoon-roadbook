import { verifySingleTappa, parseTappaSequence, parseRawMultiLineTappe, parseMixedTappaAndActivity } from '../../services/tappaVerificationService';
import { createPortal } from 'react-dom';
import { useState, useEffect, useRef } from 'react';
import { extractFromText, extractFromAttachment, type ExtractedEntity, type ExtractedTappa } from '../../services/aiExtractor';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { IMAGE_OR_PDF_FILE_ACCEPT, processFileForAttachment, formatFileSize, openAttachmentInNewTab } from '../../utils/fileAttachment';
import type { TransportAttachment } from '../../types';

import { getTripConfig } from '../../utils/tripConfig';
import { auth } from '../../firebase';
import { GoogleAuthProvider } from 'firebase/auth';
import GmailConnectionRow from '../common/GmailConnectionRow';
import { TrailAi } from '../icons/TrailIcons';
import { GMAIL_READONLY_SCOPE, getFriendlyGmailMessage } from '../../services/gmailOAuth';
import {
  EXTERNAL_AI_ENABLED,
  PRIVATE_AI_DISABLED_MESSAGE,
  grantCloudflareAiConsent,
  hasCloudflareAiConsent,
} from '../../config/freeArchitecture';
import TimePickerInput from '../common/TimePickerInput';
import {
  getStoredHouniAiQuota,
  formatQuotaCountdown,
  formatLocalResetTime,
  type HouniAiQuotaState
} from '../../services/houniAiGateway';

interface SmartInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (entityType: 'alloggio' | 'tappa' | 'trasporto') => void;
  mode?: 'gmail' | 'manual';
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  suggestions?: any[];
}

type Step = 'input' | 'extracting' | 'queue' | 'review' | 'saving' | 'done' | 'error' | 'gmailLoading';
type QueueStatus = 'pending' | 'approved' | 'skipped';

interface ImportQueueItem {
  id: string;
  entity: ExtractedEntity;
  status: QueueStatus;
  attachment?: TransportAttachment | null;
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Rende cliccabili gli URL nella risposta del Concierge. */
function renderMessage(message: string) {
  const parts = message.split(/(https?:\/\/[^\s)\]]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#FF9a91] underline underline-offset-2 break-all hover:text-[#ffd2ce]"
      >
        {part.includes('google.com/maps') ? '📍 Apri in Maps' : part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Data predefinita per un suggerimento: oggi se dentro al viaggio, altrimenti il Giorno 1. */
function defaultSuggestionDate(): string {
  const config = getTripConfig();
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (!config?.startDate) return today;
  if (today < config.startDate) return config.startDate;
  if (config.endDate && today > config.endDate) return config.endDate;
  return today;
}

// ─── Modal principale ─────────────────────────────────────────────────────────
export default function SmartInsertModal({ isOpen, onClose, onSaved, mode = 'manual' }: SmartInsertModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [gmailNotice, setGmailNotice] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<'import' | 'chat'>('import');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [existingData, setExistingData] = useState<any>(null);
  const [editData, setEditData] = useState<any>({});
  const [attachedFile, setAttachedFile] = useState<TransportAttachment | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [importQueue, setImportQueue] = useState<ImportQueueItem[]>([]);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const saveInFlightRef = useRef(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<any>(null);
  const [pickerDate, setPickerDate] = useState(defaultSuggestionDate());
  const [pickerTime, setPickerTime] = useState('');
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [showCloudflareConsent, setShowCloudflareConsent] = useState(false);

  const [quotaState, setQuotaState] = useState<HouniAiQuotaState>(() => getStoredHouniAiQuota());
  const [countdownStr, setCountdownStr] = useState<string>(() => formatQuotaCountdown(quotaState.resetAtUtc));
  const [minuteCountdown, setMinuteCountdown] = useState<number>(0);

  useEffect(() => {
    const syncQuota = () => {
      const q = getStoredHouniAiQuota();
      setQuotaState(q);
      setCountdownStr(formatQuotaCountdown(q.resetAtUtc));
      if (q.blockedUntil && q.blockedUntil > Date.now()) {
        setMinuteCountdown(Math.ceil((q.blockedUntil - Date.now()) / 1000));
      } else {
        setMinuteCountdown(0);
      }
    };

    syncQuota();
    const timer = setInterval(syncQuota, 1000);

    const handleUpdated = (e: any) => {
      if (e?.detail) {
        setQuotaState(e.detail);
        setCountdownStr(formatQuotaCountdown(e.detail.resetAtUtc));
      }
    };
    window.addEventListener('houniai_quota_updated' as any, handleUpdated);

    return () => {
      clearInterval(timer);
      window.removeEventListener('houniai_quota_updated' as any, handleUpdated);
    };
  }, []);

  const handleGmailImport = async () => {
    if (!EXTERNAL_AI_ENABLED) {
      setStep('input');
      setGmailNotice(PRIVATE_AI_DISABLED_MESSAGE);
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope(GMAIL_READONLY_SCOPE);
      
      let token: string | undefined;

      // Protezione identità Firebase:
      // Se l'utente è attualmente anonimo (sessione standard del dispositivo),
      // signInWithPopup terminerebbe la sessione anonima e creerebbe un NUOVO UID Google,
      // facendo perdere al dispositivo il ruolo di owner o copilota nel viaggio!
      if (auth.currentUser) {
        const { linkWithPopup, reauthenticateWithPopup } = await import('firebase/auth');
        if (auth.currentUser.isAnonymous) {
          try {
            const linkResult = await linkWithPopup(auth.currentUser, provider);
            const cred = GoogleAuthProvider.credentialFromResult(linkResult);
            token = cred?.accessToken;
          } catch (linkErr: any) {
            if (linkErr?.code === 'auth/credential-already-in-use') {
              throw new Error(
                'Questo account Google è già registrato su un altro profilo. Per proteggere l\'identità del dispositivo corrente ed evitare la perdita dei permessi del viaggio, il collegamento è stato interrotto. Usa l\'inserimento manuale o incolla il testo della conferma.'
              );
            }
            throw linkErr;
          }
        } else {
          try {
            const reauthResult = await reauthenticateWithPopup(auth.currentUser, provider);
            const cred = GoogleAuthProvider.credentialFromResult(reauthResult);
            token = cred?.accessToken;
          } catch (reauthErr: any) {
            // Se l'utente non ha ancora collegato Google al profilo attuale, prova il collegamento senza cambiare UID
            try {
              const linkResult = await linkWithPopup(auth.currentUser, provider);
              const cred = GoogleAuthProvider.credentialFromResult(linkResult);
              token = cred?.accessToken;
            } catch (linkErr: any) {
              if (linkErr?.code === 'auth/credential-already-in-use') {
                throw new Error(
                  'Questo account Google è già registrato su un altro profilo. Per proteggere i permessi del viaggio su questo dispositivo, il collegamento è stato interrotto.'
                );
              }
              throw new Error(
                'Autorizzazione Gmail non riuscita (' + (linkErr?.message || reauthErr?.message || 'errore autorizzazione') + ').'
              );
            }
          }
        }
      } else {
        throw new Error('Nessuna sessione di autenticazione attiva. Ricarica la pagina e riprova.');
      }
      
      if (!token) throw new Error('Token di autorizzazione Google non disponibile.');

      const config = getTripConfig();
      if (!config) throw new Error('Viaggio non configurato.');

      // Le conferme di prenotazione arrivano tipicamente mesi prima della partenza.
      // Non vincolare after:startDate per non escludere tutte le prenotazioni anticipate.
      const end = config.endDate ? config.endDate.replace(/-/g, '/') : '';
      const dateFilter = end ? `before:${end}` : '';
      const query = `${dateFilter} (booking OR reservation OR flight OR hotel OR tour OR ticket OR conferma OR volo OR biglietto OR alloggio OR treno)`.trim();

      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'gmail/not-authorized' : 'gmail/unavailable');
      const data = await res.json();
      if (!data.messages || data.messages.length === 0) {
        throw new Error('Nessuna email di viaggio trovata con le parole chiave di prenotazione.');
      }

      let combinedText = '';
      for (const msg of data.messages) {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
           headers: { Authorization: `Bearer ${token}` }
        });
        if (!msgRes.ok) throw new Error(msgRes.status === 401 || msgRes.status === 403 ? 'gmail/not-authorized' : 'gmail/unavailable');
        const msgData = await msgRes.json();
        let emailText = '';

        const headers = msgData?.payload?.headers || [];
        const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value;
        if (subject) emailText += `[Oggetto]: ${subject}\n`;
        if (msgData.snippet) emailText += `[Anteprima]: ${msgData.snippet}\n`;

        // Tentativo decodifica body testuale
        try {
          let bodyEncoded = msgData?.payload?.body?.data;
          if (!bodyEncoded && Array.isArray(msgData?.payload?.parts)) {
            const textPart = msgData.payload.parts.find((p: any) => p.mimeType === 'text/plain') || msgData.payload.parts[0];
            bodyEncoded = textPart?.body?.data;
          }
          if (bodyEncoded && typeof atob === 'function') {
            const sanitizedB64 = bodyEncoded.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = atob(sanitizedB64);
            if (decoded && decoded.trim()) {
              emailText += `[Dettagli Prenotazione]:\n${decoded.slice(0, 1500)}\n`;
            }
          }
        } catch {}

        if (emailText.trim()) {
          combinedText += `=== EMAIL PRENOTAZIONE ===\n${emailText}\n\n`;
        }
      }

      if (!combinedText.trim()) {
        throw new Error('Nessun testo leggibile estratto dalle email trovate.');
      }

      setText(combinedText);
      setGmailNotice('Email importate. Verifica il testo e avvia l’estrazione AI.');
      setStep('input');
    } catch (err: any) {
      setErrorMsg('');
      setGmailNotice(getFriendlyGmailMessage(err));
      setStep('input');
      setTimeout(() => textAreaRef.current?.focus(), 100);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (mode === 'gmail' && EXTERNAL_AI_ENABLED) {
        setStep('gmailLoading');
        setText('');
        setErrorMsg('');
        setGmailNotice('');
        setEditData({});
        setAttachedFile(null);
        setImportQueue([]);
        setActiveQueueId(null);
        handleGmailImport();
      } else {
        setStep('input');
        setText('');
        setErrorMsg('');
        setGmailNotice(mode === 'gmail' ? PRIVATE_AI_DISABLED_MESSAGE : '');
        setEditData({});
        setAttachedFile(null);
        setImportQueue([]);
        setActiveQueueId(null);
        setTimeout(() => textAreaRef.current?.focus(), 100);
      }
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  // Caricamento allegato utente (PDF o Immagine)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setErrorMsg('');
    try {
      const processed = await processFileForAttachment(file);
      setAttachedFile(processed);
    } catch (err: any) {
      console.error('Errore elaborazione file:', err);
      setErrorMsg(err.message || 'Impossibile elaborare il file selezionato.');
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Prepara la scheda di revisione per una data entità estratta
  const prepareReviewForEntity = async (entity: ExtractedEntity, currentAttachment?: TransportAttachment | null, queueId?: string) => {
    const d: any = entity;
    const cat = entity.type;
    const initial: any = { category: cat };

    let existingItem: any = null;
    if (cat === 'alloggio') {
      initial.title = d.name || '';
      initial.location = d.location || '';
      initial.address = d.address || d.location || '';
      initial.dateStart = d.checkIn || '';
      initial.dateEnd = d.checkOut || '';
      initial.time = d.checkInTime || '';
      initial.cost = d.cost || '';
      initial.bookingCode = d.bookingCode || '';
      initial.notes = d.notes || '';
      const all = await storageService.getAccommodations();
      existingItem = all.find(a => (
        (initial.bookingCode && a.bookingCode && a.bookingCode.trim().toLowerCase() === initial.bookingCode.trim().toLowerCase()) ||
        (a.name.toLowerCase().includes(initial.title.toLowerCase()) && a.checkIn === initial.dateStart)
      ));
    } else if (cat === 'attivita') {
      initial.title = d.title || '';
      initial.location = d.location || '';
      initial.address = d.location || '';
      initial.dateStart = d.date || '';
      initial.time = d.time || '';
      initial.cost = d.cost || '';
      initial.bookingCode = d.bookingCode || '';
      initial.notes = d.notes || '';
      const all = await storageService.getActivities();
      existingItem = all.find(a => (
        (initial.bookingCode && a.qrCode && a.qrCode.trim().toLowerCase() === initial.bookingCode.trim().toLowerCase()) ||
        (a.title.toLowerCase().includes(initial.title.toLowerCase()) && a.date === initial.dateStart)
      ));
    } else if (cat === 'ristorante') {
      initial.title = d.name || '';
      initial.location = d.location || '';
      initial.dateStart = d.date || '';
      initial.time = d.time || '';
      initial.cost = d.cost || '';
      initial.notes = d.notes || '';
      const all = await storageService.getRistoranti();
      existingItem = all.find(a => a.nome.toLowerCase().includes(initial.title.toLowerCase()) && (a.data === initial.dateStart || a.date === initial.dateStart));
    } else if (cat === 'tappa') {
      initial.title = d.titolo || '';
      initial.dateStart = d.data || '';
      initial.time = d.orario || d.time || '';
      initial.location = d.indirizzo || d.mapsUrl || '';
      initial.sottocategoria = d.sottocategoria || 'Tappa';
      initial.notes = d.nota || '';
      const all = await storageService.getTappe();
      existingItem = all.find(a => a.titolo.toLowerCase().includes(initial.title.toLowerCase()) && (a.data === initial.dateStart || a.date === initial.dateStart));
    } else if (cat === 'trasporto') {
      initial.title = `${d.departureLocation || ''} -> ${d.arrivalLocation || ''}`;
      initial.tipoTrasporto = d.tipoTrasporto || 'volo';
      initial.carrier = d.carrier || '';
      initial.dateStart = d.date || '';
      initial.dateEnd = d.arrivalDate || '';
      initial.cost = d.cost || '';
      initial.time = d.departureTime || '';
      initial.arrivalTime = d.arrivalTime || '';
      initial.bookingCode = d.bookingCode || '';
      initial.notes = d.notes || '';
      initial.layover = d.layover || null;
      const all = await storageService.getTransports();
      existingItem = all.find(a => (
        (initial.bookingCode && a.bookingCode && a.bookingCode.trim().toLowerCase() === initial.bookingCode.trim().toLowerCase()) ||
        (a.date === initial.dateStart && a.departureLocation?.toLowerCase() === d.departureLocation?.toLowerCase())
      ));
    } else if (cat === 'shopping') {
      initial.title = d.nome || '';
      initial.location = d.indirizzo || '';
      initial.dateStart = d.data || '';
      initial.time = d.orario || '';
      initial.cost = d.budget || '';
      initial.sottocategoria = d.sottocategoria || 'Altro';
      initial.notes = d.nota || '';
      const all = await storageService.getShopping();
      existingItem = all.find(s => (
        s.nome.toLowerCase().includes(initial.title.toLowerCase()) && (s.data === initial.dateStart || s.date === initial.dateStart)
      ));
    }

    if (currentAttachment) {
      initial.attachmentToSave = currentAttachment;
    }

    setExistingData(existingItem || null);
    setDuplicateConfirmed(false);
    setActiveQueueId(queueId || null);
    if (existingItem) {
      initial.id = existingItem.id;
    }
    setEditData(initial);
    setStep('review');
  };

  const handleExtract = async () => {
    if (!EXTERNAL_AI_ENABLED) {
      setErrorMsg(PRIVATE_AI_DISABLED_MESSAGE);
      setStep('error');
      return;
    }
    if (!hasCloudflareAiConsent()) {
      setShowCloudflareConsent(true);
      return;
    }
    // Verifica se c'è testo oppure un allegato caricato
    if (!text.trim() && !attachedFile) return;

    const currentUserText = text.trim();

    // Riconoscimento intelligente deterministico tappe prima dell'AI (garantisce categoria 'tappa' e non 'attivita')
    if (currentUserText && !attachedFile) {
      // Caso Mix: Tappa + Attività ("Arrivo a Kyoto e visita al tempio Fushimi Inari")
      const mixed = parseMixedTappaAndActivity(currentUserText);
      if (mixed && mixed.tappa && mixed.attivita) {
        const vTappa = await verifySingleTappa(mixed.tappa.titolo, { data: mixed.tappa.data });
        const items: ExtractedEntity[] = [
          {
            ...mixed.tappa,
            titolo: vTappa.titolo,
            indirizzo: vTappa.indirizzo || mixed.tappa.indirizzo,
            mapsUrl: vTappa.mapsUrl
          },
          mixed.attivita
        ];
        setImportQueue(items.map((entity, idx) => ({
          id: `queue_${Date.now()}_${idx}`,
          entity,
          status: 'pending',
          attachment: null,
          verificationStatus: idx === 0 ? vTappa.verificationStatus : 'verified',
          verificationDetails: idx === 0 ? vTappa.verificationDetails : undefined
        })));
        setActiveQueueId(null);
        setStep('queue');
        return;
      }

      // Caso Sequenza tappe con freccia (Tokyo -> Hakone -> Kyoto)
      const seqTappe = parseTappaSequence(currentUserText);
      if (seqTappe && seqTappe.length >= 2) {
        const verifiedItems = await Promise.all(seqTappe.map(async (t) => {
          const v = await verifySingleTappa(t.titolo, { data: t.data, orario: t.orario });
          return {
            entity: {
              ...t,
              titolo: v.titolo,
              indirizzo: v.indirizzo || t.indirizzo,
              mapsUrl: v.mapsUrl
            } as ExtractedEntity,
            verificationStatus: v.verificationStatus,
            verificationDetails: v.verificationDetails
          };
        }));
        setImportQueue(verifiedItems.map((vi, idx) => ({
          id: `queue_${Date.now()}_${idx}`,
          entity: vi.entity,
          status: 'pending',
          attachment: null,
          verificationStatus: vi.verificationStatus,
          verificationDetails: vi.verificationDetails
        })));
        setActiveQueueId(null);
        setStep('queue');
        return;
      }

      // Caso Elenco grezzo multi-riga o numerato
      const rawLines = parseRawMultiLineTappe(currentUserText);
      if (rawLines && rawLines.length >= 2) {
        const verifiedItems = await Promise.all(rawLines.map(async (t) => {
          const v = await verifySingleTappa(t.titolo, { data: t.data, orario: t.orario });
          return {
            entity: {
              ...t,
              titolo: v.titolo,
              indirizzo: v.indirizzo || t.indirizzo,
              mapsUrl: v.mapsUrl
            } as ExtractedEntity,
            verificationStatus: v.verificationStatus,
            verificationDetails: v.verificationDetails
          };
        }));
        setImportQueue(verifiedItems.map((vi, idx) => ({
          id: `queue_${Date.now()}_${idx}`,
          entity: vi.entity,
          status: 'pending',
          attachment: null,
          verificationStatus: vi.verificationStatus,
          verificationDetails: vi.verificationDetails
        })));
        setActiveQueueId(null);
        setStep('queue');
        return;
      }
    }
    if (inputMode === 'chat') {
      setChatMessages(prev => [...prev, { role: 'user', text: currentUserText || `[Allegato inviato: ${attachedFile?.name}]` }]);
      setText('');
    } else {
      setStep('extracting');
    }
    
    setErrorMsg('');

    const config = getTripConfig();
    const today = new Date().toISOString().split('T')[0];
    let contextStr = `Oggi: ${today}. Viaggio: ${config?.title || 'Luna di Miele'} (${config?.startDate || ''} - ${config?.endDate || ''}).`;

    if (inputMode === 'chat' && chatMessages.length > 0) {
      const recentChat = chatMessages.slice(-4).map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.text}`).join(' | ');
      contextStr += ` STORICO CHAT: ${recentChat}`;
    }

    let res: any = null;

    // Se l'utente ha allegato un file, usa l'estrazione visiva/documentale multimodale
    if (attachedFile) {
      res = await extractFromAttachment(attachedFile, contextStr);
    } else {
      res = await extractFromText(currentUserText, contextStr, inputMode);
    }

    if (res.success && (res.data || res.multipleItems?.length)) {
      if (inputMode === 'chat' || res.entityType === 'info') {
        const d: any = res.data;
        setChatMessages(prev => [...prev, { 
          role: 'ai', 
          text: d.message || '', 
          suggestions: d.suggestion ? [d.suggestion] : (d.suggestions || []) 
        }]);
        setStep('input');
        setTimeout(() => {
          const el = document.getElementById('chat-scroll-container');
          if (el) el.scrollTop = el.scrollHeight;
        }, 100);
        return;
      }

      // Se sono state rilevate più prenotazioni distinte (es. Volo andata + ritorno)
      if (res.multipleItems && res.multipleItems.length > 1) {
        setImportQueue(res.multipleItems.map((entity: ExtractedEntity, index: number) => ({
          id: `queue_${Date.now()}_${index}`,
          entity,
          status: 'pending',
          attachment: attachedFile
        })));
        setActiveQueueId(null);
        setStep('queue');
        return;
      }

      // Singola prenotazione estratta
      if (res.data) {
        await prepareReviewForEntity(res.data, attachedFile);
        return;
      }
    }

    setErrorMsg(res?.error || 'Estrazione fallita.');
    if (inputMode === 'chat') {
      setChatMessages(prev => [...prev, { role: 'ai', text: res?.error || 'Errore di comunicazione col Concierge.' }]);
      setStep('input');
    } else {
      setStep('error');
    }
  };

  const handleSave = async () => {
    if (saveInFlightRef.current || (existingData && !duplicateConfirmed)) return;
    saveInFlightRef.current = true;
    setStep('saving');
    try {
      const now = Date.now();
      const cat = editData.category;
      const att = editData.attachmentToSave as TransportAttachment | undefined;
      
      if (existingData) {
        // UPDATE (Unione intelligente con preservazione allegati e campi)
        if (cat === 'alloggio') {
          const existingAtts = existingData.attachments || [];
          const updatedAtts = att ? [...existingAtts.filter((a: any) => a.id !== att.id), att] : existingAtts;
          const updated = {
            ...existingData,
            name: editData.title || existingData.name,
            location: editData.location || existingData.location,
            address: editData.address || editData.location || existingData.address,
            checkIn: editData.dateStart || existingData.checkIn,
            checkOut: editData.dateEnd || existingData.checkOut,
            checkInTime: editData.time || existingData.checkInTime,
            cost: editData.cost || existingData.cost,
            bookingCode: editData.bookingCode || existingData.bookingCode,
            notes: editData.notes || existingData.notes,
            attachments: updatedAtts,
            updatedAt: now
          };
          await storageService.saveAccommodation(updated);
          notifyDataChanged('alloggi', 'save', updated);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'alloggi', data: updated } }));
        } else if (cat === 'tappa') {
          await storageService.updateTappa(existingData.id, {
            titolo: editData.title,
            data: editData.dateStart,
            date: editData.dateStart,
            orario: editData.time || undefined,
            time: editData.time || undefined,
            indirizzo: editData.location || undefined,
            mapsUrl: editData.location || undefined,
            sottocategoria: editData.sottocategoria || existingData.sottocategoria,
            nota: editData.notes
          });
          notifyDataChanged('tappe', 'save', { id: existingData.id, titolo: editData.title });
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'tappe', data: { id: existingData.id } } }));
        } else if (cat === 'trasporto') {
          const parts = editData.title.split('->').map((s: string) => s.trim());
          const existingAtts = existingData.attachments || [];
          const updatedAtts = att ? [...existingAtts.filter((a: any) => a.id !== att.id), att] : existingAtts;
          const updated = {
            ...existingData,
            carrier: editData.carrier || existingData.carrier,
            departureLocation: parts[0] || editData.title,
            arrivalLocation: parts[1] || existingData.arrivalLocation || '',
            date: editData.dateStart || existingData.date,
            arrivalDate: editData.dateEnd || existingData.arrivalDate,
            cost: editData.cost || existingData.cost,
            departureTime: editData.time || existingData.departureTime,
            bookingCode: editData.bookingCode || existingData.bookingCode,
            notes: editData.notes || existingData.notes,
            attachments: updatedAtts,
            updatedAt: now
          };
          await storageService.saveTransport(updated);
          notifyDataChanged('trasporti', 'save', updated);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'trasporti', data: updated } }));
        } else if (cat === 'attivita') {
          const existingAtts = existingData.attachments || [];
          const updatedAtts = att ? [...existingAtts.filter((a: any) => a.id !== att.id), att] : existingAtts;
          const updated = {
            ...existingData,
            title: editData.title || existingData.title,
            location: editData.location || existingData.location,
            date: editData.dateStart || existingData.date,
            time: editData.time || existingData.time,
            cost: editData.cost || existingData.cost,
            qrCode: editData.bookingCode || existingData.qrCode,
            notes: editData.notes || existingData.notes,
            attachments: updatedAtts,
            updatedAt: now
          };
          await storageService.saveActivity(updated);
          notifyDataChanged('attivita', 'save', updated);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'attivita', data: updated } }));
        } else if (cat === 'ristorante') {
          const existingAtts = existingData.attachments || [];
          const updatedAtts = att ? [...existingAtts.filter((a: any) => a.id !== att.id), att] : existingAtts;
          const updated = {
            ...existingData,
            nome: editData.title || existingData.nome,
            indirizzo: editData.location || existingData.indirizzo,
            data: editData.dateStart || existingData.data,
            date: editData.dateStart || existingData.date,
            budget: editData.cost || existingData.budget,
            nota: editData.notes || existingData.nota,
            attachments: updatedAtts,
            updatedAt: now
          };
          await storageService.updateRistorante(existingData.id, updated);
          notifyDataChanged('ristoranti', 'save', updated);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'ristoranti', data: updated } }));
        } else if (cat === 'shopping') {
          const existingAtts = existingData.attachments || [];
          const updatedAtts = att ? [...existingAtts.filter((a: any) => a.id !== att.id), att] : existingAtts;
          const updated = {
            ...existingData,
            nome: editData.title || existingData.nome,
            indirizzo: editData.location || existingData.indirizzo,
            data: editData.dateStart || existingData.data,
            date: editData.dateStart || existingData.date,
            dayId: editData.dateStart ? `day_${editData.dateStart}` : existingData.dayId,
            orario: editData.time || existingData.orario,
            budget: editData.cost || existingData.budget,
            cost: editData.cost || existingData.cost,
            sottocategoria: editData.sottocategoria || existingData.sottocategoria || 'Altro',
            nota: editData.notes || existingData.nota,
            attachments: updatedAtts,
            updatedAt: now
          };
          await storageService.saveShopping(updated);
          notifyDataChanged('shopping', 'save', updated);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'shopping', data: updated } }));
        } else {
          throw new Error(`Tipologia '${cat}' non supportata per l'aggiornamento.`);
        }
      } else {
        // CREATE (Nuovo inserimento con persistenza e sincronizzazione)
        if (cat === 'alloggio') {
          const newAlloggio = {
            id: generateId('alloggio'),
            name: editData.title,
            location: editData.location || '',
            checkIn: editData.dateStart || '',
            checkOut: editData.dateEnd || editData.dateStart || '',
            checkInTime: editData.time || '',
            address: editData.address || editData.location || '',
            cost: editData.cost || '',
            bookingCode: editData.bookingCode || '',
            notes: editData.notes || '',
            status: 'prenotato',
            attachments: att ? [att] : [],
            createdAt: now,
            updatedAt: now
          };
          await storageService.saveAccommodation(newAlloggio as any);
          notifyDataChanged('alloggi', 'save', newAlloggio);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'alloggi', data: newAlloggio } }));
        } else if (cat === 'tappa') {
          const newTappa = {
            titolo: editData.title,
            data: editData.dateStart,
            date: editData.dateStart,
            dayId: editData.dateStart ? `day_${editData.dateStart}` : undefined,
            orario: editData.time || undefined,
            time: editData.time || undefined,
            indirizzo: editData.location || undefined,
            mapsUrl: editData.location || undefined,
            sottocategoria: editData.sottocategoria || 'Tappa',
            nota: editData.notes
          };
          await storageService.addTappa(newTappa);
          notifyDataChanged('tappe', 'save', newTappa);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'tappe', data: newTappa } }));
        } else if (cat === 'trasporto') {
          const parts = editData.title.split('->').map((s: string) => s.trim());
          const newTr = {
            id: generateId('trasporto'),
            type: (editData.tipoTrasporto || 'volo') as any,
            carrier: editData.carrier || '',
            date: editData.dateStart || '',
            arrivalDate: editData.dateEnd || editData.dateStart || '',
            departureLocation: parts[0] || editData.title,
            arrivalLocation: parts[1] || '',
            cost: editData.cost || '',
            departureTime: editData.time || '',
            arrivalTime: editData.arrivalTime || '',
            bookingCode: editData.bookingCode || '',
            notes: editData.notes || '',
            status: 'prenotato',
            attachments: att ? [att] : [],
            createdAt: now,
            updatedAt: now
          };
          await storageService.saveTransport(newTr as any);
          notifyDataChanged('trasporti', 'save', newTr);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'trasporti', data: newTr } }));
        } else if (cat === 'attivita') {
          const newAct = {
            id: generateId('attivita'),
            dayId: editData.dateStart ? `day_${editData.dateStart}` : 'day_1',
            date: editData.dateStart || '',
            title: editData.title,
            location: editData.location || '',
            cost: editData.cost || '',
            time: editData.time || '',
            qrCode: editData.bookingCode || '',
            category: 'visita',
            status: 'prenotato',
            notes: editData.notes || '',
            attachments: att ? [att] : [],
            createdAt: now,
            updatedAt: now
          };
          await storageService.saveActivity(newAct as any);
          notifyDataChanged('attivita', 'save', newAct);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'attivita', data: newAct } }));
        } else if (cat === 'ristorante') {
          const newRist = {
            id: generateId('rist'),
            nome: editData.title,
            data: editData.dateStart || '',
            date: editData.dateStart || '',
            dayId: editData.dateStart ? `day_${editData.dateStart}` : 'day_1',
            indirizzo: editData.location || '',
            budget: editData.cost || '',
            orario: editData.time || '',
            nota: editData.notes || '',
            attachments: att ? [att] : [],
            createdAt: now,
            updatedAt: now
          };
          await storageService.saveRistorante(newRist as any);
          notifyDataChanged('ristoranti', 'save', newRist);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'ristoranti', data: newRist } }));
        } else if (cat === 'shopping') {
          const newShop = {
            id: generateId('shop'),
            nome: editData.title,
            data: editData.dateStart || '',
            date: editData.dateStart || '',
            dayId: editData.dateStart ? `day_${editData.dateStart}` : 'day_1',
            indirizzo: editData.location || '',
            budget: editData.cost || '',
            cost: editData.cost || '',
            orario: editData.time || '',
            sottocategoria: editData.sottocategoria || 'Altro',
            nota: editData.notes || '',
            attachments: att ? [att] : [],
            createdAt: now,
            updatedAt: now
          };
          await storageService.saveShopping(newShop as any);
          notifyDataChanged('shopping', 'save', newShop);
          window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'shopping', data: newShop } }));
        } else {
          throw new Error(`Tipologia '${cat}' non supportata per la creazione.`);
        }
      }
      
      onSaved?.(cat as any);
      if (activeQueueId) {
        setImportQueue(queue => queue.map(item => item.id === activeQueueId ? { ...item, status: 'approved' } : item));
        setActiveQueueId(null);
        setExistingData(null);
        setEditData({});
        setStep('queue');
      } else {
        setStep('done');
        setTimeout(() => onClose(), 1800);
      }
    } catch (err) {
      console.error('Errore salvataggio:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Errore salvataggio.');
      setStep('error');
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const saveEntityDirectly = async (entity: ExtractedEntity, att?: TransportAttachment | null) => {
    const cat = entity.type;
    const now = Date.now();

    if (cat === 'tappa') {
      const t = entity as ExtractedTappa;
      const dateStart = t.data;
      const orario = t.orario || t.time;
      const newTappa = {
        titolo: t.titolo || 'Tappa',
        data: dateStart,
        date: dateStart,
        dayId: dateStart ? `day_${dateStart}` : undefined,
        orario: orario || undefined,
        time: orario || undefined,
        timeStatus: orario ? 'confermato' : 'non_specificato',
        indirizzo: t.indirizzo || undefined,
        mapsUrl: t.mapsUrl || (t.indirizzo?.startsWith('http') ? t.indirizzo : undefined),
        sottocategoria: t.sottocategoria || 'Tappa',
        nota: t.nota
      };
      await storageService.addTappa(newTappa as any);
      notifyDataChanged('tappe', 'save', newTappa);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'tappe', data: newTappa } }));
    } else if (cat === 'attivita') {
      const act = entity as any;
      const newAct = {
        id: generateId('attivita'),
        dayId: act.date ? `day_${act.date}` : 'day_1',
        date: act.date || '',
        title: act.title,
        location: act.location || '',
        cost: act.cost || '',
        time: act.time || '',
        timeStatus: act.time ? 'confermato' : 'non_specificato',
        qrCode: act.bookingCode || '',
        category: 'visita',
        status: 'prenotato',
        notes: act.notes || '',
        attachments: att ? [att] : [],
        createdAt: now,
        updatedAt: now
      };
      await storageService.saveActivity(newAct as any);
      notifyDataChanged('attivita', 'save', newAct);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'attivita', data: newAct } }));
    } else if (cat === 'alloggio') {
      const a = entity as any;
      const newAlloggio = {
        id: generateId('alloggio'),
        name: a.name,
        location: a.location || '',
        checkIn: a.checkIn || '',
        checkOut: a.checkOut || a.checkIn || '',
        checkInTime: a.checkInTime || '',
        address: a.address || a.location || '',
        cost: a.cost || '',
        bookingCode: a.bookingCode || '',
        notes: a.notes || '',
        status: 'prenotato',
        attachments: att ? [att] : [],
        createdAt: now,
        updatedAt: now
      };
      await storageService.saveAccommodation(newAlloggio as any);
      notifyDataChanged('alloggi', 'save', newAlloggio);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'alloggi', data: newAlloggio } }));
    } else if (cat === 'ristorante') {
      const r = entity as any;
      const newRist = {
        id: generateId('rist'),
        nome: r.name,
        data: r.date || '',
        date: r.date || '',
        dayId: r.date ? `day_${r.date}` : 'day_1',
        indirizzo: r.location || '',
        budget: r.cost || '',
        orario: r.time || '',
        timeStatus: r.time ? 'confermato' : 'non_specificato',
        nota: r.notes || '',
        attachments: att ? [att] : [],
        createdAt: now,
        updatedAt: now
      };
      await storageService.saveRistorante(newRist as any);
      notifyDataChanged('ristoranti', 'save', newRist);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'ristoranti', data: newRist } }));
    } else if (cat === 'trasporto') {
      const tr = entity as any;
      const newTr = {
        id: generateId('trasporto'),
        type: (tr.tipoTrasporto || 'volo') as any,
        carrier: tr.carrier || '',
        date: tr.date || '',
        arrivalDate: tr.arrivalDate || tr.date || '',
        departureLocation: tr.departureLocation || '',
        arrivalLocation: tr.arrivalLocation || '',
        cost: tr.cost || '',
        departureTime: tr.departureTime || '',
        arrivalTime: tr.arrivalTime || '',
        bookingCode: tr.bookingCode || '',
        notes: tr.notes || '',
        status: 'prenotato',
        attachments: att ? [att] : [],
        createdAt: now,
        updatedAt: now
      };
      await storageService.saveTransport(newTr as any);
      notifyDataChanged('trasporti', 'save', newTr);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'create', entityType: 'trasporti', data: newTr } }));
    }
  };

  const handleApproveSingle = async (queueItem: ImportQueueItem) => {
    try {
      await saveEntityDirectly(queueItem.entity, queueItem.attachment);
      setImportQueue(queue => queue.map(i => i.id === queueItem.id ? { ...i, status: 'approved' } : i));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Errore durante il salvataggio.');
    }
  };

  const handleApproveAllPending = async () => {
    setIsBulkSaving(true);
    setErrorMsg('');
    try {
      const pending = importQueue.filter(i => i.status === 'pending');
      for (const item of pending) {
        await saveEntityDirectly(item.entity, item.attachment);
      }
      setImportQueue(queue => queue.map(i => ({ ...i, status: 'approved' })));
      setSuccessMsg(`Tutte le ${pending.length} voci sono state salvate con successo nell'itinerario!`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Errore durante il salvataggio multiplo.');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const entityLabel: Record<string, string> = {
    alloggio: '🏨 Alloggio',
    tappa: '📍 Tappa',
    trasporto: '🚆/✈️ Trasporto',
    attivita: '🎫 Attività',
    ristorante: '🍝 Ristorante',
    shopping: '🛍️ Shopping / Spesa',
    sconosciuto: '❓ Sconosciuto',
  };

  const modalContent = (
    <>
      {/* Hidden file input per 'Allega prenotazione' */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept={IMAGE_OR_PDF_FILE_ACCEPT}
        className="hidden"
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-xs"
        onClick={step === 'extracting' || step === 'saving' ? undefined : onClose}
      />

      {/* Sheet Light */}
      <div className="fixed bottom-0 sm:inset-0 sm:items-center sm:justify-center left-0 right-0 z-[90] flex justify-center">
        <div className="w-full max-w-lg mx-auto bg-white border border-slate-200/90 sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-y-auto max-h-[88dvh] p-4 sm:p-6 animate-slide-up text-slate-800">

          {/* ─── Header HouniAI Light ─── */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-2xl bg-[#FF6B5F] text-white flex items-center justify-center shadow-md shadow-[#FF6B5F]/20">
                <TrailAi size={22} active />
              </div>
              <div className="min-w-0">
                <h2 className="text-[#172033] font-extrabold text-lg leading-tight truncate break-words font-brand-title">HouniAI</h2>
                <p className="text-slate-500 text-xs mt-0.5 truncate break-words font-brand-body">L'assistente di viaggio per il tuo itinerario</p>
              </div>
            </div>
            {step !== 'extracting' && step !== 'saving' && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-[#172033] transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* ─── Indicatore Quote HouniAI con Countdown ─── */}
          {(() => {
            let quotaStatusText = '';
            let dotColor = 'bg-emerald-500';

            if (minuteCountdown > 0) {
              quotaStatusText = `Troppe richieste · Riprova tra ${minuteCountdown}s`;
              dotColor = 'bg-amber-500 animate-pulse';
            } else if (quotaState.isSharedLimitReached) {
              quotaStatusText = `Disponibilità globale condivisa esaurita · Reset tra ${countdownStr}`;
              dotColor = 'bg-amber-500';
            } else if (quotaState.remainingToday === 0) {
              quotaStatusText = `Quota personale esaurita (0/${quotaState.maxDaily}) · Ripristino tra ${countdownStr}`;
              dotColor = 'bg-amber-500';
            } else {
              quotaStatusText = `${quotaState.remainingToday} richieste disponibili · Ripristino tra ${countdownStr}`;
              dotColor = 'bg-emerald-500';
            }

            return (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs mb-3 shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                  <span className="font-semibold text-slate-700 truncate">
                    {quotaStatusText}
                  </span>
                </div>
                <span
                  className="text-[10px] text-slate-400 font-medium shrink-0 ml-2 cursor-help"
                  title={`Reset a mezzanotte UTC (ore ${formatLocalResetTime(quotaState.resetAtUtc)} locali). Limite personale: ${quotaState.maxDaily}/giorno.`}
                >
                  Reset ore {formatLocalResetTime(quotaState.resetAtUtc)}
                </span>
              </div>
            );
          })()}

          {/* ─── Step: GMAIL LOADING ─── */}
          {step === 'gmailLoading' && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 border-4 border-slate-200 border-t-[#FF6B5F] rounded-full animate-spin mb-4" />
              <h3 className="text-[#172033] font-bold mb-2">Ricerca in Gmail...</h3>
              <p className="text-slate-500 text-sm">Cerco email di viaggio tra le date selezionate.</p>
            </div>
          )}

          {/* ─── Step: INPUT ─── */}
          {(step === 'input' || (step === 'extracting' && inputMode === 'chat')) && (
            <div className="space-y-3 flex flex-col h-[70vh] max-h-[620px]">
              <div className="flex gap-2 p-1 bg-[#F8F7F3] rounded-xl shrink-0 border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setInputMode('import')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${inputMode === 'import' ? 'bg-[#172033] text-white shadow-xs' : 'text-slate-600 hover:text-[#172033]'}`}
                >
                  Importa Prenotazioni
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('chat')}
                  disabled={!EXTERNAL_AI_ENABLED}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${EXTERNAL_AI_ENABLED ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'} ${inputMode === 'chat' ? 'bg-[#172033] text-white shadow-xs' : 'text-slate-600 hover:text-[#172033]'}`}
                >
                  {EXTERNAL_AI_ENABLED ? 'Chiedi al Concierge' : 'Concierge non attivo'}
                </button>
              </div>

              {inputMode === 'chat' && (
                <div id="chat-scroll-container" className="flex-1 overflow-y-auto mb-2 space-y-4 pr-1 custom-scrollbar min-h-[200px] max-h-[380px]">
                  {chatMessages.length === 0 && (
                     <div className="text-center text-slate-500 text-sm py-10">
                       Chiedi consigli al tuo Concierge di viaggio...
                     </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'ai' && (
                        <div className="w-8 h-8 shrink-0 rounded-full bg-[#FF6B5F] text-white flex items-center justify-center text-sm mr-2 mt-1 shadow-xs">
                          <TrailAi size={16} active />
                        </div>
                      )}
                      <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl whitespace-pre-wrap break-words text-sm ${
                        msg.role === 'user' 
                          ? 'bg-[#FF6B5F] text-white rounded-br-sm shadow-xs' 
                          : 'bg-[#F8F7F3] text-slate-800 rounded-tl-sm border border-slate-200/90 shadow-2xs'
                      }`}>
                        {msg.role === 'ai' ? renderMessage(msg.text) : msg.text}
                        
                        {msg.suggestions && msg.suggestions.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {msg.suggestions.map((s: any, idx: number) => (
                              <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-200">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold text-[#172033]">{s.title || s.name || s.nome}</span>
                                </div>
                                {(s.location || s.indirizzo) && <div className="text-xs text-slate-500 mb-2">📍 {s.location || s.indirizzo}</div>}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPickerDate(s.date || s.checkIn || defaultSuggestionDate());
                                    setPickerTime(s.time || s.departureTime || '');
                                    setPendingSuggestion(s);
                                  }}
                                  className="w-full py-1.5 rounded-lg bg-[#FF6B5F]/10 text-[#FF6B5F] text-xs font-bold hover:bg-[#FF6B5F]/20 transition cursor-pointer"
                                >
                                  + Aggiungi all'itinerario
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {step === 'extracting' && inputMode === 'chat' && (
                    <div className="flex justify-start">
                       <div className="w-8 h-8 shrink-0 rounded-full bg-[#FF6B5F]/20 border border-[#FF6B5F]/30 flex items-center justify-center text-sm mr-2 animate-pulse text-[#FF6B5F]">✨</div>
                       <div className="bg-[#F8F7F3] px-4 py-2.5 rounded-2xl rounded-tl-sm text-slate-600 text-sm italic border border-slate-200">Sto analizzando...</div>
                    </div>
                  )}
                </div>
              )}

              {/* Box Allegato Caricato (se presente) */}
              {attachedFile && (
                <div className="p-3 bg-[#F8F7F3] border border-slate-200 rounded-2xl flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#FF6B5F]/15 text-[#FF6B5F] flex items-center justify-center text-lg shrink-0">
                      {attachedFile.type === 'pdf' ? '📄' : '🖼️'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#172033] text-xs font-bold truncate">{attachedFile.name}</p>
                      <p className="text-slate-500 text-[10px]">{formatFileSize(attachedFile.size)} • Pronto per analisi</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {attachedFile.type === 'pdf' && (
                      <button
                        type="button"
                        onClick={() => openAttachmentInNewTab(attachedFile.dataUrl, attachedFile.name)}
                        className="px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 rounded-lg transition"
                        title="Anteprima PDF"
                      >
                        Apri ↗
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachedFile(null)}
                      className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center text-xs font-bold transition cursor-pointer"
                      title="Rimuovi allegato"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Avviso Privacy AI Compatto ed Espandibile */}
              <div className="rounded-xl border border-slate-200/80 bg-[#F8F7F3] p-2.5 text-[11px] text-slate-600 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-slate-500 text-xs shrink-0">🔒</span>
                    <span className="font-semibold text-[#172033] truncate">Privacy AI: invio solo dopo conferma</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
                    className="text-[10px] font-bold text-[#FF6B5F] hover:underline shrink-0 cursor-pointer flex items-center gap-0.5"
                    aria-expanded={showPrivacyDetails}
                  >
                    <span>{showPrivacyDetails ? 'Meno info' : 'Come sono protetti i dati?'}</span>
                    <span className={`text-[9px] transition-transform ${showPrivacyDetails ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                </div>
                {showPrivacyDetails && (
                  <p className="mt-2 pt-2 border-t border-slate-200 text-[10px] leading-relaxed text-slate-500 animate-fade-in">
                    HouniAI usa modelli ospitati direttamente da Cloudflare. Cloudflare dichiara zero conservazione per l’inferenza standard e nessun uso dei contenuti per addestrare modelli. Nessun file viene inviato automaticamente; puoi sempre continuare manualmente.
                  </p>
                )}
              </div>

              {inputMode === 'import' && gmailNotice && (
                <div className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                  <p className="text-[11px] leading-relaxed">{gmailNotice}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="min-h-9 rounded-xl bg-white px-3 text-[11px] font-bold text-[#172033] border border-amber-200 shadow-2xs">📎 Carica PDF/foto</button>
                    <button type="button" onClick={() => textAreaRef.current?.focus()} className="min-h-9 rounded-xl bg-white px-3 text-[11px] font-bold text-[#172033] border border-amber-200 shadow-2xs">Incolla testo email</button>
                  </div>
                </div>
              )}

              {/* Collegamento Gmail Compatto (1 riga) */}
              {inputMode === 'import' && EXTERNAL_AI_ENABLED && (
                <GmailConnectionRow
                  compactDark={false}
                  onSearchEmails={handleGmailImport}
                  className="shrink-0"
                />
              )}

              {/* Area Input Testo */}
              <div className="shrink-0 relative">
                <textarea
                  ref={textAreaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && inputMode === 'chat') {
                      e.preventDefault();
                      handleExtract();
                    }
                  }}
                  placeholder={
                    inputMode === 'import'
                      ? attachedFile 
                        ? "File disponibile solo sul dispositivo. Consulta i dati e inseriscili nelle schede manuali."
                        : "Puoi consultare qui testo, PDF o immagini senza inviarli a servizi AI esterni."
                      : "Scrivi un messaggio o chiedi un consiglio al Concierge..."
                  }
                  className={`w-full p-4 bg-[#F8F7F3] border border-slate-200 text-[#172033] text-sm resize-none focus:outline-none focus:border-[#FF6B5F] focus:ring-1 focus:ring-[#FF6B5F]/30 placeholder:text-slate-400 ${inputMode === 'chat' ? 'h-20 rounded-2xl pr-14' : 'h-32 rounded-2xl leading-relaxed'}`}
                />
                {inputMode === 'chat' && (
                  <button
                    onClick={handleExtract}
                    disabled={!EXTERNAL_AI_ENABLED || (!text.trim() && !attachedFile)}
                    className="absolute right-3 top-3 bottom-3 w-10 h-10 rounded-xl bg-[#FF6B5F] text-white flex items-center justify-center hover:bg-[#e85c50] disabled:opacity-50 transition cursor-pointer shadow-md"
                    title="Invia messaggio"
                  >
                    <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                  </button>
                )}
              </div>

              {/* Pulsanti Azione (Allega prenotazione sempre in evidenza + Estrai) */}
              <div className="flex flex-wrap sm:flex-nowrap gap-2 shrink-0 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingFile}
                  className="flex-1 sm:flex-none px-4 py-3 rounded-xl font-bold bg-[#F8F7F3] hover:bg-slate-100 border border-slate-200 text-[#172033] text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer shadow-2xs hover:border-slate-300"
                  title="Carica documento PDF, biglietto o screenshot di prenotazione"
                >
                  <svg className="w-4 h-4 text-[#FF6B5F] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="truncate">{attachedFile ? 'Sostituisci File' : '📎 Allega prenotazione'}</span>
                </button>

                {inputMode === 'import' && (
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={!EXTERNAL_AI_ENABLED || (!text.trim() && !attachedFile)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold bg-[#FF6B5F] text-white shadow-md shadow-rose-500/20 hover:bg-[#e85c50] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>{EXTERNAL_AI_ENABLED ? 'Estrai Dati con AI' : 'AI non disponibile'}</span>
                  </button>
                )}
                {!EXTERNAL_AI_ENABLED && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    Inserisci manualmente
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── Step: EXTRACTING ─── */}
          {step === 'extracting' && inputMode === 'import' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-slate-200 border-t-[#FF6B5F] animate-spin" />
                <div className="absolute inset-3 rounded-full bg-slate-100 flex items-center justify-center text-xl text-[#FF6B5F]">✨</div>
              </div>
              <div className="text-center">
                <p className="font-bold text-[#172033] text-sm">L'AI sta analizzando la prenotazione...</p>
                <p className="text-xs text-slate-500 mt-1">
                  {attachedFile ? `Lettura del file "${attachedFile.name}"` : 'Strutturazione campi in corso'}
                </p>
              </div>
            </div>
          )}

          {/* ─── Step: QUEUE (revisione individuale o multipla con approvazione verificata) ─── */}
          {step === 'queue' && importQueue.length > 0 && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                      Trovate {importQueue.length} voci distinte
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Puoi approvare ciascuna voce singolarmente, modificarla o approvarle tutte con un solo tocco.
                    </p>
                  </div>
                  {importQueue.some(i => i.status === 'pending') && (
                    <button
                      type="button"
                      disabled={isBulkSaving}
                      onClick={handleApproveAllPending}
                      className="px-3 py-1.5 rounded-lg bg-[#FF6B5F] hover:bg-[#e85c50] text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      {isBulkSaving ? 'Salvataggio...' : `✓ Approva tutte (${importQueue.filter(i => i.status === 'pending').length})`}
                    </button>
                  )}
                </div>
              </div>

              {successMsg && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-200">
                  {successMsg}
                </div>
              )}

              <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                {importQueue.map((queueItem) => {
                  const booking: any = queueItem.entity;
                  const statusLabel = queueItem.status === 'approved' ? 'Salvata' : queueItem.status === 'skipped' ? 'Saltata' : 'Da verificare';
                  const orarioDisplay = booking.orario || booking.time || booking.departureTime || booking.checkInTime;

                  return (
                  <div key={queueItem.id} className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition flex items-center justify-between gap-3 shadow-2xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
                          {booking.type}
                        </span>
                        {orarioDisplay && (
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 text-[#FF6B5F] border border-rose-200/60 dark:border-rose-900/40">
                            ⏰ {orarioDisplay}
                          </span>
                        )}
                        <h4 className="text-sm font-bold text-[#172033] dark:text-white truncate">
                          {booking.name || booking.title || booking.titolo || `${booking.departureLocation} -> ${booking.arrivalLocation}`}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                        {booking.date || booking.checkIn || booking.data || 'Data da verificare'}
                        {booking.indirizzo ? ` · ${booking.indirizzo}` : ''}
                        {' · '}
                        <span className={queueItem.status === 'approved' ? 'text-emerald-600 font-bold' : queueItem.status === 'skipped' ? 'text-slate-400' : 'text-amber-600 font-semibold'}>
                          {statusLabel}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5 items-center">
                      {queueItem.status !== 'approved' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApproveSingle(queueItem)}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-[11px] font-bold text-white transition cursor-pointer"
                            title="Approva e salva questa voce"
                          >
                            ✓ Approva
                          </button>
                          <button
                            type="button"
                            onClick={() => prepareReviewForEntity(queueItem.entity, queueItem.attachment, queueItem.id)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-2 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                          >
                            Modifica
                          </button>
                          <button
                            type="button"
                            onClick={() => setImportQueue(queue => queue.map(item => item.id === queueItem.id ? { ...item, status: item.status === 'skipped' ? 'pending' : 'skipped' } : item))}
                            className="rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-600"
                          >
                            {queueItem.status === 'skipped' ? 'Ripristina' : 'Salta'}
                          </button>
                        </>
                      )}
                      {queueItem.status === 'approved' && (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                          ✓ Salvata
                        </span>
                      )}
                    </div>
                  </div>
                );})}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setStep('input'); setSuccessMsg(''); }}
                  className="py-2 px-3 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  ← Torna al testo
                </button>
                {importQueue.every(i => i.status === 'approved') && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-2 px-4 rounded-xl text-xs font-bold bg-[#172033] dark:bg-white dark:text-[#172033] text-white transition cursor-pointer"
                  >
                    Fatto, chiudi ➔
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── Step: REVIEW (Scheda di riepilogo modificabile) ─── */}
          {step === 'review' && editData && editData.category !== 'info' && (
            <div className="space-y-4">
              {existingData ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-2">
                   <div className="flex items-start gap-2 text-amber-800">
                     <span className="text-lg">⚠️</span>
                     <div>
                       <p className="font-bold text-sm">Prenotazione già presente!</p>
                       <p className="text-xs mt-0.5 text-amber-700">
                         Trovato "{existingData.title || existingData.nome || existingData.name || existingData.titolo}" in questa data / codice. Puoi integrare i dati mancanti e allegare il documento senza duplicare.
                       </p>
                       <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs font-semibold text-amber-900">
                         <input
                           type="checkbox"
                           checked={duplicateConfirmed}
                           onChange={(event) => setDuplicateConfirmed(event.target.checked)}
                           className="mt-0.5"
                         />
                         <span>Confermo di aggiornare questo record esistente invece di crearne uno nuovo.</span>
                       </label>
                     </div>
                   </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-2">
                   <div className="flex items-center gap-2 text-emerald-800">
                     <span className="text-lg">✨</span>
                     <p className="font-bold text-sm">Dati estratti con successo</p>
                   </div>
                   <p className="text-xs text-slate-600 mt-1">Verifica e completa i campi prima di salvare nel tuo itinerario.</p>
                </div>
              )}

              {/* Box allegato associato alla prenotazione */}
              {editData.attachmentToSave && (
                <div className="p-2.5 bg-[#F8F7F3] border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span>📎</span>
                    <span className="text-[#172033] font-medium truncate">{editData.attachmentToSave.name}</span>
                    <span className="text-slate-500">({formatFileSize(editData.attachmentToSave.size)})</span>
                  </div>
                  {editData.attachmentToSave.type === 'pdf' && (
                    <button
                      type="button"
                      onClick={() => openAttachmentInNewTab(editData.attachmentToSave.dataUrl, editData.attachmentToSave.name)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold shrink-0 cursor-pointer"
                    >
                      Apri ↗
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Tipologia Prenotazione</label>
                  <select 
                    value={editData.category} 
                    onChange={(e) => setEditData({...editData, category: e.target.value})}
                    className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F]"
                  >
                    {Object.keys(entityLabel).filter(k => k !== 'sconosciuto').map(k => (
                      <option key={k} value={k}>{entityLabel[k]}</option>
                    ))}
                  </select>
                </div>

                {editData.category === 'trasporto' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Mezzo di Trasporto</label>
                    <select
                      value={editData.tipoTrasporto || 'volo'}
                      onChange={(e) => setEditData({...editData, tipoTrasporto: e.target.value})}
                      className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F]"
                    >
                      <option value="volo">✈️ Volo</option>
                      <option value="treno">🚆 Treno</option>
                      <option value="traghetto">⛴️ Traghetto</option>
                      <option value="auto">🚗 Noleggio Auto</option>
                      <option value="camper">🚐 Camper</option>
                      <option value="transfer">🚐 Transfer</option>
                      <option value="taxi">🚕 Taxi</option>
                    </select>
                  </div>
                )}

                {editData.category === 'shopping' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Sottocategoria Spesa</label>
                    <select
                      value={editData.sottocategoria || 'Altro'}
                      onChange={(e) => setEditData({...editData, sottocategoria: e.target.value})}
                      className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F]"
                    >
                      <option value="Souvenir">Souvenir & Artigianato</option>
                      <option value="Abbigliamento">Abbigliamento & Attrezzatura</option>
                      <option value="Alimentari">Alimentari & Supermercato</option>
                      <option value="Carburante">Carburante</option>
                      <option value="Altro">Altro</option>
                    </select>
                  </div>
                )}

                {editData.category === 'tappa' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Categoria Sosta</label>
                    <select
                      value={editData.sottocategoria || 'Tappa'}
                      onChange={(e) => setEditData({...editData, sottocategoria: e.target.value})}
                      className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F]"
                    >
                      <option value="Tappa">📍 Tappa</option>
                      <option value="Sosta panoramica">⛰️ Sosta panoramica</option>
                      <option value="Sosta fotografica">📸 Sosta fotografica</option>
                      <option value="Sosta">📍 Sosta generica</option>
                    </select>
                  </div>
                )}

                <div className="overflow-y-auto max-h-[45vh] pr-1 pb-2 custom-scrollbar space-y-3 min-w-0">
                  {editData.category === 'trasporto' && editData.layover?.airport && (
                    <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center gap-2">
                      <span>🔄</span>
                      <span><strong>Scalo previsto:</strong> {editData.layover.airport} {editData.layover.duration ? `(${editData.layover.duration})` : ''}</span>
                    </div>
                  )}

                  <div className="min-w-0">
                    <label className="text-xs font-semibold text-slate-600 mb-1 block truncate">Fornitore / Nome / Titolo</label>
                    <input 
                      type="text" 
                      value={editData.title || ''} 
                      onChange={(e) => setEditData({...editData, title: e.target.value})}
                      placeholder="es. Emirates, Hotel Franz Josef, Tour Milford Sound"
                      className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F]"
                    />
                  </div>
                  
                  <div className="min-w-0">
                    <label className="text-xs font-semibold text-slate-600 mb-1 block truncate">
                      {editData.category === 'trasporto' ? 'Da -> A (Partenza -> Arrivo)' : 'Luogo / Indirizzo'}
                    </label>
                    <input
                      type="text"
                      value={editData.location || ''}
                      onChange={(e) => setEditData({...editData, location: e.target.value})}
                      placeholder={editData.category === 'trasporto' ? 'DXB -> AKL' : 'Indirizzo o città'}
                      className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">
                        {editData.category === 'alloggio' ? 'Check-in' : 'Data Inizio'}
                      </label>
                      <input 
                        type="date" 
                        value={editData.dateStart || ''} 
                        onChange={(e) => setEditData({...editData, dateStart: e.target.value})}
                        className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F] [color-scheme:light]"
                      />
                    </div>
                    {editData.category !== 'alloggio' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">
                          {editData.category === 'tappa' ? 'Orario sosta (opzionale)' : 'Orario (Partenza / Inizio)'}
                        </label>
                        <TimePickerInput value={editData.time || ''} onChange={(time) => setEditData({...editData, time})} ariaLabel="Orario partenza o inizio" />
                      </div>
                    )}
                    {editData.category === 'trasporto' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">Orario Arrivo (opzionale)</label>
                        <TimePickerInput value={editData.arrivalTime || ''} onChange={(arrivalTime) => setEditData({...editData, arrivalTime})} ariaLabel="Orario arrivo" />
                      </div>
                    )}
                    {['alloggio', 'trasporto'].includes(editData.category) && (
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">
                          {editData.category === 'alloggio' ? 'Check-out' : 'Data Arrivo / Fine'}
                        </label>
                        <input 
                          type="date" 
                          value={editData.dateEnd || ''} 
                          onChange={(e) => setEditData({...editData, dateEnd: e.target.value})}
                          className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F] [color-scheme:light]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Codice Prenotazione (PNR)</label>
                      <input 
                        type="text" 
                        value={editData.bookingCode || ''} 
                        onChange={(e) => setEditData({...editData, bookingCode: e.target.value})}
                        placeholder="es. 6X8Y2A o numero biglietto"
                        className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F] font-mono"
                      />
                    </div>

                    {editData.category !== 'tappa' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">Prezzo (€)</label>
                        <input 
                          type="text" 
                          value={editData.cost || ''} 
                          onChange={(e) => setEditData({...editData, cost: e.target.value})}
                          placeholder="es. 150.00"
                          className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B5F]"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Condizioni, Note & Istruzioni</label>
                    <textarea 
                      value={editData.notes || ''} 
                      onChange={(e) => setEditData({...editData, notes: e.target.value})}
                      placeholder="Note, nominativi passeggeri, istruzioni accesso, bagagli..."
                      className="w-full bg-[#F8F7F3] text-[#172033] border border-slate-200 rounded-xl px-3 py-2 text-sm min-h-[70px] resize-none focus:outline-none focus:border-[#FF6B5F]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => activeQueueId ? setStep('queue') : setStep('input')}
                  className="flex-1 py-3 px-5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
                >
                  {activeQueueId ? '← Torna alla lista' : '← Annulla'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={Boolean(existingData && !duplicateConfirmed)}
                  className="flex-[2] py-3 px-6 rounded-xl text-sm font-semibold bg-[#FF6B5F] text-white shadow-md shadow-rose-500/20 hover:opacity-95 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {existingData ? '✅ Approva aggiornamento' : '✅ Approva e salva'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Step: SAVING ─── */}
          {step === 'saving' && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-slate-200 border-t-emerald-500 animate-spin" />
              </div>
              <p className="font-bold text-[#172033] text-sm">Salvataggio prenotazione in corso...</p>
            </div>
          )}

          {/* ─── Step: DONE ─── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-4xl shadow-sm border border-emerald-200 text-emerald-600">✅</div>
              <div className="text-center">
                <p className="font-extrabold text-[#172033] text-base">Prenotazione salvata con successo!</p>
                <p className="text-xs text-slate-500 mt-1">L'itinerario e gli allegati sono stati sincronizzati.</p>
              </div>
            </div>
          )}

          {/* ─── Step: ERROR ─── */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl mt-0.5">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-rose-800">{inputMode === 'chat' ? 'Concierge non raggiungibile' : 'Estrazione non riuscita'}</p>
                    <p className="text-xs text-rose-700 mt-1 leading-relaxed">{errorMsg}</p>
                    
                    <p className="text-[11px] text-rose-700 mt-3 pt-3 border-t border-rose-200">
                      Il testo e gli allegati restano pronti: puoi riprovare senza reinserirli.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setStep('input'); setErrorMsg(''); }}
                className="w-full py-3 rounded-xl text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
              >
                ← Riprova
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Mini-Modal Quando vuoi andare? */}
      {showCloudflareConsent && (
        <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="cloudflare-ai-consent-title" className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 id="cloudflare-ai-consent-title" className="text-lg font-extrabold text-slate-900 dark:text-white">Prima di usare HouniAI</h3>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <p>Il testo o l’immagine scelti saranno inviati a Cloudflare Workers AI solo dopo questa conferma.</p>
              <p>Cloudflare dichiara zero conservazione per l’inferenza standard e nessun addestramento sui contenuti. Può conservare metadati operativi senza il contenuto.</p>
              <p>I PDF testuali vengono letti sul dispositivo e viene inviato soltanto il testo estratto. Non inviare documenti d’identità, dati bancari o contenuti non necessari.</p>
              <p>Nessuna scheda viene salvata finché non la approvi singolarmente.</p>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setShowCloudflareConsent(false)} className="rounded-xl border border-slate-300 px-4 py-3 text-xs font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200">Continua manualmente</button>
              <button type="button" onClick={() => {
                grantCloudflareAiConsent();
                setShowCloudflareConsent(false);
                void handleExtract();
              }} className="rounded-xl bg-[#FF6B5F] px-4 py-3 text-xs font-bold text-white">Ho capito, invia</button>
            </div>
          </div>
        </div>
      )}

      {pendingSuggestion && (
        <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-700 animate-scale-up">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 text-center">Quando vuoi andare?</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Data</label>
                <input 
                  type="date"
                  value={pickerDate}
                  onChange={(e) => setPickerDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-[#FF6B5F] [color-scheme:light_dark]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Orario (opzionale)</label>
                <TimePickerInput value={pickerTime} onChange={setPickerTime} ariaLabel="Orario suggerimento" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setPendingSuggestion(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  setExistingData(null);
                  setAttachedFile(null);
                  setEditData({
                    category: pendingSuggestion.category || (pendingSuggestion.name ? 'ristorante' : 'attivita'),
                    title: pendingSuggestion.title || pendingSuggestion.name || pendingSuggestion.nome || '',
                    location: pendingSuggestion.location || pendingSuggestion.indirizzo || '',
                    dateStart: pickerDate,
                    time: pickerTime,
                    cost: pendingSuggestion.cost || pendingSuggestion.budget || '',
                    notes: pendingSuggestion.notes || pendingSuggestion.nota || ''
                  });
                  setPendingSuggestion(null);
                  setStep('review');
                }}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-[#FF6B5F] hover:bg-[#e85c50] shadow-md shadow-rose-500/20 transition"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
