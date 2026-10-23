import { useEffect, useState } from 'react';
import { storageService } from '../../storage/storageService';
import { useDeviceRole } from '../../utils/useDeviceRole';

type EmergencyKind = 'Emergenza locale' | 'Ambasciata o consolato' | 'Contatto personale' | 'Struttura sanitaria' | 'Altro';
interface EmergencyEntry { id: string; kind: EmergencyKind; title: string; phone?: string; address?: string; notes?: string; link?: string; }
interface ChecklistItem { id: string; text: string; done: boolean; }

const EMERGENCIES_KEY = 'emergency_directory_v1';
const TOOLKIT_KEY = 'travel_toolkit_v1';
const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: 'documents', text: 'Controllare documenti e relative scadenze', done: false },
  { id: 'contacts', text: 'Salvare contatti di emergenza e assistenza', done: false },
  { id: 'payments', text: 'Verificare metodi di pagamento disponibili', done: false },
  { id: 'attachments', text: 'Aggiungere voucher e documenti necessari', done: false }
];

function BackHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <header className="flex items-start gap-3 px-1 mb-5"><button type="button" onClick={onBack} className="mt-0.5 w-8 h-8 rounded-full bg-slate-200/70 text-slate-700 font-bold">‹</button><div><h1 className="text-xl font-extrabold text-slate-900">{title}</h1><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div></header>;
}

