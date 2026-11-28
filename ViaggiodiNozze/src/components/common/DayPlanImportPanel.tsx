import { useState, useRef } from 'react';
import { auth } from '../../firebase';
import { getActiveTripId } from '../../storage/indexedDB';
import { storageService } from '../../storage/storageService';
import { getAuthorizedLocalEditorRole } from '../../utils/useAuthIdentity';
import { parseDayPlan, dayPlanCategory, type DayPlan } from '../../utils/dayPlanImport';
import type { TypedDayPreview } from '../../utils/typedDayPlan';

type Preview = { raw: string; plan: DayPlan; tripId: string; uid: string; result: TypedDayPreview };
export default function DayPlanImportPanel({text,onText}:{text:string;onText:(text:string)=>void}) {
  const [preview,setPreview]=useState<Preview|null>(null);
  const [selected,setSelected]=useState<number[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const locked=useRef(false);
  const review=async(raw:string)=>{
    if(locked.current)return;
    locked.current=true;setBusy(true);setMessage('');setPreview(null);setSelected([]);
    try {
      const plan=parseDayPlan(raw);
      const tripId=getActiveTripId(),uid=auth.currentUser?.uid;
      if(!uid||!getAuthorizedLocalEditorRole(tripId,uid))throw new Error('Apri il viaggio come Owner o Copilota verificato.');
      const result=await storageService.previewTypedDayPlan(tripId,uid,plan);
      setPreview({raw,plan,tripId,uid,result});
      setSelected(result.choices.flatMap((c,i)=>c.enabled&&c.action!=='skip'?[i]:[]));
    }catch(e){setMessage(e instanceof Error?e.message:'Impossibile leggere la proposta.');}
    finally{locked.current=false;setBusy(false);}
  };
  const apply=async()=>{
    if(!preview||locked.current||preview.raw!==text||!selected.length)return;
    locked.current=true;setBusy(true);setMessage('');
    try{
      const count=await storageService.applyTypedDayPlan(preview.tripId,preview.uid,preview.plan,preview.result,selected);
      setPreview(null);setSelected([]);onText('');setMessage(count+' voci salvate sul dispositivo. La sincronizzazione segue il normale flusso.');
    }catch(e){setMessage(e instanceof Error?e.message:'Salvataggio non completato.');}
    finally{locked.current=false;setBusy(false);}
  };
  const categoryLabel=(category:string)=>category==='ristorante'?'Ristorante':category==='metro'?'Metro':'Tappa';
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-slate-800" data-testid="day-plan-import">
    <p className="text-xs font-extrabold">Importa programma da ChatGPT (senza AI)</p>
    <p className="text-[11px] text-slate-600">Copia il programma HOUNIGO-DAY/1 o /2. Le conversioni delle vecchie tappe richiedono selezione esplicita. Le prenotazioni non vengono cancellate.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} className="rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-bold" onClick={async()=>{try{const raw=await navigator.clipboard.readText();onText(raw);await review(raw);}catch{setMessage('Incolla manualmente nel campo sopra e premi Anteprima.');}}}>Incolla e anteprima</button>
      <button type="button" disabled={busy||!text.trim()} onClick={()=>void review(text)} className="rounded-lg bg-slate-800 text-white px-3 py-2 text-xs font-bold disabled:opacity-40">Anteprima</button>
    </div>
    {message&&<p role="status" className="text-xs font-semibold">{message}</p>}
    {preview&&<div className="space-y-2">
      <p className="text-xs font-bold">{preview.plan.date} · {selected.length} modifiche selezionate</p>
      {preview.raw!==text&&<p className="text-xs text-amber-800">Il testo è cambiato: ricalcola l’anteprima.</p>}
      {preview.result.choices.map((c,i)=><label key={i} className="flex gap-2 items-start rounded-lg bg-white border border-slate-200 p-2 text-xs">
        <input type="checkbox" checked={selected.includes(i)} disabled={busy||c.action==='skip'||preview.raw!==text} onChange={e=>setSelected(prev=>e.target.checked?[...prev,i]:prev.filter(v=>v!==i))}/>
        <span className="min-w-0 flex-1"><strong>{c.beforeTime?c.beforeTime+' → ':''}{c.row.time} · {c.row.title}</strong>
          <span className="block text-slate-500">{categoryLabel(dayPlanCategory(c.row))} · {c.reason||(c.action==='convert'?'Sostituisci tappa precedente':c.action==='update'?'Aggiorna orario':'Nuova card')}</span>
          {c.row.from&&<span className="block">{c.row.from} → {c.row.to} · arrivo {c.row.endTime}</span>}
          {c.warning&&<span className="block font-semibold text-amber-800">{c.warning}</span>}
        </span>
      </label>)}
      {preview.result.retained.length>0&&<details className="text-xs" open><summary className="font-bold">Voci non abbinate: verifica se ancora previste</summary><ul className="list-disc pl-4">{preview.result.retained.map((v,i)=><li key={i}>{v}</li>)}</ul><p className="mt-1">Queste voci restano intatte. Rimuovi manualmente solo quelle non più previste, dopo aver verificato eventuali prenotazioni e spese.</p></details>}
      <div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>{setPreview(null);setSelected([]);}} className="rounded-lg border px-3 py-2 text-xs font-bold">Annulla</button><button type="button" disabled={busy||!selected.length||preview.raw!==text} onClick={()=>void apply()} className="flex-1 rounded-lg bg-[#FF6B5F] text-white px-3 py-2 text-xs font-bold disabled:opacity-40">Applica modifiche</button></div>
    </div>}
  </div>;
}
