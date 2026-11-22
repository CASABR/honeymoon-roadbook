import { Eye, ExternalLink, FileText, Trash2 } from 'lucide-react';
import type { TransportAttachment } from '../../types';
import { formatFileSize } from '../../utils/fileAttachment';

interface AttachmentListRowProps {
  attachment: TransportAttachment;
  onView: () => void;
  onOpenExternal?: () => void;
  onDelete?: () => void;
  accentClassName?: string;
}

/**
 * Riga compatta e uniforme per file allegati (immagini, QR, PDF) nelle modali allegati.
 */
export default function AttachmentListRow({
  attachment,
  onView,
  onOpenExternal,
  onDelete,
  accentClassName = 'text-sky-700 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-900/60',
}: AttachmentListRowProps) {
  const isPdf =
    attachment.type === 'pdf' ||
    attachment.name?.toLowerCase().endsWith('.pdf') ||
    attachment.dataUrl?.startsWith('data:application/pdf');

  return (
    <div className="flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
      <button
        type="button"
        onClick={isPdf && onOpenExternal ? onOpenExternal : onView}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer group"
        title={isPdf && onOpenExternal ? `Apri ${attachment.name}` : `Visualizza ${attachment.name}`}
      >
        <div className="w-11 h-11 rounded-lg shrink-0 overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
          {!isPdf && attachment.dataUrl ? (
            <img
              src={attachment.dataUrl}
              alt={attachment.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-rose-50 dark:bg-rose-950/40 flex flex-col items-center justify-center text-rose-600 dark:text-rose-400">
              <FileText className="w-4 h-4" />
              <span className="text-[9px] font-mono font-bold uppercase leading-none mt-0.5">
                PDF
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate leading-snug group-hover:text-slate-700 dark:group-hover:text-slate-200">
            {attachment.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {formatFileSize(attachment.size)}
            </span>
            <span className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/50">
              Offline
            </span>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onView}
          className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${accentClassName}`}
          title="Visualizza a schermo intero"
          aria-label={`Visualizza ${attachment.name}`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden xs:inline sm:inline">Visualizza</span>
        </button>

        {onOpenExternal && (
          <button
            type="button"
            onClick={onOpenExternal}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Apri in nuova scheda"
            aria-label={`Apri ${attachment.name}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            title="Elimina allegato"
            aria-label={`Elimina ${attachment.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
