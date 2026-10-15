const fs = require('fs');
const path = require('path');
const file = path.join('c:/Users/CUSI/Documents/App-viaggio-di-nozze/ViaggiodiNozze/src/components/modals/SmartInsertModal.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add ChatMessage interface
if (!content.includes('interface ChatMessage')) {
  content = content.replace('type Step =', "export interface ChatMessage {\\n  role: 'user' | 'ai';\\n  text: string;\\n  suggestions?: any[];\\n}\\n\\ntype Step =");
}

// 2. Add chatMessages state
if (!content.includes('const [chatMessages, setChatMessages]')) {
  content = content.replace('const [inputMode, setInputMode]', 'const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);\n  const [existingData, setExistingData] = useState<any>(null);\n  const [inputMode, setInputMode]');
}

// 3. Update handleExtract
const handleExtractStart = content.indexOf('const handleExtract = async () => {');
const handleExtractEnd = content.indexOf('const handleSave = async () => {');
const oldHandleExtract = content.slice(handleExtractStart, handleExtractEnd);

const newHandleExtract = `const handleExtract = async () => {
    if (!text.trim()) return;
    
    const currentUserText = text.trim();
    if (inputMode === 'chat') {
      setChatMessages(prev => [...prev, { role: 'user', text: currentUserText }]);
      setText('');
    } else {
      setStep('extracting');
    }
    
    setErrorMsg('');

    const config = getTripConfig();
    const today = new Date().toISOString().split('T')[0];
    const contextStr = \`Data Odierna: \${today}. Viaggio: \${config?.title} (\${config?.startDate} - \${config?.endDate}).\`;

    const res = await extractFromText(currentUserText, contextStr, inputMode);

    if (res.success && res.data) {
      if (inputMode === 'chat' || res.entityType === 'info') {
        const d: any = res.data;
        setChatMessages(prev => [...prev, { 
          role: 'ai', 
          text: d.message || '', 
          suggestions: d.suggestion ? [d.suggestion] : (d.suggestions || []) 
        }]);
        setStep('input');
        // scroll to bottom after a delay
        setTimeout(() => {
          const el = document.getElementById('chat-scroll-container');
          if (el) el.scrollTop = el.scrollHeight;
        }, 100);
        return;
      }

      // -- IMPORT MODE --
      const d: any = res.data;
      const initial: any = { category: res.entityType };
      
      let existingItem: any = null;
      if (res.entityType === 'alloggio') {
        initial.title = d.name || '';
        initial.location = d.location || '';
        initial.dateStart = d.checkIn || '';
        initial.dateEnd = d.checkOut || '';
        initial.cost = d.cost || '';
        initial.notes = d.notes || '';
        const all = await storageService.getAccommodations();
        existingItem = all.find(a => (a.name.toLowerCase().includes(initial.title.toLowerCase()) && a.checkIn === initial.dateStart));
      } else if (res.entityType === 'attivita') {
        initial.title = d.title || '';
        initial.location = d.location || '';
        initial.dateStart = d.date || '';
        initial.time = d.time || '';
        initial.cost = d.cost || '';
        initial.notes = d.notes || '';
        const all = await storageService.getActivities();
        existingItem = all.find(a => a.title.toLowerCase().includes(initial.title.toLowerCase()) && a.date === initial.dateStart);
      } else if (res.entityType === 'ristorante') {
        initial.title = d.name || '';
        initial.location = d.location || '';
        initial.dateStart = d.date || '';
        initial.time = d.time || '';
        initial.cost = d.cost || '';
        initial.notes = d.notes || '';
        const all = await storageService.getRistoranti();
        existingItem = all.find(a => a.nome.toLowerCase().includes(initial.title.toLowerCase()) && (a.data === initial.dateStart || a.date === initial.dateStart));
      } else if (res.entityType === 'tappa') {
        initial.title = d.titolo || '';
        initial.dateStart = d.data || '';
        initial.notes = d.nota || '';
        const all = await storageService.getTappe();
        existingItem = all.find(a => a.titolo.toLowerCase().includes(initial.title.toLowerCase()) && (a.data === initial.dateStart || a.date === initial.dateStart));
      } else if (res.entityType === 'trasporto') {
        initial.title = \`\${d.departureLocation || ''} -> \${d.arrivalLocation || ''}\`;
        initial.dateStart = d.date || '';
        initial.dateEnd = d.arrivalDate || '';
        initial.cost = d.cost || '';
        initial.time = d.departureTime || '';
        initial.notes = d.notes || '';
        const all = await storageService.getTransports();
        existingItem = all.find(a => a.date === initial.dateStart && a.departureLocation?.toLowerCase() === d.departureLocation?.toLowerCase());
      }
      
      setExistingData(existingItem || null);
      if (existingItem) {
         initial.id = existingItem.id;
      }
      
      setEditData(initial);
      setStep('review');
    } else {
      setErrorMsg(res.error || 'Estrazione fallita.');
      if (inputMode === 'chat') {
        setChatMessages(prev => [...prev, { role: 'ai', text: res.error || 'Errore di comunicazione col Concierge.' }]);
        setStep('input');
      } else {
        setStep('error');
      }
    }
  };

  `;
content = content.replace(oldHandleExtract, newHandleExtract);

// 4. Update the handleSave to handle existingData updates (update vs create)
const handleSaveStart = content.indexOf('const handleSave = async () => {');
const handleSaveEnd = content.indexOf('const entityLabel:', handleSaveStart);
const oldHandleSave = content.slice(handleSaveStart, handleSaveEnd);

const newHandleSave = `const handleSave = async () => {
    setStep('saving');
    try {
      const now = Date.now();
      const cat = editData.category;
      
      if (existingData) {
         // UPDATE
         if (cat === 'alloggio') await storageService.updateAccommodation(existingData.id, {name: editData.title, location: editData.location, checkIn: editData.dateStart, checkOut: editData.dateEnd, address: editData.location || '', cost: editData.cost, time: editData.time, notes: editData.notes, updatedAt: now});
         else if (cat === 'tappa') await storageService.updateTappa(existingData.id, {titolo: editData.title, data: editData.dateStart, date: editData.dateStart, nota: editData.notes});
         else if (cat === 'trasporto') {
           const parts = editData.title.split('->').map((s: string) => s.trim());
           await storageService.updateTransport(existingData.id, {departureLocation: parts[0] || editData.title, arrivalLocation: parts[1] || '', date: editData.dateStart, arrivalDate: editData.dateEnd, cost: editData.cost, time: editData.time, notes: editData.notes, updatedAt: now});
         }
         else if (cat === 'attivita') await storageService.updateActivity(existingData.id, {title: editData.title, location: editData.location, date: editData.dateStart, time: editData.time, cost: editData.cost, notes: editData.notes, updatedAt: now});
         else if (cat === 'ristorante') await storageService.updateRistorante(existingData.id, {nome: editData.title, indirizzo: editData.location, data: editData.dateStart, date: editData.dateStart, budget: editData.cost, time: editData.time, nota: editData.notes});
      } else {
         // CREATE
         if (cat === 'alloggio') await storageService.saveAccommodation({id: generateId('alloggio'), name: editData.title, location: editData.location, checkIn: editData.dateStart, checkOut: editData.dateEnd, address: editData.location || '', cost: editData.cost, time: editData.time, notes: editData.notes, status: 'prenotato', createdAt: now, updatedAt: now} as any);
         else if (cat === 'tappa') await storageService.addTappa({titolo: editData.title, data: editData.dateStart, date: editData.dateStart, nota: editData.notes});
         else if (cat === 'trasporto') {
           const parts = editData.title.split('->').map((s: string) => s.trim());
           await storageService.saveTransport({id: generateId('trasporto'), type: 'volo', date: editData.dateStart, arrivalDate: editData.dateEnd, departureLocation: parts[0] || editData.title, arrivalLocation: parts[1] || '', cost: editData.cost, time: editData.time, notes: editData.notes, status: 'prenotato', createdAt: now, updatedAt: now} as any);
         }
         else if (cat === 'attivita') await storageService.saveActivity({id: generateId('attivita'), dayId: \`day_\${editData.dateStart}\`, date: editData.dateStart, title: editData.title, location: editData.location, cost: editData.cost, time: editData.time, category: 'visita', status: 'pianificata', notes: editData.notes, createdAt: now, updatedAt: now} as any);
         else if (cat === 'ristorante') await storageService.saveRistorante({id: generateId('rist'), nome: editData.title, data: editData.dateStart, date: editData.dateStart, dayId: \`day_\${editData.dateStart}\`, indirizzo: editData.location, budget: editData.cost, time: editData.time, nota: editData.notes, createdAt: now, updatedAt: now} as any);
      }
      
      onSaved?.(cat === 'alloggio' ? 'alloggio' : (cat === 'trasporto' ? 'trasporto' : 'tappa'));
      setStep('done');
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Errore salvataggio.');
      setStep('error');
    }
  };
  `;
content = content.replace(oldHandleSave, newHandleSave);

// 5. Replace step === 'input' to render Chat UI when inputMode === 'chat'
const stepInputRegex = /{\/\* ─── Step: INPUT ─── \*\/}[\s\S]*?{\/\* ─── Step: EXTRACTING ─── \*\/}/;
const newStepInput = `{/* ─── Step: INPUT ─── */}
          {step === 'input' && (
            <div className="space-y-4 flex flex-col h-full max-h-[70vh]">
              <div className="flex gap-2 p-1 bg-slate-800/50 rounded-xl mb-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setInputMode('import')}
                  className={\`flex-1 py-2 text-sm font-semibold rounded-lg transition-all \${inputMode === 'import' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}\`}
                >
                  Importa Prenotazioni
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('chat')}
                  className={\`flex-1 py-2 text-sm font-semibold rounded-lg transition-all \${inputMode === 'chat' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}\`}
                >
                  Chiedi al Concierge
                </button>
              </div>

              {inputMode === 'chat' && (
                <div id="chat-scroll-container" className="flex-1 overflow-y-auto mb-2 space-y-4 pr-1 custom-scrollbar min-h-[200px]">
                  {chatMessages.length === 0 && (
                     <div className="text-center text-slate-500 text-sm py-10">
                       Chiedi consigli al tuo Concierge di viaggio...
                     </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={\`flex \${msg.role === 'user' ? 'justify-end' : 'justify-start'}\`}>
                      {msg.role === 'ai' && (
                        <div className="w-8 h-8 shrink-0 rounded-full bg-[#FF6B5F]/20 border border-violet-500/30 flex items-center justify-center text-sm mr-2 mt-1">✨</div>
                      )}
                      <div className={\`max-w-[85%] px-4 py-2.5 rounded-2xl whitespace-pre-wrap break-words text-sm \${
                        msg.role === 'user' 
                          ? 'bg-[#FF6B5F]/80 text-white rounded-br-sm' 
                          : 'bg-slate-800/80 text-slate-200 rounded-tl-sm border border-slate-700/80'
                      }\`}>
                        {msg.role === 'ai' ? renderMessage(msg.text) : msg.text}
                        
                        {msg.suggestions && msg.suggestions.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {msg.suggestions.map((s: any, idx: number) => (
                              <div key={idx} className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold text-white">{s.title || s.name || s.nome}</span>
                                </div>
                                {(s.location || s.indirizzo) && <div className="text-xs text-slate-400 mb-2">📍 {s.location || s.indirizzo}</div>}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPickerDate(s.date || s.checkIn || defaultSuggestionDate());
                                    setPickerTime(s.time || s.departureTime || '');
                                    setPendingSuggestion(s);
                                  }}
                                  className="w-full py-1.5 rounded-lg bg-[#FF6B5F]/10 text-[#FF6B5F] text-xs font-bold hover:bg-[#FF6B5F]/20 transition"
                                >
                                  + Aggiungi all'itinerario
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {step === 'extracting' && inputMode === 'chat' && (
                    <div className="flex justify-start">
                       <div className="w-8 h-8 shrink-0 rounded-full bg-[#FF6B5F]/20 border border-violet-500/30 flex items-center justify-center text-sm mr-2 animate-pulse">✨</div>
                       <div className="bg-slate-800/80 px-4 py-2.5 rounded-2xl rounded-tl-sm text-slate-400 text-sm italic">Sto scrivendo...</div>
                    </div>
                  )}
                </div>
              )}

              <div className="shrink-0 relative">
                <textarea
                  ref={textAreaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && inputMode === 'chat') {
                      e.preventDefault();
                      handleExtract();
                    }
                  }}
                  placeholder={
                    inputMode === 'import'
                      ? "Incolla qui la conferma del volo, della stanza o un'idea per una tappa..."
                      : "Scrivi un messaggio..."
                  }
                  className={\`w-full p-4 bg-slate-800/50 border border-slate-700 text-slate-200 text-sm resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 placeholder:text-slate-500 \${inputMode === 'chat' ? 'h-16 rounded-3xl pl-5 pr-14' : 'h-40 rounded-2xl leading-relaxed'}\`}
                />
                {inputMode === 'chat' && (
                  <button
                    onClick={handleExtract}
                    disabled={!text.trim()}
                    className="absolute right-2 top-2 bottom-2 w-12 h-12 rounded-full bg-[#FF6B5F] text-white flex items-center justify-center hover:bg-[#e85c50] disabled:opacity-50 transition"
                  >
                    <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                  </button>
                )}
              </div>

              {inputMode === 'import' && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={!text.trim()}
                    className="flex-1 py-3.5 rounded-xl font-bold bg-[#FF6B5F] text-white shadow-lg shadow-rose-500/20 hover:bg-[#e85c50] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Crea Tappa con AI
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── Step: EXTRACTING ─── */}
`;
content = content.replace(stepInputRegex, newStepInput);

// 6. Update step === 'review' for Importa Prenotazioni (showing existingData message and buttons)
const stepReviewImportRegex = /{step === 'review' && editData && editData\.category !== 'info' && \([\s\S]*?<div className="flex gap-3 pt-2 border-t border-slate-800">/m;
const oldStepReviewImport = content.match(stepReviewImportRegex);

if (oldStepReviewImport) {
  const newStepReviewImport = `{step === 'review' && editData && editData.category !== 'info' && (
            <div className="space-y-4">
              {existingData ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-2">
                   <div className="flex items-start gap-2 text-amber-400">
                     <span className="text-lg">⚠️</span>
                     <div>
                       <p className="font-bold text-sm">Prenotazione già presente!</p>
                       <p className="text-xs mt-0.5 text-amber-300">Abbiamo trovato "{existingData.title || existingData.nome || existingData.name || existingData.titolo}" in questa data. Puoi integrare i dati mancanti o mantenere la versione attuale.</p>
                     </div>
                   </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-2">
                   <div className="flex items-center gap-2 text-emerald-400">
                     <span className="text-lg">✨</span>
                     <p className="font-bold text-sm">Nuovo elemento rilevato</p>
                   </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Categoria Rilevata</label>
                  <select 
                    value={editData.category} 
                    onChange={(e) => setEditData({...editData, category: e.target.value})}
                    className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                  >
                    {Object.keys(entityLabel).filter(k => k !== 'sconosciuto').map(k => (
                      <option key={k} value={k}>{entityLabel[k]}</option>
                    ))}
                  </select>
                </div>
                
                {/* ... fields ... */}
                <div className="overflow-y-auto max-h-[35vh] pr-1 pb-2 custom-scrollbar space-y-3 min-w-0">
                  <div className="min-w-0">
                    <label className="text-xs font-semibold text-slate-400 mb-1 block truncate">Nome / Titolo</label>
                    <input type="text" value={editData.title || ''} onChange={(e) => setEditData({...editData, title: e.target.value})} className={\`w-full bg-slate-800/80 text-white border rounded-xl px-3 py-2 text-sm focus:outline-none \${existingData && existingData.title !== editData.title ? 'border-amber-500/50' : 'border-slate-700/80'}\`} />
                  </div>
                  {editData.category !== 'tappa' && (
                    <div className="min-w-0">
                      <label className="text-xs font-semibold text-slate-400 mb-1 block truncate">{editData.category === 'trasporto' ? 'Da -> A' : 'Luogo / Indirizzo'}</label>
                      <input type="text" value={editData.location || ''} onChange={(e) => setEditData({...editData, location: e.target.value})} className={\`w-full bg-slate-800/80 text-white border rounded-xl px-3 py-2 text-sm focus:outline-none \${existingData && existingData.location !== editData.location ? 'border-amber-500/50' : 'border-slate-700/80'}\`} />
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 mb-1 block">{editData.category === 'alloggio' ? 'Check-in' : 'Data Inizio'}</label>
                      <input type="date" value={editData.dateStart || ''} onChange={(e) => setEditData({...editData, dateStart: e.target.value})} className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm [color-scheme:dark]" />
                    </div>
                    {!['tappa', 'alloggio'].includes(editData.category) && (
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Orario</label>
                        <input type="time" value={editData.time || ''} onChange={(e) => setEditData({...editData, time: e.target.value})} className={\`w-full bg-slate-800/80 text-white border rounded-xl px-3 py-2 text-sm [color-scheme:dark] \${existingData && !existingData.time && editData.time ? 'border-emerald-500/50' : 'border-slate-700/80'}\`} />
                      </div>
                    )}
                  </div>
                  {editData.category !== 'tappa' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-400 mb-1 block">Costo (€)</label>
                      <input type="number" value={editData.cost || ''} onChange={(e) => setEditData({...editData, cost: e.target.value})} className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm" />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 mb-1 block">Note / Dettagli</label>
                    <textarea value={editData.notes || ''} onChange={(e) => setEditData({...editData, notes: e.target.value})} className={\`w-full bg-slate-800/80 text-white border rounded-xl px-3 py-2 text-sm min-h-[60px] resize-none focus:outline-none \${existingData && !existingData.notes && editData.notes ? 'border-emerald-500/50' : 'border-slate-700/80'}\`} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-800">`;
  content = content.replace(oldStepReviewImport[0], newStepReviewImport);
}

// 7. Remove the old info review block (now handled in chat view)
const infoReviewRegex = /{step === 'review' && editData && editData\.category === 'info' && \([\s\S]*?{step === 'review' && editData && editData\.category !== 'info' && \(/m;
if (infoReviewRegex.test(content)) {
  content = content.replace(infoReviewRegex, "{step === 'review' && editData && editData.category !== 'info' && (");
}

// 8. Update save buttons for existingData
const buttonsRegex = /<button[\s\S]*?← Annulla[\s\S]*?<\/button>[\s\S]*?<button[\s\S]*?✅ Salva nel Roadbook[\s\S]*?<\/button>/m;
const newButtons = `<button
                  type="button"
                  onClick={() => existingData ? onClose() : setStep('input')}
                  className="flex-1 py-3 px-5 rounded-xl text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                >
                  {existingData ? 'Mantieni Invariato' : '← Salta'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-[2] py-3 px-6 rounded-xl text-sm font-semibold bg-[#FF6B5F] text-white shadow-lg shadow-rose-500/20 hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {existingData ? '✅ Aggiorna campi mancanti' : '✅ Aggiungi all\\'itinerario'}
                </button>`;
content = content.replace(buttonsRegex, newButtons);


fs.writeFileSync(file, content);
console.log('Fatto!');
