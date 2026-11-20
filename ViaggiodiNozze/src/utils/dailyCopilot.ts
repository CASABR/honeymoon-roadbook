import type { ColorNota, NotaViaggio } from '../types';

export const DAILY_COPILOT_NOTE_ID_PREFIX = 'copilota_';
export const DAILY_COPILOT_NOTE_TITLE = 'Note Copilota di Giornata';

export interface ResolvedDailyCopilotNote {
  date: string;
  noteId: string | null;
  note: NotaViaggio | null;
  text: string;
  hasAssignment: boolean;
}

type DailyNotaRecord = NotaViaggio & {
  date?: string;
  data?: string;
  type?: string;
};

export function normalizeDailyCopilotDate(dateStr?: string | null): string {
  return typeof dateStr === 'string' ? dateStr.trim() : '';
}

export function getDailyCopilotNoteId(dateStr: string): string {
  const cleanDate = normalizeDailyCopilotDate(dateStr);
  return cleanDate ? `${DAILY_COPILOT_NOTE_ID_PREFIX}${cleanDate}` : '';
}

function getRecordDate(note: DailyNotaRecord): string {
  return normalizeDailyCopilotDate(note.date || note.data);
}

function isScadenzaRecord(note: DailyNotaRecord | null | undefined): boolean {
  return Boolean(note && (note as { recordKind?: string }).recordKind === 'scadenza');
}

/**
 * Risolve esclusivamente l'assegnazione/nota copilota associata alla singola data
 * selezionata. Non usa MAI fallback globali di viaggio ne ruoli permanenti.
 */
export function resolveDailyCopilotNoteForDate(
  allNotes: readonly NotaViaggio[],
  selectedDate: string
): ResolvedDailyCopilotNote {
  const targetDate = normalizeDailyCopilotDate(selectedDate);
  if (!targetDate) {
    return { date: '', noteId: null, note: null, text: '', hasAssignment: false };
  }

  const canonicalId = getDailyCopilotNoteId(targetDate);
  const notesList = Array.isArray(allNotes) ? (allNotes as DailyNotaRecord[]) : [];

  // 1. Corrispondenza canonica deterministica: id === "copilota_<YYYY-MM-DD>"
  let matched = notesList.find((note) => {
    if (!note || isScadenzaRecord(note)) return false;
    return note.id === canonicalId;
  }) || null;

  // 2. Retrocompatibilita per eventuali note giornaliere legacy senza prefisso "copilota_"
  //    (esclude categoricamente i record "copilota_*" di altri giorni)
  if (!matched) {
    matched =
      notesList.find((note) => {
        if (!note || isScadenzaRecord(note)) return false;
        if (typeof note.id === 'string' && note.id.startsWith(DAILY_COPILOT_NOTE_ID_PREFIX)) {
          return false;
        }
        return getRecordDate(note) === targetDate && note.title === DAILY_COPILOT_NOTE_TITLE;
      }) || null;
  }

  const rawText = typeof matched?.content === 'string' ? matched.content : '';
  const hasAssignment = rawText.trim().length > 0;

  return {
    date: targetDate,
    noteId: matched?.id || null,
    note: matched,
    text: hasAssignment ? rawText : '',
    hasAssignment,
  };
}

export type DailyCopilotSaveResult =
  | { action: 'noop'; noteId: string }
  | { action: 'save'; noteId: string; payload: DailyNotaRecord };

/**
 * Costruisce il payload di salvataggio strettamente vincolato alla data selezionata,
 * impedendo la riutilizzazione accidentale di ID appartenenti ad altri giorni.
 */
export function buildDailyCopilotSavePayload(params: {
  selectedDate: string;
  notesText: string;
  existingNotes: readonly NotaViaggio[];
  now?: number;
}): DailyCopilotSaveResult {
  const targetDate = normalizeDailyCopilotDate(params.selectedDate);
  const trimmed = (params.notesText || '').trim();
  if (!targetDate) {
    return { action: 'noop', noteId: '' };
  }

  const resolved = resolveDailyCopilotNoteForDate(params.existingNotes, targetDate);
  const noteId = resolved.note?.id || getDailyCopilotNoteId(targetDate);

  if (!resolved.note && !trimmed) {
    return { action: 'noop', noteId };
  }

  const timestamp = typeof params.now === 'number' ? params.now : Date.now();
  const base = resolved.note as DailyNotaRecord | null;
  const fallbackColor: ColorNota = 'sky';

  if (base) {
    return {
      action: 'save',
      noteId,
      payload: {
        ...base,
        id: noteId,
        title: DAILY_COPILOT_NOTE_TITLE,
        content: trimmed,
        color: base.color || fallbackColor,
        date: targetDate,
        recordKind: 'nota',
        createdAt: base.createdAt || timestamp,
        updatedAt: timestamp,
      },
    };
  }

  return {
    action: 'save',
    noteId,
    payload: {
      id: noteId,
      title: DAILY_COPILOT_NOTE_TITLE,
      content: trimmed,
      color: fallbackColor,
      date: targetDate,
      type: 'info',
      recordKind: 'nota',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}
