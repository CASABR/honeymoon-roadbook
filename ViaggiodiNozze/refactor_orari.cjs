const fs = require('fs');

function refactorOrari() {
    // 1. AttivitaCard
    let attivita = fs.readFileSync('src/components/cards/AttivitaCard.tsx', 'utf8');
    const attivitaOrarioRegex = /\{activity\.time && \([\s\S]*?<\/span>\s*\)\}/m;
    const attivitaOrarioNew = `{(() => {
                const ritrovo = activity.orarioRitrovo || activity.time;
                const inizio = activity.orarioInizio;
                if (!ritrovo && !inizio) {
                  return (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 transition">
                      ⏱️ Imposta orario
                    </button>
                  );
                }
                return (
                  <span className="text-sm font-bold text-[#172033] dark:text-white bg-[#F0F7FF] dark:bg-[#1E293B] px-2.5 py-0.5 rounded-md border border-[#D8E8FC] dark:border-slate-700">
                    {ritrovo ? \`Ore \${ritrovo}\` : \`Ore \${inizio}\`}
                    {ritrovo && inizio && ritrovo !== inizio && <span className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-1.5">(Inizio {inizio})</span>}
                  </span>
                );
              })()}`;
    attivita = attivita.replace(attivitaOrarioRegex, attivitaOrarioNew);
    if (!attivita.includes('Imposta orario')) { // if regex failed
        attivita = attivita.replace(/<Badge label=\{categoryLabels\[activity\.category\]/, `${attivitaOrarioNew}\n              <Badge label={categoryLabels[activity.category]`);
    }
    fs.writeFileSync('src/components/cards/AttivitaCard.tsx', attivita);
    console.log("Updated AttivitaCard");

    // 2. RistoranteCard
    let ristorante = fs.readFileSync('src/components/cards/RistoranteCard.tsx', 'utf8');
    const ristOrarioRegex = /<span className="text-\[11px\] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0\.5 rounded-md border border-amber-200">[\s\S]*?\{ristorante\.orario || ristorante\.time\}[\s\S]*?<\/span>/m;
    const ristOrarioNew = `{(() => {
                const time = ristorante.orario || ristorante.time;
                if (!time) {
                  return (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 transition">
                      ⏱️ Imposta orario
                    </button>
                  );
                }
                return (
                  <span className="text-sm font-bold text-[#172033] dark:text-white bg-[#F0F7FF] dark:bg-[#1E293B] px-2.5 py-0.5 rounded-md border border-[#D8E8FC] dark:border-slate-700">
                    Ore {time}
                  </span>
                );
              })()}`;
    if (ristorante.match(ristOrarioRegex)) {
        ristorante = ristorante.replace(ristOrarioRegex, ristOrarioNew);
    } else {
        // Fallback insertion before badges
        ristorante = ristorante.replace(/<Badge label="Ristorante"/, `${ristOrarioNew}\n              <Badge label="Ristorante"`);
    }
    fs.writeFileSync('src/components/cards/RistoranteCard.tsx', ristorante);
    console.log("Updated RistoranteCard");

    // 3. TrasportoCard
    let trasporto = fs.readFileSync('src/components/cards/TrasportoCard.tsx', 'utf8');
    const traspOrarioRegex = /<span className="text-\[11px\] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0\.5 rounded-md border border-amber-200">[\s\S]*?\{transport\.departureTime\}[\s\S]*?<\/span>/m;
    const traspOrarioNew = `{(() => {
              const dep = transport.departureTime;
              if (!dep) {
                return (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 transition">
                    ⏱️ Imposta orario
                  </button>
                );
              }
              return (
                <span className="text-sm font-bold text-[#172033] dark:text-white bg-[#F0F7FF] dark:bg-[#1E293B] px-2.5 py-0.5 rounded-md border border-[#D8E8FC] dark:border-slate-700">
                  {dep} Partenza
                </span>
              );
            })()}`;
    if (trasporto.match(traspOrarioRegex)) {
        trasporto = trasporto.replace(traspOrarioRegex, traspOrarioNew);
    } else {
        // fallback 
        trasporto = trasporto.replace(/<Badge label=\{transport\.tipoTrasporto \|\| 'Trasporto'\}/, `${traspOrarioNew}\n              <Badge label={transport.tipoTrasporto || 'Trasporto'}`);
    }
    fs.writeFileSync('src/components/cards/TrasportoCard.tsx', trasporto);
    console.log("Updated TrasportoCard");
}
refactorOrari();
