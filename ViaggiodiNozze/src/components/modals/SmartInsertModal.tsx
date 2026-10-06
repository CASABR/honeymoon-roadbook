import { useState, useEffect, useRef } from 'react';
import { extractFromText } from '../../services/aiExtractor';
import { storageService } from '../../storage/storageService';

import { getTripConfig } from '../../utils/tripConfig';
import { auth } from '../../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface SmartInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (entityType: 'alloggio' | 'tappa' | 'trasporto') => void;
  mode?: 'gmail' | 'manual';
}

type Step = 'input' | 'extracting' | 'review' | 'saving' | 'done' | 'error' | 'gmailLoading';

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

  const [inputMode, setInputMode] = useState<'import' | 'chat'>('import');
  const [editData, setEditData] = useState<any>({});
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
        handleGmailImport();
      } else {
        setStep('input');
        setText('');
        setErrorMsg('');
        setEditData({});
        setTimeout(() => textAreaRef.current?.focus(), 100);
      }
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const handleExtract = async () => {
    if (!text.trim()) return;

    setStep('extracting');
    setErrorMsg('');

    const config = getTripConfig();
    const today = new Date().toISOString().split('T')[0];
    const contextStr = `Data Odierna: ${today}. Viaggio: ${config?.title} (${config?.startDate} - ${config?.endDate}).`;

    const res = await extractFromText(text, contextStr, inputMode);

    if (res.success && res.data) {
      const d: any = res.data;
      const initial: any = { category: res.entityType };
      
      if (res.entityType === 'alloggio') {
        initial.title = d.name || '';
        initial.location = d.location || '';
        initial.dateStart = d.checkIn || '';
        initial.dateEnd = d.checkOut || '';
        initial.cost = d.cost || '';
        initial.notes = d.notes || '';
      } else if (res.entityType === 'attivita') {
        initial.title = d.title || '';
        initial.location = d.location || '';
        initial.dateStart = d.date || '';
        initial.cost = d.cost || '';
        initial.notes = d.notes || '';
      } else if (res.entityType === 'ristorante') {
        initial.title = d.name || '';
        initial.location = d.location || '';
        initial.dateStart = d.date || '';
        initial.cost = d.cost || '';
        initial.notes = d.notes || '';
      } else if (res.entityType === 'tappa') {
        initial.title = d.titolo || '';
        initial.dateStart = d.data || '';
        initial.notes = d.nota || '';
      } else if (res.entityType === 'trasporto') {
        initial.title = `${d.departureLocation || ''} -> ${d.arrivalLocation || ''}`;
        initial.dateStart = d.date || '';
        initial.dateEnd = d.arrivalDate || '';
        initial.cost = d.cost || '';
        initial.notes = d.notes || '';
      } else if (res.entityType === 'info') {
        initial.message = d.message || '';
        initial.suggestions = d.suggestions || [];
        initial.question = text;
      }
      setEditData(initial);
      setStep('review');
    } else {
      setErrorMsg(res.error || 'Estrazione fallita.');
      setStep('error');
    }
  };

  const handleSave = async () => {
    setStep('saving');

    try {
      const now = Date.now();
      const cat = editData.category;

      if (cat === 'alloggio') {
        await storageService.saveAccommodation({
          id: generateId('alloggio'),
          name: editData.title,
          location: editData.location,
          checkIn: editData.dateStart,
          checkOut: editData.dateEnd,
          address: editData.location || '',
          cost: editData.cost,
          time: editData.time,
          notes: editData.notes,
          status: 'prenotato',
          createdAt: now,
          updatedAt: now,
        } as any);
        onSaved?.('alloggio');
      } else if (cat === 'tappa') {
        await storageService.addTappa({
          titolo: editData.title,
          data: editData.dateStart,
          date: editData.dateStart,
          nota: editData.notes,
        });
        onSaved?.('tappa');
      } else if (cat === 'trasporto') {
        // Estrai se possibile andata/ritorno dal title
        const parts = editData.title.split('->').map((s: string) => s.trim());
        const dep = parts[0] || editData.title;
        const arr = parts[1] || '';
        await storageService.saveTransport({
          id: generateId('trasporto'),
          type: 'volo', // Default generico
          date: editData.dateStart,
          arrivalDate: editData.dateEnd,
          departureLocation: dep,
          arrivalLocation: arr,
          cost: editData.cost,
          time: editData.time,
          notes: editData.notes,
          status: 'prenotato',
          createdAt: now,
          updatedAt: now,
        } as any);
        onSaved?.('trasporto');
      } else if (cat === 'attivita') {
        await storageService.saveActivity({
          id: generateId('attivita'),
          dayId: `day_${editData.dateStart}`,
          date: editData.dateStart,
          title: editData.title,
          location: editData.location,
          cost: editData.cost,
          time: editData.time,
          category: 'visita', // fallback category
          status: 'pianificata',
          notes: editData.notes,
          createdAt: now,
          updatedAt: now,
        } as any);
        // onSaved supporta opzionalmente un type aggiuntivo, ma passiamo 'tappa' come approssimazione
        onSaved?.('tappa');
      } else if (cat === 'ristorante') {
        await storageService.saveRistorante({
          id: generateId('rist'),
          nome: editData.title,
          data: editData.dateStart,
          date: editData.dateStart,
          dayId: `day_${editData.dateStart}`,
          indirizzo: editData.location,
          budget: editData.cost,
          time: editData.time,
          nota: editData.notes,
          createdAt: now,
          updatedAt: now,
        } as any);
        onSaved?.('tappa');
      }

      setStep('done');
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore durante il salvataggio.';
      setErrorMsg(msg);
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm"
        onClick={step === 'extracting' || step === 'saving' ? undefined : onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 sm:inset-0 sm:items-center sm:justify-center left-0 right-0 z-[90] flex justify-center">
        <div className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-700/60 sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-y-auto max-h-[85dvh] p-4 sm:p-6 animate-slide-up">

          {/* ─── Header ─── */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-2xl bg-[#FF6B5F]/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="text-white font-bold text-lg leading-tight truncate break-words">Inserimento Smart</h2>
                <p className="text-slate-400 text-sm mt-0.5 truncate break-words">L'AI legge i tuoi appunti</p>
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
          {step === 'input' && (
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-800/50 rounded-xl mb-4">
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

              <textarea
                ref={textAreaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  inputMode === 'import'
                    ? "Incolla qui la conferma del volo, della stanza o un'idea per una tappa...\n\nEsempio:\n\"Prenotazione confermata per Hotel Franz Josef dal 5 al 7 dicembre.\""
                    : "Chiedi consigli al tuo Concierge...\n\nEsempio:\n\"Dove mangiare stasera a Tokyo?\"\n\"Cosa vedere oggi pomeriggio?\""
                }
                className="w-full h-40 p-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-slate-200 text-sm resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 placeholder:text-slate-500 leading-relaxed"
              />

              <div className="flex gap-2">
                {inputMode === 'import' && (
                  <button
                    type="button"
                    onClick={() => alert('Funzionalità di scansione OCR (PDF/Immagini) in arrivo!')}
                    className="w-12 shrink-0 py-3.5 rounded-xl font-semibold bg-slate-800 text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-700 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
                    title="Allega PDF o Immagine"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={!text.trim()}
                  className="flex-1 py-3.5 rounded-xl font-bold bg-[#FF6B5F] text-white shadow-lg shadow-rose-500/20 hover:bg-[#e85c50] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {inputMode === 'import' ? 'Crea Tappa con AI' : 'Invia al Concierge'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Step: EXTRACTING ─── */}
          {step === 'extracting' && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-slate-800 border-t-violet-500 animate-spin" />
                <div className="absolute inset-3 rounded-full bg-slate-800 flex items-center justify-center text-xl">✨</div>
              </div>
              <div className="text-center">
                <p className="font-bold text-white text-sm">{inputMode === 'chat' ? 'Hitchy sta pensando...' : "L'AI sta analizzando..."}</p>
                <p className="text-xs text-slate-400 mt-1">{inputMode === 'chat' ? 'Preparo i consigli' : 'Strutturazione in corso'}</p>
              </div>
            </div>
          )}

          {/* ─── Step: REVIEW ─── */}
          {step === 'review' && editData && editData.category === 'info' && (
            <div className="space-y-4">
              {/* Domanda utente */}
              {editData.question && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-[#FF6B5F]/80 text-white text-sm px-4 py-2.5 rounded-2xl rounded-br-md whitespace-pre-wrap break-words">
                    {editData.question}
                  </div>
                </div>
              )}

              {/* Risposta assistente */}
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 shrink-0 rounded-full bg-[#FF6B5F]/20 border border-violet-500/30 flex items-center justify-center text-lg">
                  ✨
                </div>
                <div className="min-w-0 flex-1 bg-slate-800/80 p-4 rounded-2xl rounded-tl-md border border-slate-700/80">
                  <p className="text-violet-400 text-[11px] font-bold uppercase tracking-wider mb-1.5">Hitchy · Concierge</p>
                  <div className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed break-words">
                    {renderMessage(editData.message || '')}
                  </div>
                </div>
              </div>

              {editData.suggestions && editData.suggestions.length > 0 && (
                <div className="space-y-3 mt-4">
                  {editData.suggestions.map((s: any, idx: number) => (
                    <div key={idx} className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                         <span className="font-bold text-white text-sm">{s.title || s.name || s.nome || 'Proposta'}</span>
                         {s.cost && <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{s.cost}€</span>}
                      </div>
                      {(s.location || s.indirizzo) && (
                         <div className="text-xs text-slate-400">📍 {s.location || s.indirizzo}</div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const hasTime = !!(s.time || s.departureTime);
                          const hasDate = !!(s.date || s.checkIn);
                          if (!hasTime || !hasDate) {
                            setPickerDate(s.date || s.checkIn || defaultSuggestionDate());
                            setPickerTime(s.time || s.departureTime || '');
                            setPendingSuggestion(s);
                          } else {
                            setEditData({
                              category: s.category || (s.name ? 'ristorante' : 'attivita'),
                              title: s.title || s.name || s.nome,
                              location: s.location || s.indirizzo || '',
                              dateStart: s.date || s.checkIn || defaultSuggestionDate(),
                              time: s.time || s.departureTime || '',
                              cost: s.cost || '',
                              notes: s.notes || ''
                            });
                          }
                        }}
                        className="w-full mt-1 py-2.5 rounded-xl font-bold bg-[#FF6B5F]/10 hover:bg-[#FF6B5F]/20 text-[#FF6B5F] border border-[#FF6B5F]/20 transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                      >
                        ➕ Aggiungi al Viaggio
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  id="concierge-new-question"
                  onClick={() => { setText(''); setStep('input'); setTimeout(() => textAreaRef.current?.focus(), 50); }}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold border border-slate-700 text-slate-200 hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                >
                  💬 Nuova domanda
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-slate-700 text-white hover:bg-slate-600 transition-colors cursor-pointer"
                >
                  Chiudi
                </button>
              </div>
            </div>
          )}

          {step === 'review' && editData && editData.category !== 'info' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Categoria Rilevata</label>
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
                    <label className="text-xs font-semibold text-slate-400 mb-1 block truncate">Nome / Titolo</label>
                    <input 
                      type="text" 
                      value={editData.title || ''} 
                      onChange={(e) => setEditData({...editData, title: e.target.value})}
                      className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  
                  {editData.category !== 'tappa' && (
                    <div className="min-w-0">
                      <label className="text-xs font-semibold text-slate-400 mb-1 block truncate">
                        {editData.category === 'trasporto' ? 'Da -> A' : 'Luogo / Indirizzo'}
                      </label>
                      <input 
                        type="text" 
                        value={editData.location || ''} 
                        onChange={(e) => setEditData({...editData, location: e.target.value})}
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
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Orario</label>
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
                          {editData.category === 'alloggio' ? 'Check-out' : 'Data Fine'}
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

                  {editData.category !== 'tappa' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-400 mb-1 block">Costo (€)</label>
                      <input 
                        type="number" 
                        value={editData.cost || ''} 
                        onChange={(e) => setEditData({...editData, cost: e.target.value})}
                        className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-400 mb-1 block">Note / Dettagli</label>
                    <textarea 
                      value={editData.notes || ''} 
                      onChange={(e) => setEditData({...editData, notes: e.target.value})}
                      className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm min-h-[60px] resize-none focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setStep('input'); }}
                  className="flex-1 py-3 px-5 rounded-xl text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                >
                  ← Annulla
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-[2] py-3 px-6 rounded-xl text-sm font-semibold bg-[#FF6B5F] text-white shadow-lg shadow-rose-500/20 hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  ✅ Salva nel Roadbook
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
              <p className="font-bold text-white text-sm">Salvataggio in corso...</p>
            </div>
          )}

          {/* ─── Step: DONE ─── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-4xl shadow-sm border border-emerald-500/30">✅</div>
              <div className="text-center">
                <p className="font-extrabold text-white text-base">Salvato con successo!</p>
                <p className="text-xs text-slate-400 mt-1">Il tuo Roadbook è stato aggiornato.</p>
              </div>
            </div>
          )}

          {/* ─── Step: ERROR ─── */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl mt-0.5">⚠️</span>
                  <div>
                    <p className="text-sm font-bold text-rose-400">{inputMode === 'chat' ? 'Concierge non raggiungibile' : 'Estrazione non riuscita'}</p>
                    <p className="text-xs text-rose-300 mt-1 leading-relaxed">{errorMsg}</p>
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
