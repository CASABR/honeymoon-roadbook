const fs = require('fs');
const path = require('path');

const oggiPath = path.resolve(__dirname, '..', 'src', 'views', 'OggiView.tsx');
let code = fs.readFileSync(oggiPath, 'utf8');

// Ensure import
if (!code.includes("import GoogleMapsIcon from '../components/icons/GoogleMapsIcon';")) {
  code = code.replace(
    "import { MapPinPlus } from 'lucide-react';",
    "import { MapPinPlus } from 'lucide-react';\nimport GoogleMapsIcon from '../components/icons/GoogleMapsIcon';"
  );
}

// Replace Focus della giornata block when viewing other date
const oldFocusStart = '          if (isViewingOtherDate) {\r\n            if (!nextEventItem) return null;';
const oldFocusStartLF = '          if (isViewingOtherDate) {\n            if (!nextEventItem) return null;';

const oldBlockRegex = /if \(isViewingOtherDate\) \{[\s\S]*?if \(!nextEventItem\) return null;[\s\S]*?return \([\s\S]*?<\/div>\s*\);\s*\}/;

const newBlock = `if (isViewingOtherDate) {
            if (!nextEventItem) return null;

            const hasTerminal = nextEventItem.type === 'trasporto' && nextEventItem.originalData && (nextEventItem.originalData as Trasporto).terminalGate;
            const hasPosti = nextEventItem.type === 'trasporto' && nextEventItem.originalData && (nextEventItem.originalData as Trasporto).posti;
            const hasChips = Boolean(hasTerminal || hasPosti || nextEventBookingCode);

            return (
              <div className="bg-white dark:bg-[#172033] text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 border-l-[#FF6B5F] px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FF6B5F] dark:text-[#ff9a90] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B5F]" />
                    Focus della giornata · {formatDateHuman(selectedDate)}
                  </span>
                  {nextEventItem.time ? (
                    <span className="font-mono text-xs font-extrabold text-slate-800 dark:text-white bg-slate-100 dark:bg-white/12 px-2 py-0.5 rounded border border-slate-200/80 dark:border-white/15 shrink-0 tabular-nums">
                      ORE {nextEventItem.time}{nextEventItem.timeStatus === 'indicativo' ? ' · IND.' : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded shrink-0">
                      Orario libero
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                      {nextEventItem.title}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5 truncate">
                      {(() => {
                        if (nextEventItem.type === 'trasporto' && nextEventItem.originalData) {
                          const tr = nextEventItem.originalData as Trasporto;
                          const dep = tr.departureLocation || nextEventItem.location;
                          const arr = tr.dropoffLocation || tr.arrivalLocation;
                          if (dep && arr && dep !== arr) return \`\${dep} → \${arr}\`;
                        }
                        return nextEventItem.location || 'Posizione programmata';
                      })()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {nextEventMapUrl && (
                      <a
                        href={nextEventMapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FF6B5F] hover:bg-[#fa5547] text-white text-xs font-extrabold transition-colors cursor-pointer shadow-2xs"
                        title="Apri su Google Maps"
                      >
                        <GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>Maps</span>
                        <span className="text-[10px] opacity-80">↗</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetailItem(nextEventItem)}
                      className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-white/12 dark:hover:bg-white/20 text-slate-700 dark:text-white text-xs font-extrabold transition-all cursor-pointer border border-slate-200 dark:border-white/15"
                    >
                      Dettagli →
                    </button>
                  </div>
                </div>

                {hasChips && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[10px]">
                    {hasTerminal && (
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-white/8 border border-slate-200 dark:border-white/12">
                        <span className="font-extrabold uppercase text-slate-500 dark:text-slate-400">
                          {(nextEventItem.originalData as Trasporto).type === 'treno' ? 'Bin.' : 'Gate'}
                        </span>
                        <span className="font-mono font-extrabold text-slate-800 dark:text-white">
                          {(nextEventItem.originalData as Trasporto).terminalGate}
                        </span>
                      </div>
                    )}
                    {hasPosti && (
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-white/8 border border-slate-200 dark:border-white/12">
                        <span className="font-extrabold uppercase text-slate-500 dark:text-slate-400">Posti</span>
                        <span className="font-extrabold text-slate-800 dark:text-white">
                          {(nextEventItem.originalData as Trasporto).posti}
                        </span>
                      </div>
                    )}
                    {nextEventBookingCode && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await navigator.clipboard.writeText(nextEventBookingCode);
                          } catch {}
                          setBookingCodeCopied(true);
                          setTimeout(() => setBookingCodeCopied(false), 2000);
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-white/8 hover:bg-slate-100 dark:hover:bg-white/15 border border-slate-200 dark:border-white/15 text-left transition-colors cursor-pointer"
                        title="Copia codice di prenotazione / PNR"
                      >
                        <span className="font-extrabold uppercase text-slate-500 dark:text-slate-400">
                          PNR {bookingCodeCopied ? '✓' : ''}
                        </span>
                        <span className="font-mono font-extrabold text-[#FF6B5F] dark:text-[#FF9B92]">
                          {nextEventBookingCode}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }`;

if (oldBlockRegex.test(code)) {
  code = code.replace(oldBlockRegex, newBlock);
} else {
  console.error('Failed to match oldBlockRegex');
}

// Also replace Naviga su Maps in today's active step
code = code.replace(
  `<span>📍</span>\n                        <span>Naviga su Maps ↗</span>`,
  `<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />\n                        <span>Naviga su Maps ↗</span>`
);
code = code.replace(
  `<span>📍</span>\r\n                        <span>Naviga su Maps ↗</span>`,
  `<GoogleMapsIcon className="w-3.5 h-3.5 shrink-0" />\r\n                        <span>Naviga su Maps ↗</span>`
);

fs.writeFileSync(oggiPath, code, 'utf8');
console.log('OggiView updated with compact focus card and GoogleMapsIcon!');