export function EmergenzeView({ onBack }: { onBack: () => void }) {
  const { canEdit } = useDeviceRole();
  const [entries, setEntries] = useState<EmergencyEntry[]>([]);
  const [editing, setEditing] = useState<EmergencyEntry | null>(null);
  const [draft, setDraft] = useState<Partial<EmergencyEntry>>({ kind: 'Emergenza locale' });
  const save = async (next: EmergencyEntry[]) => { await storageService.saveSetting(EMERGENCIES_KEY, next); setEntries(next); };
  useEffect(() => { storageService.getSetting<EmergencyEntry[]>(EMERGENCIES_KEY).then(value => setEntries(Array.isArray(value) ? value : [])); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!draft.title?.trim()) return;
    const entry: EmergencyEntry = { id: editing?.id || crypto.randomUUID(), kind: (draft.kind as EmergencyKind) || 'Altro', title: draft.title.trim(), phone: draft.phone?.trim(), address: draft.address?.trim(), notes: draft.notes?.trim(), link: draft.link?.trim() };
    await save(editing ? entries.map(item => item.id === entry.id ? entry : item) : [...entries, entry]); setEditing(null); setDraft({ kind: 'Emergenza locale' });
  };
  return <div className="pb-12"><BackHeader title="Emergenze" subtitle="Contatti personali e riferimenti del viaggio." onBack={onBack} />
    {canEdit && <form onSubmit={submit} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 mb-4">
      <h2 className="font-bold text-slate-900 text-sm">{editing ? 'Modifica contatto' : 'Aggiungi contatto'}</h2>
      <select value={draft.kind || 'Altro'} onChange={event => setDraft({ ...draft, kind: event.target.value as EmergencyKind })} className="w-full rounded-xl border border-slate-200 p-2 text-sm">{(['Emergenza locale', 'Ambasciata o consolato', 'Contatto personale', 'Struttura sanitaria', 'Altro'] as EmergencyKind[]).map(kind => <option key={kind}>{kind}</option>)}</select>
      <input required value={draft.title || ''} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Nome o servizio" className="w-full rounded-xl border border-slate-200 p-2 text-sm" />
      <input value={draft.phone || ''} onChange={event => setDraft({ ...draft, phone: event.target.value })} placeholder="Telefono" className="w-full rounded-xl border border-slate-200 p-2 text-sm" />
      <input value={draft.address || ''} onChange={event => setDraft({ ...draft, address: event.target.value })} placeholder="Indirizzo" className="w-full rounded-xl border border-slate-200 p-2 text-sm" />
      <input value={draft.link || ''} onChange={event => setDraft({ ...draft, link: event.target.value })} placeholder="Link utile" className="w-full rounded-xl border border-slate-200 p-2 text-sm" />
      <textarea value={draft.notes || ''} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="Note" className="w-full rounded-xl border border-slate-200 p-2 text-sm" rows={2} />
      <div className="flex gap-2"><button className="rounded-xl bg-[#FF6B5F] px-4 py-2 text-sm font-bold text-white">Salva</button>{editing && <button type="button" onClick={() => { setEditing(null); setDraft({ kind: 'Emergenza locale' }); }} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold">Annulla</button>}</div>
    </form>}
    <div className="space-y-3">{entries.length === 0 ? <p className="rounded-3xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nessun contatto salvato per questo viaggio.</p> : entries.map(entry => <article key={entry.id} className="rounded-3xl border border-slate-200 bg-white p-4 break-words"><p className="text-[10px] font-bold uppercase tracking-wide text-[#FF6B5F]">{entry.kind}</p><h2 className="font-bold text-slate-900 mt-1">{entry.title}</h2>{entry.phone && <a className="block text-sm text-slate-700 mt-1" href={`tel:${entry.phone}`}>{entry.phone}</a>}{entry.address && <p className="text-sm text-slate-600 mt-1">{entry.address}</p>}{entry.notes && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{entry.notes}</p>}{entry.link && <a className="block text-sm text-[#172033] underline mt-2 break-all" href={entry.link} target="_blank" rel="noreferrer">Apri link</a>}{canEdit && <div className="flex gap-3 mt-3 text-sm font-bold"><button onClick={() => { setEditing(entry); setDraft(entry); }}>Modifica</button><button className="text-rose-600" onClick={() => save(entries.filter(item => item.id !== entry.id))}>Elimina</button></div>}</article>)}</div>
  </div>;
}

export function TravelToolkitView({ onBack }: { onBack: () => void }) {
  const { canEdit } = useDeviceRole(); const [items, setItems] = useState<ChecklistItem[]>([]); const [newText, setNewText] = useState('');
  const save = async (next: ChecklistItem[]) => { await storageService.saveSetting(TOOLKIT_KEY, next); setItems(next); };
  useEffect(() => { storageService.getSetting<ChecklistItem[]>(TOOLKIT_KEY).then(value => setItems(Array.isArray(value) && value.length ? value : DEFAULT_CHECKLIST)); }, []);
  return <div className="pb-12"><BackHeader title="Travel Toolkit" subtitle="Preparazione essenziale, senza servizi o promesse aggiuntive." onBack={onBack} />
    <section className="rounded-3xl border border-slate-200 bg-white p-4 space-y-3"><h2 className="font-bold text-slate-900">Checklist pre-partenza</h2>{items.map(item => <div key={item.id} className="flex items-center gap-3 min-w-0"><input aria-label={item.text} type="checkbox" checked={item.done} disabled={!canEdit} onChange={() => save(items.map(value => value.id === item.id ? { ...value, done: !value.done } : value))} /><span className={`flex-1 text-sm break-words ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.text}</span>{canEdit && <button className="text-xs font-bold text-rose-600" onClick={() => save(items.filter(value => value.id !== item.id))}>Elimina</button>}</div>)}{canEdit && <form onSubmit={event => { event.preventDefault(); if (!newText.trim()) return; save([...items, { id: crypto.randomUUID(), text: newText.trim(), done: false }]); setNewText(''); }} className="flex gap-2 pt-2"><input value={newText} onChange={event => setNewText(event.target.value)} placeholder="Aggiungi voce" className="min-w-0 flex-1 rounded-xl border border-slate-200 p-2 text-sm" /><button className="rounded-xl bg-[#172033] px-3 text-sm font-bold text-white">Aggiungi</button></form>}</section>
    <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4"><h2 className="font-bold text-slate-900">Dentro Hounigo</h2><ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600"><li>Salva itinerario, documenti, spese e contatti del viaggio nelle rispettive sezioni.</li><li>Attendi la conferma di salvataggio prima di chiudere l'app quando sei connesso.</li><li>Per allegati e modifiche condivise, verifica che il dispositivo sia online e autorizzato.</li></ul></section>
    <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4"><h2 className="font-bold text-slate-900">Strumenti utili</h2><ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600"><li>eSIM: confronta copertura, durata e condizioni dai siti ufficiali.</li><li>Assicurazioni: confronta massimali, esclusioni e assistenza prima dell'acquisto.</li><li>Pagamenti: verifica costi di cambio, limiti e carte di riserva.</li><li><a className="underline text-[#172033]" href="https://europa.eu/youreurope/citizens/travel/passenger-rights/index_en.htm" target="_blank" rel="noreferrer">Diritti dei passeggeri nell'Unione europea</a>.</li></ul></section>
  </div>;
}
