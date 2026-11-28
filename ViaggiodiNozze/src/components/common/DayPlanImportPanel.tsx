import { useState, useRef } from 'react';
import { auth } from '../../firebase';
import { getActiveTripId, idbGetAll, STORES } from '../../storage/indexedDB';
import { storageService } from '../../storage/storageService';
import { getAuthorizedLocalEditorRole } from '../../utils/useAuthIdentity';
import { parseDayPlan, matchingStops, isProtectedStop, type DayPlan, type DayPlanRow } from '../../utils/dayPlanImport';
import type { Tappa } from '../../types';

type Choice = { row: DayPlanRow; before?: Tappa; enabled: boolean; reason?: string };
type Preview = { plan: DayPlan; tripId: string; uid: string; snapshot: Tappa[]; choices: Choice[]; other: string[] };
type Other = { id: string; title?: string; name?: string; nome?: string; titolo?: string; data?: string; date?: string; dayId?: string; departureDate?: string; checkIn?: string };
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export default function DayPlanImportPanel({text, onText}: {text: string; onText: (text:string)=>void}) {
  const [preview, setPreview] = useState<Preview|null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const review = async (raw: string) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(''); setPreview(null);
    try {
      const plan = parseDayPlan(raw);
      const tripId = getActiveTripId();
      const uid = auth.currentUser?.uid;
      if (!uid || !getAuthorizedLocalEditorRole(tripId,uid)) throw new Error('Apri il viaggio come Owner o Copilota verificato.');
      const [stops, ...otherGroups] = await Promise.all([
        storageService.getTappe(), ...[STORES.ALLOGGI, STORES.TRASPORTI, STORES.ATTIVITA, STORES.RISTORANTI].map(store=>idbGetAll<Other>(store))
      ]);
      if (getActiveTripId() !== tripId || auth.currentUser?.uid !== uid) throw new Error('Sessione cambiata.');
      const snapshot = (stops as Tappa[]).filter(t => (t.data || t.date) === plan.date);
      const other = (otherGroups as Other[][]).flat().filter(t => [t.data,t.date,t.departureDate,t.checkIn].some(d=>d?.slice(0,10)===plan.date) || t.dayId==='day_'+plan.date)
        .map(t=>t.title||t.name||t.nome||t.titolo||'Prenotazione esistente');
      const choices: Choice[] = plan.rows.map(row=>{
        const matches=matchingStops(row,snapshot);
        if(matches.length>1) return {row,enabled:false,reason:'Più tappe corrispondenti: modifica manuale'};
        if(matches.length===1) {
          const before=matches[0];
          if(isProtectedStop(before)) return {row,enabled:false,reason:'Tappa protetta'};
          if((before.orario||before.time)===row.time) return {row,enabled:false,reason:'Già presente'};
          return {row,before,enabled:true};
        }
        const title=normalize(row.title);
        if(other.some(x=>{const v=normalize(x);return v.length>3&&(v===title||title.includes(v)||v.includes(title));})) return {row,enabled:false,reason:'Possibile prenotazione già presente'};
        return {row,enabled:true};
      });
      setPreview({plan,tripId,uid,snapshot,choices,other});
    } catch(e) { setMessage(e instanceof Error?e.message:'Impossibile leggere la proposta.'); }
    finally {locked.current=false;setBusy(false);}
  };
  const apply = async () => {
    if (!preview || locked.current) return;
    locked.current=true; setBusy(true);setMessage('');
    try {
      const selected=preview.choices.filter(c=>c.enabled&&!c.reason);
      const count=await storageService.applyDayPlan(preview.tripId,preview.uid,preview.plan.date,selected,preview.snapshot);
      setPreview(null); onText(''); setMessage(count+' tappe salvate sul dispositivo. La sincronizzazione segue il normale flusso.');
    } catch(e) {setMessage(e instanceof Error?e.message:'Salvataggio non completato.');}
    finally{locked.current=false;setBusy(false);}
  };
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-slate-800" data-testid="day-plan-import">
    <p className="text-xs font-extrabold">Importa programma da ChatGPT (senza AI)</p>
    <p className="text-[11px] text-slate-600">Copia il programma HOUNIGO-DAY/1 dalla chat. Incollalo nel campo sopra oppure usa il pulsante. Nessuna prenotazione viene cancellata.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} className="rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-bold" onClick={async()=>{try{const raw=await navigator.clipboard.readText();onText(raw);await review(raw);}catch{setMessage('Incolla manualmente nel campo sopra e premi Anteprima.');}}}>Incolla e anteprima</button>
      <button type="button" disabled={busy||!text.trim()} onClick={()=>void review(text)} className="rounded-lg bg-slate-800 text-white px-3 py-2 text-xs font-bold disabled:opacity-40">Anteprima</button>
    </div>
    {message&&<p role="status" className="text-xs font-semibold">{message}</p>}
    {preview&&<div className="space-y-2">
      <p className="text-xs font-bold">{preview.plan.date} · {preview.choices.filter(c=>c.enabled&&!c.reason).length} modifiche selezionate</p>
      {preview.choices.map((c,i)=><label key={i} className="flex gap-2 items-start rounded-lg bg-white border border-slate-200 p-2 text-xs">
        <input type="checkbox" checked={c.enabled} disabled={busy||Boolean(c.reason)} onChange={e=>setPreview(p=>p?{...p,choices:p.choices.map((v,j)=>j===i?{...v,enabled:e.target.checked}:v)}:p)} />
        <span><strong>{c.before?(c.before.orario||c.before.time||'—')+' → ':''}{c.row.time} · {c.row.title}</strong><span className="block text-slate-500">{c.reason||(c.before?'Aggiorna solo orario':'Nuova tappa')}</span></span>
      </label>)}
      <details className="text-xs"><summary>Voci esistenti preservate</summary><ul className="list-disc pl-4">{[...preview.snapshot.map(t=>(t.orario||t.time||'')+' '+t.titolo),...preview.other].map((v,i)=><li key={i}>{v}</li>)}</ul></details>
      <p className="text-[11px]">Le tappe precedenti non corrispondenti restano nel viaggio; puoi rimuoverle manualmente dopo la verifica.</p>
      <div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>setPreview(null)} className="rounded-lg border px-3 py-2 text-xs font-bold">Annulla</button><button type="button" disabled={busy||!preview.choices.some(c=>c.enabled&&!c.reason)} onClick={()=>void apply()} className="flex-1 rounded-lg bg-[#FF6B5F] text-white px-3 py-2 text-xs font-bold disabled:opacity-40">Applica modifiche</button></div>
    </div>}
  </div>;
}
