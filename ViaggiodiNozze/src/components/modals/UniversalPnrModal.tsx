import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { Copy, Check, Edit3 } from 'lucide-react';

interface UniversalPnrModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  code: string;
  onSave: (newCode: string) => Promise<void>;
  canEdit?: boolean;
}

export default function UniversalPnrModal({
  isOpen,
  onClose,
  title,
  code,
  onSave,
  canEdit = true
}: UniversalPnrModalProps) {
  const [isEditing, setIsEditing] = useState(!code);
  const [inputValue, setInputValue] = useState(code || '');
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setInputValue(code || '');
      setIsEditing(!code);
      setCopied(false);
    }
  }, [isOpen, code]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(inputValue.trim());
      setIsEditing(false);
      if (!inputValue.trim()) onClose(); // Close if deleted
    } catch (err) {
      console.error('Errore PNR:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} accentVariant="sky">
      <div className="flex flex-col gap-4">
        {isEditing ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Inserisci il codice di prenotazione o PNR.
            </p>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.toUpperCase())}
              disabled={isSaving}
              placeholder="es. X9K2LM"
              className="w-full p-4 text-center font-mono text-2xl font-bold uppercase tracking-widest bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:border-[#FF6B5F] focus:ring-1 focus:ring-[#FF6B5F] text-[#172033] dark:text-white"
            />
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-3.5 rounded-xl font-bold bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-md shadow-[#FF6B5F]/20 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {isSaving ? 'Salvataggio...' : 'Salva Codice'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2">Codice PNR</span>
            <div className="text-4xl font-mono font-black text-[#172033] dark:text-white tracking-widest mb-6 select-all">
              {code}
            </div>
            
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={handleCopy}
                className="flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#FF6B5F] hover:bg-[#e85c50] text-white shadow-md shadow-[#FF6B5F]/20 transition-all active:scale-[0.98]"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? 'Copiato!' : 'Copia'}
              </button>
              
              {canEdit && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="py-3 px-4 rounded-xl font-bold flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Edit3 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
