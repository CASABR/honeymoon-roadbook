import { useState } from 'react';
import ConfirmDialog from '../common/ConfirmDialog';

interface FormActionButtonsProps {
  isEditing: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  cancelLabel?: string;
  deleteLabel?: string;
  itemName?: string;
  onCancel?: () => void;
  onDelete?: () => void;
}

/**
 * Barra azioni unificata per il retro/form delle card (Aggiorna, Annulla, Elimina)
 * con conferma esplicita tramite ConfirmDialog prima dell'eliminazione.
 */
export default function FormActionButtons({
  isEditing,
  isSubmitting = false,
  submitLabel,
  submittingLabel = 'Salvataggio...',
  cancelLabel = 'Annulla',
  deleteLabel = 'Elimina',
  itemName,
  onCancel,
  onDelete
}: FormActionButtonsProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const resolvedSubmitLabel = submitLabel || (isEditing ? 'Aggiorna' : 'Salva');
  const resolvedItemName = itemName?.trim() || 'questo elemento';

  return (
    <>
      <div className="flex flex-row-reverse flex-wrap sm:flex-nowrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 mt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 sm:flex-none sm:min-w-[140px] min-h-[44px] px-4 sm:px-6 rounded-xl text-sm font-bold bg-[#FF6B5F] hover:bg-[#e85c50] active:scale-95 text-white shadow-md shadow-rose-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isSubmitting ? submittingLabel : resolvedSubmitLabel}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-3 sm:px-4 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-all cursor-pointer whitespace-nowrap"
          >
            {cancelLabel}
          </button>
        )}

        {isEditing && onDelete && (
          <button
            type="button"
            onClick={() => setIsConfirmOpen(true)}
            className="min-h-[44px] px-3 sm:px-4 rounded-xl text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-950/70 hover:text-rose-700 transition-all cursor-pointer whitespace-nowrap"
          >
            {deleteLabel}
          </button>
        )}
      </div>

      {isEditing && onDelete && (
        <ConfirmDialog
          isOpen={isConfirmOpen}
          title="Conferma eliminazione"
          message={`Vuoi davvero eliminare ${resolvedItemName}?`}
          confirmLabel="Elimina"
          cancelLabel="Annulla"
          isDestructive={true}
          onConfirm={() => {
            setIsConfirmOpen(false);
            onDelete();
          }}
          onCancel={() => setIsConfirmOpen(false)}
        />
      )}
    </>
  );
}
