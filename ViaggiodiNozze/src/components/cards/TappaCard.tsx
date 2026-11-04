import type { Tappa } from '../../types';
import { useState, useEffect } from 'react';
import UniversalCopilotaModal from '../modals/UniversalCopilotaModal';
import { storageService } from '../../storage/storageService';
import { resolveMapUrl } from '../../utils/mapsHelper';
import { formatDateIT } from '../../utils/tripDates';
import OpeningHoursBadge from '../common/OpeningHoursBadge';

interface TappaCardProps {
  tappa: Tappa;
  onEdit: () => void;
  onDelete?: () => void;
  onDetail?: () => void;
  onUpdate?: (updated: Tappa) => void;
  variant?: 'compact' | 'full';
}

export default function TappaCard({ tappa, onEdit, onDetail, onUpdate, variant = 'full' }: TappaCardProps) {
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const initialCopilot = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
  const [copilotNotes, setCopilotNotes] = useState<string>(initialCopilot);

  useEffect(() => {
    const nextNotes = (tappa as any).noteCopilota || (tappa as any).nota || (tappa as any).notes || '';
    setCopilotNotes(nextNotes);
  }, [tappa]);

  const hasCopilotNotes = Boolean(copilotNotes.trim());
  const orario = tappa.orario || (tappa as any).time;
  const isCompact = variant === 'compact';

  const mapTarget = tappa.mapsUrl || tappa.indirizzo || tappa.titolo;
  const usefulNote = (tappa.nota || (tappa as any).notes || '').trim();
  const hasSubcategory = Boolean(tappa.sottocategoria && tappa.sottocategoria.trim() && tappa.sottocategoria !== 'Tappa');

  const headerTimeSummary = orario
    ? `Ore ${orario}${tappa.timeStatus === 'indicativo' ? ' · indicativo' : ''}`
    : (!isCompact && tappa.data ? formatDateIT(tappa.data) : '');

  return (
    <div
      onClick={onDetail || onEdit}
      className="hounigo-ds-card hounigo-panel cursor-pointer"
    >
      {/* 1. HEADER: CATEGORIA ROSA, SOTTOCATEGORIA FACOLTATIVA E ORARIO CONFERMATO/INDICATIVO */}
      <div className="hounigo-ds-card-header hounigo-ds-header-tappa">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider min-w-0">
            <span aria-hidden="true">📍</span>
            <span>Tappa</span>
            {hasSubcategory && (
              <span className="font-bold normal-case tracking-normal opacity-90">
                · {tappa.sottocategoria}
              </span>
            )}
          </div>

          {headerTimeSummary && (
            <span className="font-mono text-xs sm:text-[13px] font-extrabold tabular-nums shrink-0">
              {headerTimeSummary}
            </span>
          )}
        </div>
      </div>

      {/* 2. BODY: TITOLO, LUOGO ED EVENTUALI INFORMAZIONI UTILI ESISTENTI */}
      <div className="hounigo-ds-card-body">
        <h3 className="font-extrabold text-base sm:text-[17px] leading-snug tracking-tight text-slate-900 dark:text-white break-words">
          {tappa.titolo}
        </h3>

        {tappa.indirizzo && (
          <p className="text-xs sm:text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-200 flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5" aria-hidden="true">📍</span>
            <span className="break-words">{tappa.indirizzo}</span>
          </p>
        )}

        {tappa.openingHours && tappa.openingHours.verifiedAt && tappa.openingHours.status !== 'unverified' && (
          <OpeningHoursBadge info={tappa.openingHours} date={tappa.data || tappa.date} time={orario} />
        )}

        {usefulNote && (
          <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
            {usefulNote}
          </p>
        )}
      </div>

      {/* 3. FOOTER: AZIONI EFFETTIVAMENTE DISPONIBILI */}
      <div className="hounigo-ds-card-footer">
        <div className="flex items-center gap-2">
          {tappa.bookingCode && (
            <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
              🎟️ {tappa.bookingCode}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {!orario && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="hounigo-ds-action-btn"
              title="Inserisci orario per questa tappa"
            >
              <span>⏰</span>
              <span>{tappa.sottocategoria === 'Sosta fotografica' ? 'Orario libero' : '+ Orario'}</span>
            </button>
          )}

          {hasCopilotNotes && copilotNotes.trim() !== usefulNote && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
              className="hounigo-ds-action-btn"
              title="Note operative"
            >
              <span>🧭</span>
              <span>Note</span>
            </button>
          )}

          {mapTarget && (
            <a
              href={resolveMapUrl(mapTarget)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hounigo-ds-action-btn"
              title="Apri su Google Maps"
            >
              <span>📍</span>
              <span>Maps</span>
            </a>
          )}
        </div>
      </div>

      <UniversalCopilotaModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        title={tappa.titolo || 'Dettaglio'}
        noteCopilota={copilotNotes}
        canEdit={true}
        onSave={async (notes) => {
          try {
            const clean = notes.trim();
            setCopilotNotes(clean);
            const updated = { ...tappa, noteCopilota: clean, updatedAt: Date.now() } as any;
            await storageService.saveTappa(updated);
            if (typeof onUpdate === 'function') onUpdate(updated);
            window.dispatchEvent(new CustomEvent('roadbook_data_mutated', { detail: { action: 'update' } }));
            setIsCopilotOpen(false);
          } catch (e) { console.error(e); }
        }}
      />
    </div>
  );
}
