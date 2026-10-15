const fs = require('fs');
const path = require('path');

const dir = path.join('src', 'components', 'cards');
const files = ['AttivitaCard.tsx', 'TrasportoCard.tsx', 'AlloggioCard.tsx', 'RistoranteCard.tsx', 'ShoppingCard.tsx', 'TappaCard.tsx'];

for (const file of files) {
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf8');

  // Regex to match the old Copilot badge
  // It has text `🧭 Co-pilota` inside
  const badgeRegex = /\{true && \(\s*<button[\s\S]*?className=\{`inline-flex items-center gap-1 text-\[10px\] font-bold px-2 py-0\.5 rounded-full border transition-colors shadow-sm[\s\S]*?title="Apri note Copilota"\s*>\s*🧭 Co-pilota\s*<\/button>\s*\)\}/g;
  
  const newBadge = `{true && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsCopilotOpen(true); }}
                className={\`flex items-center justify-center w-7 h-7 rounded-full border transition-colors shadow-sm \${
                  hasCopilotNotes
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500 opacity-60 hover:opacity-100'
                }\`}
                title="Apri note Copilota"
              >
                <span className="text-sm">🧭</span>
              </button>
            )}`;

  content = content.replace(badgeRegex, newBadge);
  fs.writeFileSync(filePath, content, 'utf8');
}
console.log('Copilot badge updated to icon only.');
