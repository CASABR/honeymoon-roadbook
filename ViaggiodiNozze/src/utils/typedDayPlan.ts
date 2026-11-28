import type { DayImportSnapshot, DayImportRecord, DayImportOperation } from '../storage/indexedDB';
import type { Tappa } from '../types';
import { dayPlanCategory, dayPlanRestaurantName, dayPlanTitleMatches, canConvertPlainStop, isProtectedStop, isUnstructuredMetro, type DayPlan, type DayPlanRow } from './dayPlanImport';

export type TypedDayChoice = { row: DayPlanRow; action: 'add'|'update'|'convert'|'skip'; enabled: boolean; beforeId?: string; beforeTime?: string; reason?: string; warning?: string };
export type TypedDayPreview = { fingerprint: string; choices: TypedDayChoice[]; retained: string[] };
const stores = ['tappe','ristoranti','trasporti','alloggi','attivita'] as const;
type ItemStore = typeof stores[number];
const titleOf = (r: DayImportRecord) => String(r.titolo || r.nome || r.name || r.title || [r.departureLocation,r.arrivalLocation].filter(Boolean).join(' → ') || 'Voce esistente');
const timeOf = (r: DayImportRecord) => String(r.orario || r.time || r.departureTime || r.checkInTime || '');
function onDate(r: DayImportRecord,date: string): boolean {
  return [r.data,r.date,r.departureDate,r.arrivalDate,r.checkIn,r.checkOut].some(d=>typeof d==='string'&&d.slice(0,10)===date) || r.dayId==='day_'+date;
}
function activeDay(snapshot: DayImportSnapshot, date: string, deleted:(store:string,id:string)=>boolean) {
  const tombstones=new Set(snapshot.settings.filter(r=>r.id.startsWith('tombstone_')).map(r=>r.id));
  return stores.flatMap(store=>snapshot[store].filter(r=>onDate(r,date)&&!tombstones.has('tombstone_'+store+'_'+r.id)&&!deleted(store,r.id)&&r.deleted!==true).map(record=>({store,record})));
}
function linkedDoc(snapshot:DayImportSnapshot,id:string):boolean {
  return snapshot.documenti.some(d=>d.linkedEntityId===id);
}
export function previewTypedDay(plan:DayPlan,snapshot:DayImportSnapshot,deleted:(store:string,id:string)=>boolean=()=>false):TypedDayPreview {
  const active=activeDay(snapshot,plan.date,deleted);
  const matchedIds=new Set<string>();
  const choices=plan.rows.map((row):TypedDayChoice=>{
    const category=dayPlanCategory(row);
    const exactStops=active.filter(x=>x.store==='tappe'&&dayPlanTitleMatches(titleOf(x.record),row.title));
    const targetStore:ItemStore=category==='ristorante'?'ristoranti':category==='metro'?'trasporti':'tappe';
    const target=active.filter(x=>x.store===targetStore&&(category==='metro'
      ? x.record.type==='metro'&&dayPlanTitleMatches(x.record.departureLocation||'',row.from||'')&&dayPlanTitleMatches(x.record.arrivalLocation||'',row.to||'')
      : dayPlanTitleMatches(titleOf(x.record),row.title)));
    const skip=(reason:string):TypedDayChoice=>({row,action:'skip',enabled:false,reason});
    if(isUnstructuredMetro(row)) return skip('Metro: servono partenza, destinazione e orario di arrivo (formato /2).');
    if(target.length>1||exactStops.length>1) return skip('Più voci corrispondenti: verifica manuale.');
    if(target.length===1){
      const existing=target[0].record;matchedIds.add(existing.id);
      if(category!=='tappa') return skip('Categoria già presente: prenotazione preservata.');
      if(isProtectedStop(existing as Tappa)||linkedDoc(snapshot,existing.id))return skip('Tappa protetta.');
      if(timeOf(existing)===row.time)return skip('Già presente.');
      return {row,action:'update',enabled:true,beforeId:existing.id,beforeTime:timeOf(existing)};
    }
    if(category!=='tappa'&&exactStops.length===1){
      const old=exactStops[0].record;
      if(!canConvertPlainStop(old as Tappa)||linkedDoc(snapshot,old.id))return skip('Tappa con dettagli o documenti: conversione manuale.');
      matchedIds.add(old.id);
      return {row,action:'convert',enabled:false,beforeId:old.id,beforeTime:timeOf(old),warning:'Sostituisce la vecchia tappa con una card corretta; seleziona per confermare.'};
    }
    if(category==='tappa'&&active.some(x=>x.store!=='tappe'&&dayPlanTitleMatches(titleOf(x.record),row.title)))return skip('Voce già presente in un’altra categoria.');
    const sameMeal=category==='ristorante'&&active.some(x=>x.store==='ristoranti'&&String(x.record.sottocategoria||'').toLowerCase()===String(row.meal||'').toLowerCase());
    return {row,action:'add',enabled:!sameMeal, ...(sameMeal?{warning:'Esiste già un ristorante per questo pasto: resta intatto. Seleziona solo dopo verifica.'}:{})};
  });
  const retained=active.filter(x=>!matchedIds.has(x.record.id)).map(x=>[timeOf(x.record),titleOf(x.record)].filter(Boolean).join(' · '));
  const fingerprint=JSON.stringify(active.map(x=>[x.store,x.record.id,x.record.updatedAt,titleOf(x.record),timeOf(x.record),x.store==='tappe'?canConvertPlainStop(x.record as Tappa):null,linkedDoc(snapshot,x.record.id)]));
  return {choices,retained,fingerprint};
}
export function buildTypedDayOperations(plan:DayPlan,snapshot:DayImportSnapshot,preview:TypedDayPreview,selected:number[],uid:string,now:number,newId:()=>string,deleted:(store:string,id:string)=>boolean=()=>false):DayImportOperation[] {
  const current=previewTypedDay(plan,snapshot,deleted);
  if(current.fingerprint!==preview.fingerprint||JSON.stringify(current.choices)!==JSON.stringify(preview.choices))throw new Error('Il programma è cambiato. Riapri l’anteprima.');
  if(!selected.length||new Set(selected).size!==selected.length)throw new Error('Nessuna modifica selezionata.');
  const ops:DayImportOperation[]=[];
  for(const index of selected){
    const choice=current.choices[index];
    if(!choice||choice.action==='skip')throw new Error('Voce protetta o non valida.');
    const row=choice.row,category=dayPlanCategory(row);
    const before=choice.beforeId?snapshot.tappe.find(r=>r.id===choice.beforeId):undefined;
    if(choice.action==='update'){
      if(!before||isProtectedStop(before as Tappa)||linkedDoc(snapshot,before.id))throw new Error('Tappa protetta.');
      ops.push({store:'tappe',action:'save',record:{...before,orario:row.time,time:row.time,baseUpdatedAt:before.updatedAt,updatedAt:Math.max(now,Number(before.updatedAt||0)+1)}});
      continue;
    }
    const id=newId();
    if(stores.some(store=>snapshot[store].some(r=>r.id===id)))throw new Error('ID già presente.');
    const notes=[before?.notes,before?.nota,row.notes].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('\n')||undefined;
    const common={id,data:plan.date,date:plan.date,createdAt:before?.createdAt||now,updatedAt:now,notes, ...(before?{timeStatus:before.timeStatus,noteCopilota:before.noteCopilota,copilota:before.copilota,mostraNoteInCard:before.mostraNoteInCard}: {})};
    if(category==='ristorante'){
      ops.push({store:'ristoranti',action:'save',record:{...common,nome:dayPlanRestaurantName(row),sottocategoria:row.meal||'Altro',dayId:'day_'+plan.date,orario:row.time,time:row.time,nota:notes}});
    }else if(category==='metro'){
      if(!row.from||!row.to||!row.endTime)throw new Error('Metro incompleta.');
      ops.push({store:'trasporti',action:'save',record:{...common,type:'metro',departureLocation:row.from,arrivalLocation:row.to,departureTime:row.time,arrivalDate:plan.date,arrivalTime:row.endTime,status:'pianificato'}});
    }else{
      ops.push({store:'tappe',action:'save',record:{...common,titolo:row.title,sottocategoria:'Tappa',dayId:'day_'+plan.date,orario:row.time,time:row.time,nota:notes}});
    }
    if(choice.action==='convert'){
      if(!before||!canConvertPlainStop(before as Tappa)||linkedDoc(snapshot,before.id))throw new Error('Tappa protetta.');
      const tombstone={id:'tombstone_tappe_'+before.id,value:{entityType:'tappe',deletedId:before.id,timestamp:now,deletedAt:now,pending:true,explicitDeleteBy:uid}};
      ops.push({store:'settings',action:'save',record:tombstone},{store:'tappe',action:'delete',record:before});
    }
  }
  return ops;
}
