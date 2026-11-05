import { useState, useEffect } from 'react';
import type { Trasporto } from '../../types';
import Modal from '../common/Modal';
import { formatDateIT } from '../../utils/tripDates';
import { storageService, notifyDataChanged } from '../../storage/storageService';
import { Check } from 'lucide-react';

interface TrasportoBagagliModalProps {
  isOpen: boolean;
  onClose: () => void;
  transport: Trasporto | null;
  onUpdateTransport?: (updated: Trasporto) => void;
}

export default function TrasportoBagagliModal({
  isOpen,
  onClose,
  transport,
  onUpdateTransport
}: TrasportoBagagliModalProps) {
  const [bagagliText, setBagagliText] = useState(transport?.bagagli || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (transport) {
      setBagagliText(transport.bagagli || '');
      setIsEditing(false);
      setShowSaved(false);
    }
  }, [transport, isOpen]);

  if (!transport) return null;

  const rawBagagli = (isEditing ? bagagliText : transport.bagagli)?.trim() || '';
  const hasBagagli = rawBagagli.length > 0;

  // Suddivisione in segmenti se presenti separatori '|' o a capo
  const segments = hasBagagli
    ? rawBagagli
        .split(/[|\n]+/)
        .map(s => s.trim())
        .filter(Boolean)
    : [];

  const getSegmentIcon = (text: string) => {
    const l = text.toLowerCase();
    if (l.includes('stiva') || l.includes('checked') || l.includes('valigie') || l.includes('valigia')) return '🧳';
    if (l.includes('cabina') || l.includes('mano') || l.includes('cabin') || l.includes('trolley')) return '🎒';
    if (l.includes('accessorio') || l.includes('zaino') || l.includes('borsa')) return '👜';
    if (l.includes('veicolo') || l.includes('auto') || l.includes('camper') || l.includes('bagagliaio') || l.includes('vano')) return '🚐';
    return '📦';
  };

  const isRental = transport.type === 'auto' || transport.type === 'camper';
  const depLocation = transport.departureLocation || 'Partenza';
  const arrLocation = transport.dropoffLocation || transport.arrivalLocation || 'Arrivo';

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const clean = bagagliText.trim();
      const updated: Trasporto = {
        ...transport,
        bagagli: clean || undefined,
        updatedAt: Date.now()
      };
      await storageService.saveTransport(updated);
      notifyDataChanged('trasporti', 'save', updated);
      if (typeof onUpdateTransport === 'function') onUpdateTransport(updated);
      window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update', entityType: 'trasporti', data: updated } }));
      setIsEditing(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (err) {
      console.error('Errore al salvataggio bagagli:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const addPreset = (presetText: string) => {
    setBagagliText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return presetText;
      if (trimmed.includes(presetText)) return trimmed;
      return `${trimmed} | ${presetText}`;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Informazioni Bagagli"
      accentVariant="sky"
    >
      <div className="space-y-4">
        {/* Intestazione Trasporto Specifico */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              {transport.type}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {formatDateIT(transport.date)} {transport.departureTime ? `• h ${transport.departureTime}` : ''}
            </span>
          </div>

          <div className="font-bold text-sm text-slate-900 dark:text-white">
            {transport.carrier || 'Trasporto'}
          </div>

          <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1.5 truncate">
            <span className="truncate">{depLocation}</span>
            <span className="text-sky-500 shrink-0">➔</span>
            <span className="truncate">{arrLocation}</span>
          </div>

          {transport.bookingCode && (
            <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2 text-xs">
              <span className="text-slate-400 dark:text-slate-500 font-medium">PNR:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{transport.bookingCode}</span>
            </div>
          )}
        </div>

        {/* Modalità Modifica */}
        {isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                Modifica Franchigia & Bagagli
              </label>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
              >
                Annulla
              </button>
            </div>

            <textarea
              value={bagagliText}
              onChange={(e) => setBagagliText(e.target.value)}
              placeholder="es. 1x 23kg da stiva | 1x 8kg in cabina | Zaino personale"
              className="w-full p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-[#172033] dark:text-white text-sm focus:outline-none focus:border-[#FF6B5F] focus:ring-1 focus:ring-[#FF6B5F] min-h-[110px] resize-none shadow-inner"
            />

            {/* Chip preset rapidi */}
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Aggiunta rapida:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => addPreset('1x 23kg Stiva')}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  + 🧳 1x Stiva 23kg
                </button>
                <button
                  type="button"
                  onClick={() => addPreset('1x 8kg Cabina')}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  + 🎒 1x Cabina 8kg
                </button>
                <button
                  type="button"
                  onClick={() => addPreset('Zaino personale')}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  + 👜 Zaino personale
                </button>
                <button
                  type="button"
                  onClick={() => setBagagliText('Solo bagaglio a mano')}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  Solo a mano
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 rounded-xl font-bold bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-md shadow-[#FF6B5F]/20 cursor-pointer transition active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? 'Salvataggio...' : 'Salva Informazioni Bagagli'}
            </button>
          </div>
        ) : (
          /* Modalità Visualizzazione */
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Franchigia & Condizioni Registrate
              </h4>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-xs font-bold text-[#FF6B5F] hover:underline cursor-pointer"
              >
                ✏️ Modifica
              </button>
            </div>

            {showSaved && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Bagagli aggiornati con successo!</span>
              </div>
            )}

            {hasBagagli ? (
              <div className="space-y-2.5">
                {segments.map((seg, idx) => {
                  const icon = getSegmentIcon(seg);
                  const colonIndex = seg.indexOf(':');
                  const hasLabel = colonIndex > 0 && colonIndex < 25;
                  const label = hasLabel ? seg.slice(0, colonIndex).trim() : null;
                  const content = hasLabel ? seg.slice(colonIndex + 1).trim() : seg;

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-start gap-3 shadow-2xs"
                    >
                      <span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-800/60 text-base flex items-center justify-center shrink-0">
                        {icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        {label && (
                          <div className="text-xs font-extrabold uppercase tracking-wide text-slate-900 dark:text-white mb-0.5">
                            {label}
                          </div>
                        )}
                        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap">
                          {content}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Stato Vuoto Reale - Nessuna informazione inserita */
              <div className="py-6 px-4 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2.5">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center text-2xl mx-auto shadow-inner">
                  🧳
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Informazioni sui bagagli non disponibili
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                    Nessuna specifica di bagaglio o franchigia è stata inserita per questo {isRental ? 'veicolo' : 'trasporto'}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#FF6B5F] hover:bg-[#e85c50] text-white transition shadow-sm cursor-pointer"
                >
                  + Aggiungi Dettagli Bagagli
                </button>
              </div>
            )}
          </>
        )}

        {/* Link al Biglietto se presente per consultazione dettagli */}
        {transport.ticketUrl && (
          <div className="pt-1">
            <a
              href={transport.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-700"
            >
              <span>🔗 Consulta Biglietto Online</span>
            </a>
          </div>
        )}

        {/* Pulsante di Chiusura */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </Modal>
  );
}
