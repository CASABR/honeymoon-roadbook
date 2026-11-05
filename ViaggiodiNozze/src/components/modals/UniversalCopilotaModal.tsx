import { useState, useEffect, useRef } from 'react';
import Modal from '../common/Modal';
import { Handshake, Check } from 'lucide-react';

interface UniversalCopilotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  noteCopilota: string;
  mostraNoteInCard?: boolean;
  onSave: (notes: string, mostraNoteInCard?: boolean) => Promise<void>;
  canEdit?: boolean;
}

export default function UniversalCopilotaModal({
  isOpen,
  onClose,
  title,
  noteCopilota,
  mostraNoteInCard = false,
  onSave,
  canEdit = true
}: UniversalCopilotaModalProps) {
  const [notes, setNotes] = useState(noteCopilota || '');
  const [showOnCard, setShowOnCard] = useState(mostraNoteInCard);
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setNotes(noteCopilota || '');
      setShowOnCard(mostraNoteInCard);
      setShowSavedFeedback(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, noteCopilota, mostraNoteInCard]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(notes, showOnCard);
      setShowSavedFeedback(true);
      setTimeout(() => {
        setShowSavedFeedback(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Errore al salvataggio copilota:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Copilota" accentVariant="sky">
      <div className="flex flex-col gap-4">
        
        {/* Intestazione */}
        <div className="flex items-center gap-3 bg-[#F0FAF9] dark:bg-slate-800 p-4 rounded-2xl border border-[#DDF4F5] dark:border-slate-700">
          <div className="w-10 h-10 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 shadow-sm">
            <Handshake className="w-5 h-5 text-[#FF6B5F]" />
          </div>
          <div>
            <h3 className="font-bold text-[#172033] dark:text-white text-sm">Note per {title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
              Aggiungi indicazioni di guida, parcheggi o consigli rapidi per il passeggero.
            </p>
          </div>
        </div>

        {/* Textarea */}
        <div className="flex-1">
          <textarea
            data-copilota-editor="stable"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit || isSaving}
            placeholder="es. Parcheggio gratuito a sinistra dopo il ponte. Attenzione al fondo sterrato."
            className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-[#172033] dark:text-white text-sm focus:outline-none focus:border-[#FF6B5F] focus:ring-1 focus:ring-[#FF6B5F] resize-none min-h-[150px] shadow-inner"
          />
        </div>

        {/* Toggle per mostrare a vista sulla card */}
        {canEdit && (
          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer select-none transition-colors hover:bg-slate-100/70 dark:hover:bg-slate-800">
            <input
              type="checkbox"
              checked={showOnCard}
              onChange={(e) => setShowOnCard(e.target.checked)}
              disabled={isSaving}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Mostra note copilota a vista sulla card
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Se non spuntato, sulla card comparirà solo l&apos;icona verde del Copilota se ci sono informazioni inserite.
              </span>
            </div>
          </label>
        )}

        {/* Azioni */}
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={isSaving || (notes === noteCopilota && showOnCard === mostraNoteInCard && !showSavedFeedback)}
            className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              showSavedFeedback
                ? 'bg-[#E6F4EA] text-[#39734A] border border-[#39734A]/20'
                : 'bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-md shadow-[#FF6B5F]/20 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {showSavedFeedback ? (
              <>
                <Check className="w-5 h-5" />
                Salvato!
              </>
            ) : isSaving ? (
              'Salvataggio...'
            ) : (
              'Salva Note Copilota'
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}
