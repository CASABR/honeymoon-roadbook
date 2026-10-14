import { useState, useEffect, useRef } from 'react';
import { extractFromText, extractFromAttachment, type ExtractedEntity } from '../../services/aiExtractor';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { processFileForAttachment, formatFileSize, openAttachmentInNewTab } from '../../utils/fileAttachment';
import type { TransportAttachment } from '../../types';

import { getTripConfig } from '../../utils/tripConfig';
import { auth } from '../../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

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

type Step = 'input' | 'extracting' | 'multiChoice' | 'review' | 'saving' | 'done' | 'error' | 'gmailLoading';

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
        className="text-violet-300 underline underline-offset-2 break-all hover:text-violet-200"
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
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<'import' | 'chat'>('import');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [existingData, setExistingData] = useState<any>(null);
  const [editData, setEditData] = useState<any>({});
  const [attachedFile, setAttachedFile] = useState<TransportAttachment | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [multiBookings, setMultiBookings] = useState<ExtractedEntity[]>([]);
  const [pendingSuggestion, setPendingSuggestion] = useState<any>(null);
  const [pickerDate, setPickerDate] = useState(defaultSuggestionDate());
  const [pickerTime, setPickerTime] = useState('');

  const handleGmailImport = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      
      if (!token) throw new Error('Token non disponibile');

      const config = getTripConfig();
      if (!config) throw new Error('Viaggio non configurato');

      const start = config.startDate.replace(/-/g, '/');
      const end = config.endDate.replace(/-/g, '/');
      const query = `after:${start} before:${end} (booking OR reservation OR flight OR hotel OR tour OR ticket OR conferma OR volo OR biglietto)`;

      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.messages || data.messages.length === 0) {
        throw new Error('Nessuna email rilevante trovata in quelle date.');
      }

      let combinedText = '';
      for (const msg of data.messages) {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=snippet`, {
           headers: { Authorization: `Bearer ${token}` }
        });
        const msgData = await msgRes.json();
        if (msgData.snippet) {
           combinedText += `[Email]: ${msgData.snippet}\n\n`;
        }
      }

      setText(combinedText);
      setStep('input');
    } catch (err: any) {
      setErrorMsg(err.message || 'Errore durante la lettura delle email');
      setStep('error');
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (mode === 'gmail') {
        setStep('gmailLoading');
        setText('');
        setErrorMsg('');
        setEditData({});
        setAttachedFile(null);
        setMultiBookings([]);
        handleGmailImport();
      } else {
        setStep('input');
        setText('');
        setErrorMsg('');
        setEditData({});
        setAttachedFile(null);
        setMultiBookings([]);
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
  const prepareReviewForEntity = async (entity: ExtractedEntity, currentAttachment?: TransportAttachment | null) => {
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
      initial.notes = d.nota || '';
      const all = await storageService.getTappe();
      existingItem = all.find(a => a.titolo.toLowerCase().includes(initial.title.toLowerCase()) && (a.data === initial.dateStart || a.date === initial.dateStart));
    } else if (cat === 'trasporto') {
      initial.title = `${d.departureLocation || ''} -> ${d.arrivalLocation || ''}`;
      initial.carrier = d.carrier || '';
      initial.dateStart = d.date || '';
      initial.dateEnd = d.arrivalDate || '';
      initial.cost = d.cost || '';
      initial.time = d.departureTime || '';
      initial.bookingCode = d.bookingCode || '';
      initial.notes = d.notes || '';
      const all = await storageService.getTransports();
      existingItem = all.find(a => (
        (initial.bookingCode && a.bookingCode && a.bookingCode.trim().toLowerCase() === initial.bookingCode.trim().toLowerCase()) ||
        (a.date === initial.dateStart && a.departureLocation?.toLowerCase() === d.departureLocation?.toLowerCase())
      ));
    }

    if (currentAttachment) {
      initial.attachmentToSave = currentAttachment;
    }

    setExistingData(existingItem || null);
    if (existingItem) {
      initial.id = existingItem.id;
    }
    setEditData(initial);
    setStep('review');
  };

  const handleExtract = async () => {
    // Verifica se c'è testo oppure un allegato caricato
    if (!text.trim() && !attachedFile) return;

    const currentUserText = text.trim();
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
        setMultiBookings(res.multipleItems);
        setStep('multiChoice');
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
        }
      }
      
      onSaved?.(cat === 'alloggio' ? 'alloggio' : (cat === 'trasporto' ? 'trasporto' : 'tappa'));
      setStep('done');
      setTimeout(() => onClose(), 1800);
    } catch (err) {
      console.error('Errore salvataggio:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Errore salvataggio.');
      setStep('error');
    }
  };

  const entityLabel: Record<string, string> = {
    alloggio: '🏨 Alloggio',
    tappa: '📍 Tappa',
    trasporto: '✈️ Trasporto',
    attivita: '🎫 Attività',
    ristorante: '🍝 Ristorante',
    sconosciuto: '❓ Sconosciuto',
  };

  return (
    <>
      {/* Hidden file input per 'Allega prenotazione' */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm"
        onClick={step === 'extracting' || step === 'saving' ? undefined : onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 sm:inset-0 sm:items-center sm:justify-center left-0 right-0 z-[90] flex justify-center">
        <div className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-700/60 sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-y-auto max-h-[88dvh] p-4 sm:p-6 animate-slide-up">

          {/* ─── Header ─── */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-2xl bg-[#FF6B5F]/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="text-white font-bold text-lg leading-tight truncate break-words">Inserimento Smart</h2>
                <p className="text-slate-400 text-sm mt-0.5 truncate break-words">L'AI estrae i dati dai tuoi documenti</p>
              </div>
            </div>
            {step !== 'extracting' && step !== 'saving' && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* ─── Step: GMAIL LOADING ─── */}
          {step === 'gmailLoading' && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin mb-4" />
              <h3 className="text-white font-bold mb-2">Ricerca in Gmail...</h3>
              <p className="text-slate-400 text-sm">Cerco email di viaggio tra le date selezionate.</p>
            </div>
          )}

          {/* ─── Step: INPUT ─── */}
          {(step === 'input' || (step === 'extracting' && inputMode === 'chat')) && (
            <div className="space-y-3 flex flex-col h-[70vh] max-h-[620px]">
              <div className="flex gap-2 p-1 bg-slate-800/50 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setInputMode('import')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${inputMode === 'import' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Importa Prenotazioni
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('chat')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${inputMode === 'chat' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Chiedi al Concierge
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
                        <div className="w-8 h-8 shrink-0 rounded-full bg-[#FF6B5F]/20 border border-violet-500/30 flex items-center justify-center text-sm mr-2 mt-1">✨</div>
                      )}
                      <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl whitespace-pre-wrap break-words text-sm ${
                        msg.role === 'user' 
                          ? 'bg-[#FF6B5F]/80 text-white rounded-br-sm' 
                          : 'bg-slate-800/80 text-slate-200 rounded-tl-sm border border-slate-700/80'
                      }`}>
                        {msg.role === 'ai' ? renderMessage(msg.text) : msg.text}
                        
                        {msg.suggestions && msg.suggestions.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {msg.suggestions.map((s: any, idx: number) => (
                              <div key={idx} className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold text-white">{s.title || s.name || s.nome}</span>
                                </div>
                                {(s.location || s.indirizzo) && <div className="text-xs text-slate-400 mb-2">📍 {s.location || s.indirizzo}</div>}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPickerDate(s.date || s.checkIn || defaultSuggestionDate());
                                    setPickerTime(s.time || s.departureTime || '');
                                    setPendingSuggestion(s);
                                  }}
                                  className="w-full py-1.5 rounded-lg bg-[#FF6B5F]/10 text-[#FF6B5F] text-xs font-bold hover:bg-[#FF6B5F]/20 transition"
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
                       <div className="w-8 h-8 shrink-0 rounded-full bg-[#FF6B5F]/20 border border-violet-500/30 flex items-center justify-center text-sm mr-2 animate-pulse">✨</div>
                       <div className="bg-slate-800/80 px-4 py-2.5 rounded-2xl rounded-tl-sm text-slate-400 text-sm italic">Sto analizzando...</div>
                    </div>
                  )}
                </div>
              )}

              {/* Box Allegato Caricato (se presente) */}
              {attachedFile && (
                <div className="p-3 bg-slate-800/90 border border-violet-500/30 rounded-2xl flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/20 text-violet-300 flex items-center justify-center text-lg shrink-0">
                      {attachedFile.type === 'pdf' ? '📄' : '🖼️'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-bold truncate">{attachedFile.name}</p>
                      <p className="text-slate-400 text-[10px]">{formatFileSize(attachedFile.size)} • Pronto per analisi</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {attachedFile.type === 'pdf' && (
                      <button
                        type="button"
                        onClick={() => openAttachmentInNewTab(attachedFile.dataUrl, attachedFile.name)}
                        className="px-2 py-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 bg-sky-950/40 rounded-lg transition"
                        title="Anteprima PDF"
                      >
                        Apri ↗
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachedFile(null)}
                      className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 flex items-center justify-center text-xs font-bold transition"
                      title="Rimuovi allegato"
                    >
                      ✕
                    </button>
                  </div>
                </div>
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
                        ? "File allegato pronto! Premi 'Estrai Dati con AI' per elaborarlo o aggiungi note..."
                        : "Incolla qui la conferma del volo, dell'hotel o carica direttamente il file PDF/foto con il pulsante qui sotto..."
                      : "Scrivi un messaggio o chiedi un consiglio..."
                  }
                  className={`w-full p-4 bg-slate-800/50 border border-slate-700 text-slate-200 text-sm resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 placeholder:text-slate-500 ${inputMode === 'chat' ? 'h-16 rounded-3xl pl-5 pr-14' : 'h-32 rounded-2xl leading-relaxed'}`}
                />
                {inputMode === 'chat' && (
                  <button
                    onClick={handleExtract}
                    disabled={!text.trim() && !attachedFile}
                    className="absolute right-2 top-2 bottom-2 w-12 h-12 rounded-full bg-[#FF6B5F] text-white flex items-center justify-center hover:bg-[#e85c50] disabled:opacity-50 transition"
                  >
                    <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                  </button>
                )}
              </div>

              {/* Pulsanti Azione (Allega prenotazione + Estrai) */}
              <div className="flex gap-2 shrink-0 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingFile}
                  className="px-4 py-3 rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer"
                  title="Carica documento PDF, biglietto o screenshot di prenotazione"
                >
                  <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span>{attachedFile ? 'Sostituisci File' : '📎 Allega prenotazione'}</span>
                </button>

                {inputMode === 'import' && (
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={!text.trim() && !attachedFile}
                    className="flex-1 py-3 rounded-xl font-bold bg-[#FF6B5F] text-white shadow-lg shadow-rose-500/20 hover:bg-[#e85c50] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Estrai Dati con AI</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── Step: EXTRACTING ─── */}
          {step === 'extracting' && inputMode === 'import' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-slate-800 border-t-violet-500 animate-spin" />
                <div className="absolute inset-3 rounded-full bg-slate-800 flex items-center justify-center text-xl">✨</div>
              </div>
              <div className="text-center">
                <p className="font-bold text-white text-sm">L'AI sta analizzando la prenotazione...</p>
                <p className="text-xs text-slate-400 mt-1">
                  {attachedFile ? `Lettura del file "${attachedFile.name}"` : 'Strutturazione campi in corso'}
                </p>
              </div>
            </div>
          )}

          {/* ─── Step: MULTI-CHOICE (Se sono state rilevate più prenotazioni) ─── */}
          {step === 'multiChoice' && multiBookings.length > 0 && (
            <div className="space-y-4">
              <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                <p className="text-sm font-bold text-violet-300">Trovate {multiBookings.length} prenotazioni nel documento</p>
                <p className="text-xs text-slate-300 mt-1">Seleziona quale prenotazione desideri verificare e inserire per prima:</p>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                {multiBookings.map((b: any, idx) => (
                  <div
                    key={idx}
                    onClick={() => prepareReviewForEntity(b, attachedFile)}
                    className="p-3.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl cursor-pointer transition flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-700 text-slate-200 uppercase">
                          {b.type}
                        </span>
                        <h4 className="text-sm font-bold text-white truncate">
                          {b.name || b.title || b.titolo || `${b.departureLocation} -> ${b.arrivalLocation}`}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate">
                        {b.date || b.checkIn || b.data || 'Data da verificare'} {b.bookingCode ? `• Cod: ${b.bookingCode}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-[#FF6B5F] group-hover:translate-x-1 transition shrink-0">
                      Scegli →
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setStep('input')}
                className="w-full py-2.5 rounded-xl text-xs font-semibold border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
              >
                ← Torna indietro
              </button>
            </div>
          )}

          {/* ─── Step: REVIEW (Scheda di riepilogo modificabile) ─── */}
          {step === 'review' && editData && editData.category !== 'info' && (
            <div className="space-y-4">
              {existingData ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-2">
                   <div className="flex items-start gap-2 text-amber-400">
                     <span className="text-lg">⚠️</span>
                     <div>
                       <p className="font-bold text-sm">Prenotazione già presente!</p>
                       <p className="text-xs mt-0.5 text-amber-300">
                         Trovato "{existingData.title || existingData.nome || existingData.name || existingData.titolo}" in questa data / codice. Puoi integrare i dati mancanti e allegare il documento senza duplicare.
                       </p>
                     </div>
                   </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-2">
                   <div className="flex items-center gap-2 text-emerald-400">
                     <span className="text-lg">✨</span>
                     <p className="font-bold text-sm">Dati estratti con successo</p>
                   </div>
                   <p className="text-xs text-slate-400 mt-1">Verifica e completa i campi prima di salvare nel tuo itinerario.</p>
                </div>
              )}

              {/* Box allegato associato alla prenotazione */}
              {editData.attachmentToSave && (
                <div className="p-2.5 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span>📎</span>
                    <span className="text-slate-200 font-medium truncate">{editData.attachmentToSave.name}</span>
                    <span className="text-slate-400">({formatFileSize(editData.attachmentToSave.size)})</span>
                  </div>
                  {editData.attachmentToSave.type === 'pdf' && (
                    <button
                      type="button"
                      onClick={() => openAttachmentInNewTab(editData.attachmentToSave.dataUrl, editData.attachmentToSave.name)}
                      className="text-sky-400 hover:text-sky-300 font-semibold shrink-0 cursor-pointer"
                    >
                      Apri ↗
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Tipologia Prenotazione</label>
                  <select 
                    value={editData.category} 
                    onChange={(e) => setEditData({...editData, category: e.target.value})}
                    className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  >
                    {Object.keys(entityLabel).filter(k => k !== 'sconosciuto').map(k => (
                      <option key={k} value={k}>{entityLabel[k]}</option>
                    ))}
                  </select>
                </div>

                <div className="overflow-y-auto max-h-[45vh] pr-1 pb-2 custom-scrollbar space-y-3 min-w-0">
                  <div className="min-w-0">
                    <label className="text-xs font-semibold text-slate-400 mb-1 block truncate">Fornitore / Nome / Titolo</label>
                    <input 
                      type="text" 
                      value={editData.title || ''} 
                      onChange={(e) => setEditData({...editData, title: e.target.value})}
                      placeholder="es. Emirates, Hotel Franz Josef, Tour Milford Sound"
                      className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  
                  {editData.category !== 'tappa' && (
                    <div className="min-w-0">
                      <label className="text-xs font-semibold text-slate-400 mb-1 block truncate">
                        {editData.category === 'trasporto' ? 'Da -> A (Partenza -> Arrivo)' : 'Luogo / Indirizzo'}
                      </label>
                      <input 
                        type="text" 
                        value={editData.location || ''} 
                        onChange={(e) => setEditData({...editData, location: e.target.value})}
                        placeholder={editData.category === 'trasporto' ? 'DXB -> AKL' : 'Indirizzo o città'}
                        className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 mb-1 block">
                        {editData.category === 'alloggio' ? 'Check-in' : 'Data Inizio'}
                      </label>
                      <input 
                        type="date" 
                        value={editData.dateStart || ''} 
                        onChange={(e) => setEditData({...editData, dateStart: e.target.value})}
                        className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 [color-scheme:dark]"
                      />
                    </div>
                    {!['tappa', 'alloggio'].includes(editData.category) && (
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Orario (Partenza / Inizio)</label>
                        <input 
                          type="time" 
                          value={editData.time || ''} 
                          onChange={(e) => setEditData({...editData, time: e.target.value})}
                          className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 [color-scheme:dark]"
                        />
                      </div>
                    )}
                    {['alloggio', 'trasporto'].includes(editData.category) && (
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">
                          {editData.category === 'alloggio' ? 'Check-out' : 'Data Arrivo / Fine'}
                        </label>
                        <input 
                          type="date" 
                          value={editData.dateEnd || ''} 
                          onChange={(e) => setEditData({...editData, dateEnd: e.target.value})}
                          className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 [color-scheme:dark]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 mb-1 block">Codice Prenotazione (PNR)</label>
                      <input 
                        type="text" 
                        value={editData.bookingCode || ''} 
                        onChange={(e) => setEditData({...editData, bookingCode: e.target.value})}
                        placeholder="es. 6X8Y2A o numero biglietto"
                        className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 font-mono"
                      />
                    </div>

                    {editData.category !== 'tappa' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Prezzo (€)</label>
                        <input 
                          type="text" 
                          value={editData.cost || ''} 
                          onChange={(e) => setEditData({...editData, cost: e.target.value})}
                          placeholder="es. 150.00"
                          className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 mb-1 block">Condizioni, Note & Istruzioni</label>
                    <textarea 
                      value={editData.notes || ''} 
                      onChange={(e) => setEditData({...editData, notes: e.target.value})}
                      placeholder="Note, nominativi passeggeri, istruzioni accesso, bagagli..."
                      className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm min-h-[70px] resize-none focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => existingData ? onClose() : (multiBookings.length > 1 ? setStep('multiChoice') : setStep('input'))}
                  className="flex-1 py-3 px-5 rounded-xl text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                >
                  {existingData ? 'Mantieni Invariato' : '← Annulla'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-[2] py-3 px-6 rounded-xl text-sm font-semibold bg-[#FF6B5F] text-white shadow-lg shadow-rose-500/20 hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {existingData ? '✅ Aggiorna e Allega' : '✅ Conferma e Crea Prenotazione'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Step: SAVING ─── */}
          {step === 'saving' && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-slate-800 border-t-emerald-500 animate-spin" />
              </div>
              <p className="font-bold text-white text-sm">Salvataggio prenotazione in corso...</p>
            </div>
          )}

          {/* ─── Step: DONE ─── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-4xl shadow-sm border border-emerald-500/30">✅</div>
              <div className="text-center">
                <p className="font-extrabold text-white text-base">Prenotazione creata con successo!</p>
                <p className="text-xs text-slate-400 mt-1">L'itinerario e gli allegati sono stati sincronizzati.</p>
              </div>
            </div>
          )}

          {/* ─── Step: ERROR ─── */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl mt-0.5">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-rose-400">{inputMode === 'chat' ? 'Concierge non raggiungibile' : 'Estrazione non riuscita'}</p>
                    <p className="text-xs text-rose-300 mt-1 leading-relaxed">{errorMsg}</p>
                    
                    {errorMsg.toLowerCase().includes('chiave') && (
                      <div className="mt-3 pt-3 border-t border-rose-500/20">
                        <label className="text-[11px] font-semibold text-rose-200 block mb-1">
                          Inserisci Chiave API Google Gemini (salvata per sempre):
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            id="inline-gemini-key"
                            placeholder="Incolla chiave API..."
                            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const inputEl = document.getElementById('inline-gemini-key') as HTMLInputElement;
                              if (inputEl && inputEl.value.trim()) {
                                const cleanKey = inputEl.value.trim().replace(/['"]/g, '');
                                localStorage.setItem('gemini_api_key', cleanKey);
                                setErrorMsg('');
                                setStep('input');
                                handleExtract();
                              }
                            }}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition"
                          >
                            Salva e Riprova
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setStep('input'); setErrorMsg(''); }}
                className="w-full py-3 rounded-xl text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
              >
                ← Riprova
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Mini-Modal Quando vuoi andare? */}
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
                <input 
                  type="time"
                  value={pickerTime}
                  onChange={(e) => setPickerTime(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-[#FF6B5F] [color-scheme:light_dark]"
                />
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
                  setEditData({
                    category: pendingSuggestion.category || (pendingSuggestion.name ? 'ristorante' : 'attivita'),
                    title: pendingSuggestion.title || pendingSuggestion.name || pendingSuggestion.nome,
                    location: pendingSuggestion.location || pendingSuggestion.indirizzo || '',
                    dateStart: pickerDate,
                    time: pickerTime,
                    cost: pendingSuggestion.cost || '',
                    notes: pendingSuggestion.notes || ''
                  });
                  setPendingSuggestion(null);
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
}
