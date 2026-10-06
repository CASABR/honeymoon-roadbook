const fs = require('fs');

function refactorChat() {
    let content = fs.readFileSync('src/components/modals/SmartInsertModal.tsx', 'utf8');

    // 1. In handleExtract, change suggestion to suggestions
    content = content.replace(/initial\.suggestion = d\.suggestion \|\| null;/, "initial.suggestions = d.suggestions || [];");

    // 2. Add state for the pending suggestion to ask for date and time
    if (!content.includes('pendingSuggestion')) {
        content = content.replace(/const \[editData, setEditData\] = useState<any>\(\{\}\);/, "const [editData, setEditData] = useState<any>({});\n  const [pendingSuggestion, setPendingSuggestion] = useState<any>(null);\n  const [pickerDate, setPickerDate] = useState(defaultSuggestionDate());\n  const [pickerTime, setPickerTime] = useState('');");
    }

    // 3. Update the handleSave to support time for ristoranti and attivita
    content = content.replace(/time: editData\.time,/g, ""); // clean up if it was there
    content = content.replace(/cost: editData\.cost,/g, "cost: editData.cost,\n          time: editData.time,");
    
    // 4. Update the review info step to render multiple suggestions and the nested modal
    const reviewInfoRegex = /\{editData\.suggestion\?\.title && \([\s\S]*?<\/button>\s*\)\}/m;
    const newSuggestionsRender = `{editData.suggestions && editData.suggestions.length > 0 && (
                <div className="space-y-3 mt-4">
                  {editData.suggestions.map((s: any, idx: number) => (
                    <div key={idx} className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                         <span className="font-bold text-white text-sm">{s.title || s.name || s.nome || 'Proposta'}</span>
                         {s.cost && <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{s.cost}€</span>}
                      </div>
                      {(s.location || s.indirizzo) && (
                         <div className="text-xs text-slate-400">📍 {s.location || s.indirizzo}</div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const hasTime = !!(s.time || s.departureTime);
                          const hasDate = !!(s.date || s.checkIn);
                          if (!hasTime || !hasDate) {
                            setPickerDate(s.date || s.checkIn || defaultSuggestionDate());
                            setPickerTime(s.time || s.departureTime || '');
                            setPendingSuggestion(s);
                          } else {
                            setEditData({
                              category: s.category || (s.name ? 'ristorante' : 'attivita'),
                              title: s.title || s.name || s.nome,
                              location: s.location || s.indirizzo || '',
                              dateStart: s.date || s.checkIn || defaultSuggestionDate(),
                              time: s.time || s.departureTime || '',
                              cost: s.cost || '',
                              notes: s.notes || ''
                            });
                          }
                        }}
                        className="w-full mt-1 py-2.5 rounded-xl font-bold bg-[#FF6B5F]/10 hover:bg-[#FF6B5F]/20 text-[#FF6B5F] border border-[#FF6B5F]/20 transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                      >
                        ➕ Aggiungi al Viaggio
                      </button>
                    </div>
                  ))}
                </div>
              )}`;
    content = content.replace(reviewInfoRegex, newSuggestionsRender);

    // 5. Add time field to the standard form review step
    const dateStartRegex = /\{editData\.category === 'alloggio' \? 'Check-in' : 'Data Inizio'\}\s*<\/label>\s*<input\s*type="date"\s*value=\{editData\.dateStart \|\| ''\}\s*onChange=\{\(e\) => setEditData\(\{\.\.\.editData, dateStart: e\.target\.value\}\)\}\s*className="w-full bg-slate-800\/80 text-white border border-slate-700\/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 \[color-scheme:dark\]"\s*\/>\s*<\/div>/m;
    const dateStartReplace = `{editData.category === 'alloggio' ? 'Check-in' : 'Data Inizio'}
                      </label>
                      <input 
                        type="date" 
                        value={editData.dateStart || ''} 
                        onChange={(e) => setEditData({...editData, dateStart: e.target.value})}
                        className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 [color-scheme:dark]"
                      />
                    </div>
                    {!['tappa', 'alloggio'].includes(editData.category) && (
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Orario</label>
                        <input 
                          type="time" 
                          value={editData.time || ''} 
                          onChange={(e) => setEditData({...editData, time: e.target.value})}
                          className="w-full bg-slate-800/80 text-white border border-slate-700/80 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 [color-scheme:dark]"
                        />
                      </div>
                    )}`;
    content = content.replace(dateStartRegex, dateStartReplace);

    // 6. Add the "Quando vuoi andare?" pendingSuggestion Modal at the end of the return statement
    const modalEndRegex = /<\/div>\s*<\/div>\s*<\/>\s*\);\s*\}/m;
    const pendingModal = `</div>
      </div>

      {/* Mini-Modal Quando vuoi andare? */}
      {pendingSuggestion && (
        <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-700 animate-scale-up">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 text-center">Quando vuoi andare?</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Data</label>
                <input 
                  type="date"
                  value={pickerDate}
                  onChange={(e) => setPickerDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-[#FF6B5F] [color-scheme:light_dark]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">Orario (opzionale)</label>
                <input 
                  type="time"
                  value={pickerTime}
                  onChange={(e) => setPickerTime(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-[#FF6B5F] [color-scheme:light_dark]"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setPendingSuggestion(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  setEditData({
                    category: pendingSuggestion.category || (pendingSuggestion.name ? 'ristorante' : 'attivita'),
                    title: pendingSuggestion.title || pendingSuggestion.name || pendingSuggestion.nome,
                    location: pendingSuggestion.location || pendingSuggestion.indirizzo || '',
                    dateStart: pickerDate,
                    time: pickerTime,
                    cost: pendingSuggestion.cost || '',
                    notes: pendingSuggestion.notes || ''
                  });
                  setPendingSuggestion(null);
                }}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-[#FF6B5F] hover:bg-[#e85c50] shadow-md shadow-rose-500/20 transition"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}`;
    content = content.replace(modalEndRegex, pendingModal);

    fs.writeFileSync('src/components/modals/SmartInsertModal.tsx', content, 'utf8');
    console.log("Updated SmartInsertModal.tsx");
}
refactorChat();
