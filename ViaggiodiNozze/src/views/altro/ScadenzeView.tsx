import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Clock3, ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/common/Modal';
import { storageService } from '../../storage/storageService';
import type { Scadenza, StatoScadenza, TipoCollegamentoScadenza } from '../../types';
import { useDeviceRole } from '../../utils/useDeviceRole';
import { getEffectiveDeadlineStatus, isDeadlineReminderActive } from '../../utils/deadlines';
import TimePickerInput from '../../components/common/TimePickerInput';

interface ScadenzeViewProps {
  onBack?: () => void;
}

interface LinkedCardOption {
  value: string;
  type: TipoCollegamentoScadenza;
  id: string;
  label: string;
}

const STATUS_LABELS: Record<StatoScadenza, string> = {
  da_fare: 'Da fare',
  in_attesa: 'In attesa',
  completata: 'Completata',
  scaduta: 'Scaduta'
};

const REMINDER_OPTIONS = [
  { value: 0, label: 'Alla scadenza' },
  { value: 60, label: '1 ora prima' },
  { value: 1440, label: '1 giorno prima' },
  { value: 2880, label: '2 giorni prima' },
  { value: 10080, label: '1 settimana prima' }
];

const EMPTY_FORM = {
  title: '',
  content: '',
  dueDate: '',
  dueTime: '',
  timeZone: '',
  dateVerified: false,
  status: 'da_fare' as StatoScadenza,
  reminderMinutesBefore: 1440,
  linkedCard: '',
  externalUrl: '',
  copilotNotes: ''
};

function formatDeadline(deadline: Scadenza): string {
  if (!deadline.dueDate) return 'Data da definire';
  const date = new Date(`${deadline.dueDate}T12:00:00`);
  const formatted = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  return deadline.dueTime ? `${formatted}, ${deadline.dueTime}` : formatted;
}

function normalizedExternalUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function ScadenzeView({ onBack }: ScadenzeViewProps) {
  const { canEdit } = useDeviceRole();
  const [deadlines, setDeadlines] = useState<Scadenza[]>([]);
  const [linkedCards, setLinkedCards] = useState<LinkedCardOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Scadenza | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'attive' | 'tutte'>('attive');

  const loadData = useCallback(async () => {
    const [items, activities, accommodations, transports, stops] = await Promise.all([
      storageService.getScadenze(),
      storageService.getActivities(),
      storageService.getAccommodations(),
      storageService.getTransports(),
      storageService.getTappe()
    ]);
    setDeadlines(items);
    setLinkedCards([
      ...activities.map(item => ({ value: `attivita:${item.id}`, type: 'attivita' as const, id: item.id, label: `Attività · ${item.title}` })),
      ...accommodations.map(item => ({ value: `alloggio:${item.id}`, type: 'alloggio' as const, id: item.id, label: `Alloggio · ${item.name}` })),
      ...transports.map(item => ({ value: `trasporto:${item.id}`, type: 'trasporto' as const, id: item.id, label: `Trasporto · ${item.departureLocation} → ${item.arrivalLocation}` })),
      ...stops.map(item => ({ value: `tappa:${item.id}`, type: 'tappa' as const, id: item.id, label: `Tappa · ${item.titolo}` }))
    ].sort((left, right) => left.label.localeCompare(right.label, 'it')));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const handleMutation = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.entityType || detail.entityType === 'note') loadData();
    };
    window.addEventListener('roadbook_data_mutated', handleMutation);
    return () => window.removeEventListener('roadbook_data_mutated', handleMutation);
  }, [loadData]);

  const visibleDeadlines = useMemo(() => deadlines.filter(item => (
    filter === 'tutte' || getEffectiveDeadlineStatus(item) !== 'completata'
  )), [deadlines, filter]);

  const reminderCount = useMemo(() => deadlines.filter(item => isDeadlineReminderActive(item)).length, [deadlines]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (deadline: Scadenza) => {
    setEditing(deadline);
    setForm({
      title: deadline.title,
      content: deadline.content,
      dueDate: deadline.dueDate || '',
      dueTime: deadline.dueTime || '',
      timeZone: deadline.timeZone || '',
      dateVerified: deadline.dateVerified,
      status: getEffectiveDeadlineStatus(deadline) === 'scaduta' ? 'da_fare' : deadline.status,
      reminderMinutesBefore: deadline.reminderMinutesBefore,
      linkedCard: deadline.linkedEntityType && deadline.linkedEntityId ? `${deadline.linkedEntityType}:${deadline.linkedEntityId}` : '',
      externalUrl: deadline.externalUrl || '',
      copilotNotes: deadline.copilotNotes || ''
    });
    setIsModalOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    const linked = linkedCards.find(item => item.value === form.linkedCard);
    const externalUrl = normalizedExternalUrl(form.externalUrl);
    if (form.externalUrl && !externalUrl) {
      window.alert('Inserisci un link valido che inizi con http:// o https://.');
      return;
    }
    if (form.timeZone) {
      try {
        new Intl.DateTimeFormat('it-IT', { timeZone: form.timeZone }).format(new Date());
      } catch {
        window.alert('Inserisci un fuso IANA valido, ad esempio Europe/Rome.');
        return;
      }
    }
    setSaving(true);
    try {
      await storageService.saveScadenza({
        id: editing?.id || `scadenza_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        recordKind: 'scadenza',
        title: form.title.trim(),
        content: form.content.trim(),
        color: 'rose',
        dueDate: form.dueDate || undefined,
        dueTime: form.dueDate && form.dueTime ? form.dueTime : undefined,
        timeZone: form.dueDate && form.dueTime && form.timeZone ? form.timeZone.trim() : undefined,
        dateVerified: Boolean(form.dueDate && form.dateVerified),
        status: form.status,
        reminderMinutesBefore: form.dueDate ? form.reminderMinutesBefore : 0,
        linkedEntityType: linked?.type,
        linkedEntityId: linked?.id,
        linkedEntityLabel: linked?.label.replace(/^.+? · /, ''),
        externalUrl: externalUrl || undefined,
        copilotNotes: form.copilotNotes.trim() || undefined,
        createdAt: editing?.createdAt || Date.now(),
        updatedAt: Date.now()
      });
      setIsModalOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const toggleCompleted = async (deadline: Scadenza) => {
    await storageService.saveScadenza({
      ...deadline,
      status: getEffectiveDeadlineStatus(deadline) === 'completata' ? 'da_fare' : 'completata'
    });
  };

  const remove = async (deadline: Scadenza) => {
    if (!window.confirm(`Eliminare “${deadline.title}”?`)) return;
    await storageService.deleteScadenza(deadline.id);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in pb-20">
      <header className="flex items-center justify-between gap-3 mb-5 px-1">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack || (() => window.history.back())} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-300" aria-label="Torna indietro">←</button>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2"><CalendarClock size={21} className="text-[#FF6B5F]" />Scadenze</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Promemoria operativi, separati dall’itinerario</p>
          </div>
        </div>
        {canEdit && <button type="button" onClick={openNew} className="min-h-11 px-3 rounded-xl bg-[#FF6B5F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"><Plus size={17} />Nuova</button>}
      </header>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#172033] p-3 mb-4 flex items-center justify-between gap-3">
        <div><p className="text-xs font-extrabold text-slate-900 dark:text-white">Promemoria nell’app</p><p className="text-[11px] text-slate-500 dark:text-slate-400">Funzionano anche senza notifiche push.</p></div>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${reminderCount ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{reminderCount} attivi</span>
      </div>

      <div className="flex gap-2 mb-4" role="group" aria-label="Filtra scadenze">
        {(['attive', 'tutte'] as const).map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`px-3 py-2 rounded-xl text-xs font-bold ${filter === value ? 'bg-[#172033] text-white dark:bg-white dark:text-[#172033]' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{value === 'attive' ? 'Attive' : 'Tutte'}</button>)}
      </div>

      {loading ? <div className="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" /> : visibleDeadlines.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center"><CalendarClock className="mx-auto text-slate-400 mb-2" /><p className="font-bold text-slate-800 dark:text-white">Nessuna scadenza</p><p className="text-xs text-slate-500 mt-1">Aggiungi solo date confermate o marcate da verificare.</p></div>
      ) : (
        <div className="space-y-3">
          {visibleDeadlines.map(deadline => {
            const status = getEffectiveDeadlineStatus(deadline);
            const externalUrl = normalizedExternalUrl(deadline.externalUrl);
            const reminderActive = isDeadlineReminderActive(deadline);
            return <article key={deadline.id} className={`rounded-2xl border p-4 bg-white dark:bg-[#172033] ${status === 'scaduta' ? 'border-rose-300 dark:border-rose-800' : reminderActive ? 'border-amber-300 dark:border-amber-800' : 'border-slate-200 dark:border-slate-800'}`}>
              <div className="flex items-start gap-3">
                {canEdit && <button type="button" onClick={() => toggleCompleted(deadline)} className={`mt-0.5 w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${status === 'completata' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600 text-transparent'}`} aria-label={status === 'completata' ? 'Riapri scadenza' : 'Completa scadenza'}><Check size={17} /></button>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2"><h2 className={`font-extrabold text-sm text-slate-900 dark:text-white ${status === 'completata' ? 'line-through opacity-60' : ''}`}>{deadline.title}</h2><span className={`shrink-0 text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${status === 'scaduta' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : status === 'completata' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{STATUS_LABELS[status]}</span></div>
                  {deadline.content && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">{deadline.content}</p>}
                  <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-1"><Clock3 size={13} />{formatDeadline(deadline)}</span>{deadline.dueDate && !deadline.dateVerified && <span className="text-amber-700 dark:text-amber-300">Da verificare</span>}{reminderActive && status !== 'scaduta' && <span className="text-amber-700 dark:text-amber-300">Promemoria attivo</span>}</div>
                  {deadline.linkedEntityLabel && <p className="mt-2 text-[11px] text-sky-700 dark:text-sky-300 inline-flex items-center gap-1"><Link2 size={13} />{deadline.linkedEntityLabel}</p>}
                  {deadline.copilotNotes && <div className="mt-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2 text-[11px] text-indigo-800 dark:text-indigo-200"><strong>Nota copilota:</strong> {deadline.copilotNotes}</div>}
                  <div className="flex items-center gap-1 mt-3">
                    {externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer" className="min-h-10 px-2.5 inline-flex items-center gap-1 text-xs font-bold text-sky-700 dark:text-sky-300"><ExternalLink size={15} />Apri link</a>}
                    {canEdit && <><button type="button" onClick={() => openEdit(deadline)} className="min-h-10 px-2.5 inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300"><Pencil size={15} />Modifica</button><button type="button" onClick={() => remove(deadline)} className="min-h-10 px-2.5 inline-flex items-center gap-1 text-xs font-bold text-rose-600"><Trash2 size={15} />Elimina</button></>}
                  </div>
                </div>
              </div>
            </article>;
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editing ? 'Modifica scadenza' : 'Nuova scadenza'} accentVariant="rose">
        <div className="space-y-4">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Titolo<input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} className="mt-1 w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" required /></label>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Descrizione<textarea value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm" /></label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-700 dark:text-slate-200">Data<input type="date" value={form.dueDate} onChange={event => setForm(current => ({ ...current, dueDate: event.target.value, dateVerified: false }))} className="mt-1 w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm" /></label><label className="text-xs font-bold text-slate-700 dark:text-slate-200">Ora (facoltativa)<span className="mt-1 block"><TimePickerInput value={form.dueTime} disabled={!form.dueDate} onChange={dueTime => setForm(current => ({ ...current, dueTime }))} ariaLabel="Ora scadenza" /></span></label></div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Fuso IANA per push (facoltativo)<input value={form.timeZone} disabled={!form.dueTime} onChange={event => setForm(current => ({ ...current, timeZone: event.target.value }))} placeholder="Europe/Rome" className="mt-1 w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm disabled:opacity-50" /><span className="mt-1 block font-medium text-slate-500 dark:text-slate-400">La push parte solo con data, ora, fuso e verifica confermati.</span></label>
          {form.dueDate && <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={form.dateVerified} onChange={event => setForm(current => ({ ...current, dateVerified: event.target.checked }))} className="w-4 h-4" />Questa data è stata verificata</label>}
          <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-700 dark:text-slate-200">Stato<select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as StatoScadenza }))} className="mt-1 w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"><option value="da_fare">Da fare</option><option value="in_attesa">In attesa</option><option value="completata">Completata</option></select></label><label className="text-xs font-bold text-slate-700 dark:text-slate-200">Promemoria<select value={form.reminderMinutesBefore} disabled={!form.dueDate} onChange={event => setForm(current => ({ ...current, reminderMinutesBefore: Number(event.target.value) }))} className="mt-1 w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm disabled:opacity-50">{REMINDER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Collega a una card (facoltativo)<select value={form.linkedCard} onChange={event => setForm(current => ({ ...current, linkedCard: event.target.value }))} className="mt-1 w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"><option value="">Nessuna card</option>{linkedCards.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Sito o app esterna<input type="url" value={form.externalUrl} onChange={event => setForm(current => ({ ...current, externalUrl: event.target.value }))} placeholder="https://…" className="mt-1 w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" /></label>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Note copilota<textarea value={form.copilotNotes} onChange={event => setForm(current => ({ ...current, copilotNotes: event.target.value }))} rows={2} className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm" /></label>
          <button type="button" onClick={save} disabled={saving || !form.title.trim()} className="w-full min-h-12 rounded-xl bg-[#FF6B5F] text-white font-extrabold text-sm disabled:opacity-50">{saving ? 'Salvataggio…' : 'Salva scadenza'}</button>
        </div>
      </Modal>
    </div>
  );
}
