import React, { useState, useEffect, useRef } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { getCoordinatesFromAddress } from '../../utils/mapsHelper';
import type { Attivita, TransportAttachment } from '../../types';
import { storageService } from '../../storage/storageService';
import { processFileForAttachment, formatFileSize, openAttachmentInNewTab, checkStorageAvailability } from '../../utils/fileAttachment';

interface AttivitaFormProps {
  days?: any[];
  selectedDayId?: string;
  initialData?: Attivita | null;
  onSave: (data: Omit<Attivita, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function AttivitaForm({ selectedDayId, initialData, onSave, onCancel, onDelete }: AttivitaFormProps) {
  const { isLockedByOther, lockedBy } = usePresence(initialData?.id);

  const SOTTOCATEGORIE: Attivita['sottocategoria'][] = ['Escursione', 'Tour Guidato', 'Museo', 'Adrenalina', 'Altro'];

  const [sottocategoria, setSottocategoria] = useState<Attivita['sottocategoria'] | ''>('');
  const [title, setTitle] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [orarioRitrovo, setOrarioRitrovo] = useState('');
  const [orarioInizio, setOrarioInizio] = useState('');
  const [duration, setDuration] = useState('');
  const [address, setAddress] = useState('');
  
  const [cost, setCost] = useState('');
  const [acconto, setAcconto] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'saldato' | 'da_saldare'>('saldato');
  const [link, setLink] = useState(''); 
  const [qrCode, setQrCode] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Attivita['status']>('prenotato');

  // Gestione Allegati (PDF / QR Code / Immagini)
  const [attachments, setAttachments] = useState<TransportAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    checkStorageAvailability().then(res => {
      if (res.isLowSpace && res.message) {
        setStorageWarning(res.message);
      }
    }).catch(() => {});
  }, []);

