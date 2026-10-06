const fs = require('fs');

function refactorLive() {
    let content = fs.readFileSync('src/views/altro/LiveView.tsx', 'utf8');

    // 1. Add liveFlight computation
    const liveFlightCode = `
  // Calcolo volo in partenza (oggi o domani entro le 8)
  const liveFlight = useMemo(() => {
    const today = new Date(todayStr);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = \`\${tomorrow.getFullYear()}-\${String(tomorrow.getMonth() + 1).padStart(2, '0')}-\${String(tomorrow.getDate()).padStart(2, '0')}\`;

    return transports.find(t => {
      if (t.tipoTrasporto !== 'volo') return false;
      
      if (t.date === todayStr) return true;
      if (t.date === tomorrowStr && t.departureTime) {
         const time = t.departureTime.split(':');
         if (parseInt(time[0], 10) < 8) return true;
         if (parseInt(time[0], 10) === 8 && parseInt(time[1], 10) === 0) return true;
      }
      return false;
    });
  }, [transports, todayStr]);
`;

    if (!content.includes('const liveFlight = useMemo(')) {
        content = content.replace(/const currentTransport = useMemo\(\(\) => \{[\s\S]*?\}, \[transports, activeDate\]\);/, 
            `const currentTransport = useMemo(() => {
    return transports.find(t => t.date === activeDate);
  }, [transports, activeDate]);\n${liveFlightCode}`);
    }

    // 2. Add the Widget JSX just after </header>
    const widgetJsx = `
      {/* 2. WIDGET VOLO IN PARTENZA / LIVE TRACKING */}
      {liveFlight && (
        <div className="bg-white border-2 border-[#FF6B5F] rounded-2xl p-4 shadow-xl shadow-rose-500/10 mx-1 mb-2 animate-scale-up">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-[#FF6B5F] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
              ● {liveFlight.date === todayStr ? 'Oggi in partenza' : 'In partenza'}
            </span>
            <span className="text-xs font-bold text-slate-800">
              {liveFlight.carrier || 'Volo'} {liveFlight.bookingCode ? \`(\${liveFlight.bookingCode})\` : ''}
            </span>
          </div>
          
          <div className="flex items-center justify-between mb-4">
             <div className="flex-1">
               <p className="text-xl font-black text-slate-900 font-mono tracking-tight">{liveFlight.departureLocation || 'Partenza'}</p>
               <p className="text-[11px] font-semibold text-slate-500">{liveFlight.departureTime || '--:--'}</p>
             </div>
             <div className="flex-1 flex justify-center text-rose-500 px-2">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
               </svg>
             </div>
             <div className="flex-1 text-right">
               <p className="text-xl font-black text-slate-900 font-mono tracking-tight">{liveFlight.arrivalLocation || 'Arrivo'}</p>
               <p className="text-[11px] font-semibold text-slate-500">{liveFlight.arrivalTime || '--:--'} {liveFlight.arrivalDate && liveFlight.arrivalDate !== liveFlight.date ? '(+1)' : ''}</p>
             </div>
          </div>

          <a
            href={liveFlight.carrier ? \`https://www.google.com/search?q=\${encodeURIComponent('volo ' + liveFlight.carrier)}\` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl transition shadow-md"
          >
            <span>✈️</span> Segui questo volo in diretta online ↗
          </a>
        </div>
      )}
`;

    if (!content.includes('WIDGET VOLO IN PARTENZA')) {
        content = content.replace(/<\/header>/, `</header>\n${widgetJsx}`);
    }

    fs.writeFileSync('src/views/altro/LiveView.tsx', content, 'utf8');
    console.log("Updated LiveView.tsx");
}

refactorLive();
