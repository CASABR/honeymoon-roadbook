import { useState, useEffect } from "react";
import { repository } from "../services/repository";
import {
  getUnifiedBookings,
  detectOverlaps,
  detectDuplicates,
  detectGaps,
  type VerificationIssue,
} from "../services/bookingService";

export default function BookingVerificationView({ onClose }: { onClose: () => void }) {
  const [issues, setIssues] = useState<VerificationIssue[]>([]);
  const [ignoredKeys, setIgnoredKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Carica i dati ed esegue i controlli
  useEffect(() => {
    async function runVerification() {
      try {
        // Legge le prenotazioni dal DB
        const defaultDays = await repository.getTripDays([]);
        const accommodations = await repository.getAccommodations([]);
        const transports = await repository.getTransports([]);

        // Ricava le date del viaggio
        const tripStartDateStr = localStorage.getItem("hrb_departure_date") || "2026-11-28";
        let tripEndDateStr = "2027-01-10"; // default mock end

        if (defaultDays.length > 0) {
          tripEndDateStr = defaultDays[defaultDays.length - 1].date;
        }

        // Converte in modello unificato
        const unified = getUnifiedBookings(accommodations, transports);

        // Rileva anomalie
        const overlaps = detectOverlaps(unified);
        const duplicates = detectDuplicates(unified);
        const gaps = detectGaps(unified, tripStartDateStr, tripEndDateStr);

        const allIssues = [...overlaps, ...duplicates, ...gaps];
        setIssues(allIssues);

        // Carica la lista degli avvisi ignorati dall'utente
        const ignored = localStorage.getItem("hrb_ignored_issues");
        if (ignored) {
          setIgnoredKeys(JSON.parse(ignored));
        }
      } catch (e) {
        console.error("Errore durante la verifica delle prenotazioni:", e);
      } finally {
        setIsLoading(false);
      }
    }

    runVerification();
  }, []);

  function handleIgnore(key: string) {
    const nextIgnored = [...ignoredKeys, key];
    setIgnoredKeys(nextIgnored);
    localStorage.setItem("hrb_ignored_issues", JSON.stringify(nextIgnored));
  }

  function handleResetIgnored() {
    setIgnoredKeys([]);
    localStorage.removeItem("hrb_ignored_issues");
  }

  // Filtra gli avvisi attivi escludendo quelli ignorati
  const activeIssues = issues.filter((iss) => !ignoredKeys.includes(iss.ignoredKey));

  if (isLoading) {
    return (
      <div className="bottom-sheet-backdrop" onClick={onClose}>
        <div className="bottom-sheet-container text-center py-10" onClick={(e) => e.stopPropagation()}>
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-[12px] text-slate-500 font-semibold">Analisi in corso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet-container max-w-[430px]" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-black text-gray-900">Verifica Prenotazioni</h2>
            <p className="text-[11.5px] text-gray-400">Rilevamento automatico di anomalie e conflitti</p>
          </div>
          {ignoredKeys.length > 0 && (
            <button
              onClick={handleResetIgnored}
              className="text-[11px] text-blue-600 font-bold bg-blue-50 px-2 py-1.5 rounded-xl hover:bg-blue-100 transition-colors"
            >
              Ripristina oscurati
            </button>
          )}
        </div>

        <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
          {activeIssues.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <span className="text-[36px] block">✨</span>
              <p className="text-[13.5px] font-bold text-gray-800">Tutto in regola!</p>
              <p className="text-[12px] text-gray-400 max-w-[240px] mx-auto leading-normal">
                Nessun conflitto, sovrapposizione o notte non coperta da alloggi rilevata. Il tuo piano è pronto.
              </p>
            </div>
          ) : (
            activeIssues.map((issue) => {
              const isError = issue.severity === "error";

              return (
                <div
                  key={issue.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isError
                      ? "bg-red-50/50 border-red-100"
                      : issue.type === "gap"
                      ? "bg-blue-50/30 border-blue-100/50"
                      : "bg-amber-50/50 border-amber-100"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-[16px] mt-0.5">
                      {isError ? "🔴" : issue.type === "gap" ? "🔍" : "⚠️"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md ${
                            isError
                              ? "bg-red-100 text-red-700"
                              : issue.type === "gap"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {issue.type === "overlap"
                            ? "Sovrapposizione"
                            : issue.type === "duplicate"
                            ? "Sospetto Duplicato"
                            : "Giorno Scoperto"}
                        </span>
                        {issue.dateLabel && (
                          <span className="text-[10px] font-semibold text-gray-400">
                            {issue.dateLabel}
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-[13px] text-gray-900 mt-1.5">{issue.title}</p>
                      <p className="text-[12px] text-gray-500 mt-0.5 leading-normal">
                        {issue.description}
                      </p>

                      {/* Dettagli elementi */}
                      {issue.items.length > 0 && (
                        <div className="mt-2.5 space-y-1 bg-white/60 p-2 rounded-xl border border-gray-100/50">
                          {issue.items.map((item) => (
                            <div key={item.id} className="text-[11px] text-gray-600 flex justify-between">
                              <span className="font-semibold truncate max-w-[180px]">{item.title}</span>
                              <span className="text-gray-400">
                                {item.startDate} {item.startDate !== item.endDate && `→ ${item.endDate}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Azioni */}
                      <div className="flex justify-end gap-2 mt-3 border-t border-gray-100/30 pt-2.5">
                        <button
                          onClick={() => handleIgnore(issue.ignoredKey)}
                          className="text-[11px] text-gray-400 hover:text-gray-600 font-bold px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          Ignora avviso
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[14px] active:scale-98 transition-transform"
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}