  const [error, setError] = useState('');
  const [conflictWarning, setConflictWarning] = useState('');
  const [isConflictConfirmed, setIsConflictConfirmed] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    if (initialData) {
      setSottocategoria(initialData.sottocategoria || '');
      setTitle(initialData.title);
      const dateVal = initialData.date || (initialData.dayId.startsWith('day_') ? initialData.dayId.replace('day_', '') : '');
      setCustomDate(dateVal);
      setOrarioRitrovo(initialData.orarioRitrovo || initialData.time || '');
      setOrarioInizio(initialData.orarioInizio || '');
      setDuration(initialData.duration || '');
      setAddress(initialData.address || initialData.location || '');
      
      setCost(initialData.cost || '');
      setAcconto(initialData.acconto || '');
      setPaymentStatus(initialData.paymentStatus || 'saldato');
      setLink(initialData.link || '');
      setQrCode(initialData.qrCode || '');
      setNotes(initialData.notes || '');
      setStatus(initialData.status || 'prenotato');
      setAttachments(initialData.attachments || []);
    } else {
      if (selectedDayId && selectedDayId.startsWith('day_')) {
        setCustomDate(selectedDayId.replace('day_', ''));
      } else if (selectedDayId && selectedDayId !== 'tutte') {
        setCustomDate(selectedDayId);
      } else {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setCustomDate(`${yyyy}-${mm}-${dd}`);
      }
      setSottocategoria('');
      setTitle('');
      setOrarioRitrovo('');
      setOrarioInizio('');
      setDuration('');
      setAddress('');
      setCost('');
      setAcconto('');
      setPaymentStatus('da_saldare');
      setLink('');
      setQrCode('');
      setNotes('');
      setStatus('prenotato');
      setAttachments([]);
    }
  }, [initialData, selectedDayId]);

  const parseDurationToMinutes = (dur: string) => {
    let m = 0;
    const matchH = dur.match(/(\d+)\s*h/i);
    if (matchH) m += parseInt(matchH[1], 10) * 60;
    const matchM = dur.match(/(\d+)\s*m/i);
    if (matchM) m += parseInt(matchM[1], 10);
    if (!matchH && !matchM) {
      const floatVal = parseFloat(dur.replace(',', '.'));
      if (!isNaN(floatVal)) m += floatVal * 60;
    }
    return m;
  };

  const getTimeMinutes = (t: string) => {
    const [hh, mm] = t.split(':').map(Number);
    return hh * 60 + (mm || 0);
  };

  useEffect(() => {
    setIsConflictConfirmed(false);
    setConflictWarning('');
  }, [orarioInizio, duration, customDate]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    setAttachmentError('');
    setIsUploadingAttachment(true);

    try {
      const newAttachments: TransportAttachment[] = [...attachments];

      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        const processed = await processFileForAttachment(file);
        newAttachments.push(processed);
      }

      setAttachments(newAttachments);
    } catch (err: unknown) {
      console.error('Errore durante il caricamento del file:', err);
      const msg = err instanceof Error ? err.message : 'Errore durante il caricamento del file.';
      setAttachmentError(msg);
    } finally {
      setIsUploadingAttachment(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleOpenPdf = (dataUrl: string, fileName: string) => {
    openAttachmentInNewTab(dataUrl, fileName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customDate || !title.trim()) {
      setError('Titolo e data sono obbligatori.');
      return;
    }

    // Validazione Sovrapposizione
    if (!isConflictConfirmed && orarioInizio && customDate) {
      try {
        const acts = await storageService.getActivities(`day_${customDate}`);
        const currentStart = getTimeMinutes(orarioInizio);
        const currentDur = duration ? parseDurationToMinutes(duration) : 60; // fallback 1h
        const currentEnd = currentStart + currentDur;

        const conflict = acts.find(act => {
          if (act.id === initialData?.id) return false;
          if (!act.orarioInizio) return false;
          const actStart = getTimeMinutes(act.orarioInizio);
          const actDur = act.duration ? parseDurationToMinutes(act.duration) : 60;
          const actEnd = actStart + actDur;
          return currentStart < actEnd && currentEnd > actStart;
        });

        if (conflict) {
          setConflictWarning(`Attenzione: hai già un'attività pianificata in questo intervallo orario ("${conflict.title}").`);
          setIsConflictConfirmed(true);
          return;
        }
      } catch (err) {
        console.error('Errore validazione sovrapposizione:', err);
      }
    }

    setError('');
    setConflictWarning('');

    setIsGeocoding(true);
    let finalCoord = initialData?.coordinate;

    if (address && address.trim()) {
      try {
        const coord = await getCoordinatesFromAddress(address);
        if (coord) finalCoord = coord;
      } catch (e) {}
    }

    setIsGeocoding(false);

    onSave({
      id: initialData?.id,
      dayId: `day_${customDate}`,
      date: customDate,
      title: title.trim(),
      sottocategoria: sottocategoria || undefined,
      category: 'visita', // fallback obbligatorio
      orarioRitrovo: orarioRitrovo || undefined,
      time: orarioInizio || orarioRitrovo || undefined, // legacy support
      orarioInizio: orarioInizio || undefined,
      duration: duration || undefined,
      address: address.trim() || undefined,
      location: address.trim() || title.trim(),
      coordinate: finalCoord,
      cost: cost.trim() || undefined,
      acconto: acconto.trim() || undefined,
      paymentStatus,
      link: link.trim() || undefined,
      qrCode: qrCode.trim() || undefined,
      notes: notes.trim() || undefined,
      status: paymentStatus === 'saldato' ? 'prenotato' : status,
      attachments: attachments.length > 0 ? attachments : undefined,
      copilota: initialData?.copilota,
      noteCopilota: initialData?.noteCopilota,
      platform: initialData?.platform
    });
  };

  const calculateSaldo = () => {
    const c = parseFloat(cost.replace(',', '.')) || 0;
    const a = parseFloat(acconto.replace(',', '.')) || 0;
    return c - a;
  };
  const saldo = calculateSaldo();

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-4">
      {isLockedByOther && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl font-bold flex gap-2 items-center animate-fade-in">
          <span className="text-base animate-pulse">⚠️</span>
          <span>Attenzione: il dispositivo "{lockedBy}" sta modificando questo elemento. Le modifiche potrebbero sovrascriversi.</span>
        </div>
      )}

      {error && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
          {error}
        </div>
      )}
      
      {conflictWarning && (
        <div className="p-3 text-xs rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <div className="font-bold flex items-center gap-1.5"><span className="text-lg">⚠️</span> {conflictWarning}</div>
          <div className="mt-1 ml-6">Clicca di nuovo "Salva Modifiche" per confermare comunque.</div>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Sottocategoria
        </label>
        <div className="flex flex-wrap gap-2">
          {SOTTOCATEGORIE.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSottocategoria(cat === sottocategoria ? '' : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                cat === sottocategoria
                  ? 'bg-[#FF6B5F] text-white border-[#FF6B5F]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Titolo Attività *
        </label>
        <input
          type="text"
          placeholder="es. Safari in Jeep"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] transition-colors placeholder:text-slate-400"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Data *
        </label>
        <input
          type="date"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] transition-colors"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ore Ritrovo
          </label>
          <input
            type="time"
            value={orarioRitrovo}
            onChange={(e) => setOrarioRitrovo(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ore Inizio
          </label>
          <input
            type="time"
            value={orarioInizio}
            onChange={(e) => setOrarioInizio(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Durata (es. 2h)
          </label>
          <input
            type="text"
            placeholder="es. 2h 15m"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Punto di Ritrovo / Indirizzo Maps
        </label>
        <input
          type="text"
          placeholder="es. Molo 4, Marina Grande"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] placeholder:text-slate-400"
        />
      </div>

      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Dettaglio Economico
        </label>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Costo Totale (€)</label>
            <input
              type="text"
              placeholder="es. 180"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Acconto Versato (€)</label>
            <input
              type="text"
              placeholder="es. 50"
              value={acconto}
              onChange={(e) => setAcconto(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#FF6B5F]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-600">
            Saldo Rimanente: <span className={`font-bold ${saldo > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{saldo > 0 ? saldo.toFixed(2) : '0.00'} €</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="saldato-toggle" className="text-xs font-bold text-slate-700 cursor-pointer">Saldato</label>
            <input
              id="saldato-toggle"
              type="checkbox"
              checked={paymentStatus === 'saldato'}
              onChange={(e) => {
            const checked = e.target.checked;
            setPaymentStatus(checked ? 'saldato' : 'da_saldare');
            if (checked && cost) {
                setAcconto(cost);
            } else {
                setAcconto('0');
            }
            setStatus(checked ? 'prenotato' : 'da_valutare'); // 'prenotato' in Attivita means confirmed basically. Or 'completato' if it exists.
        }}
              className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Pass / Voucher URL
          </label>
          <input
            type="text"
            placeholder="Link o codice"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            QR Code / PNR
          </label>
          <input
            type="text"
            placeholder="Codice a barre testuale"
            value={qrCode}
            onChange={(e) => setQrCode(e.target.value)}
            className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F]"
          />
        </div>
      </div>

      {/* Sezione Allegati Documenti / PDF / QR Code Originali */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              📎 Biglietto PDF &amp; File QR Code
            </label>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Carica il documento originale ricevuto dall'organizzatore (PDF o immagine con QR). Disponibile 100% offline.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAttachment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isUploadingAttachment ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Caricamento...</span>
              </>
            ) : (
              <>
                <span>+ Allega File</span>
              </>
            )}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,application/pdf"
            multiple
            className="hidden"
          />
        </div>

        {storageWarning && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{storageWarning}</span>
            </span>
            <button
              type="button"
              onClick={() => setStorageWarning('')}
              className="text-amber-700 font-bold ml-2 hover:opacity-80"
            >
              ✕
            </button>
          </div>
        )}

        {attachmentError && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>🚫</span>
              <span>{attachmentError}</span>
            </span>
            <button
              type="button"
              onClick={() => setAttachmentError('')}
              className="text-rose-600 font-bold ml-2 hover:opacity-80"
            >
              ✕
            </button>
          </div>
        )}

        {attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                    className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 text-base shrink-0 cursor-pointer hover:bg-amber-100 transition-colors"
                    title="Tocca per aprire"
                  >
                    {att.type === 'pdf' ? '📄' : '🖼️'}
                  </div>
                  <div className="min-w-0">
                    <p
                      onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                      className="text-xs font-bold text-slate-900 truncate cursor-pointer hover:text-amber-700"
                      title={att.name}
                    >
                      {att.name}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatFileSize(att.size)} • <span className="text-emerald-600 font-medium">Offline</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenPdf(att.dataUrl, att.name)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                    title="Apri documento"
                  >
                    Apri ↗
                  </button>
                  <a
                    href={att.dataUrl}
                    download={att.name}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold transition-colors cursor-pointer"
                    title="Scarica file originale"
                  >
                    Scarica ↓
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="w-7 h-7 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center font-bold text-xs cursor-pointer"
                    title="Rimuovi allegato"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-xl p-3.5 text-center cursor-pointer transition-colors bg-white/60"
          >
            <span className="text-xl block mb-1">🎫</span>
            <p className="text-xs font-semibold text-slate-700">Nessun file o voucher allegato</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Tocca qui per allegare PDF o immagini con QR code della prenotazione</p>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Note Libere / Cosa portare
        </label>
        <textarea
          rows={3}
          placeholder="es. Abbigliamento termico, snack, protezione solare..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-slate-100 focus:border-[#FF6B5F] placeholder:text-slate-400 resize-none"
        />
      </div>

      <div className="flex flex-col gap-3 pt-4 mt-2 border-t border-slate-100">
        <button
          type="submit"
          disabled={isGeocoding}
          className={`w-full h-12 rounded-xl text-sm font-bold bg-[#FF6B5F] hover:bg-[#e85c50] active:scale-95 text-white shadow-lg transition-all ${isGeocoding ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isGeocoding ? 'Salvataggio...' : 'Salva Modifiche'}
        </button>
        
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors py-1"
          >
            Annulla
          </button>
        )}

        {initialData && onDelete && (
          <div className="text-center">
            {!showConfirmDelete ? (
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors py-2"
              >
                Elimina attività
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 py-1">
                <span className="text-xs font-medium text-slate-600">Sei sicuro?</span>
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700"
                >
                  Sì, elimina
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300"
                >
                  Annulla
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
