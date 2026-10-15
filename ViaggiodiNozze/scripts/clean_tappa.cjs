const fs = require('fs');

// Clean TappaCard.tsx
const tappaCardPath = 'src/components/cards/TappaCard.tsx';
let tappaContent = fs.readFileSync(tappaCardPath, 'utf8');

// Remove tappa.nota block
tappaContent = tappaContent.replace(/\{tappa\.nota && \(\s*<p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900\/60 border border-slate-200 dark:border-slate-700\/60 p-2 rounded-lg mt-2">\s*\{tappa\.nota\}\s*<\/p>\s*\)\}/s, '');

fs.writeFileSync(tappaCardPath, tappaContent, 'utf8');

// Clean TimelineItemDetailModal.tsx
const timelinePath = 'src/components/modals/TimelineItemDetailModal.tsx';
let timelineContent = fs.readFileSync(timelinePath, 'utf8');

// Remove t.nota for Tappa
timelineContent = timelineContent.replace(/\{t\.nota && \(\s*<div>\s*<span className="text-\[10px\] uppercase font-bold text-slate-400 tracking-wider block mb-1">\s*Note & Dettagli\s*<\/span>.*?<\/div>\s*\)\}/gs, '');

fs.writeFileSync(timelinePath, timelineContent, 'utf8');
console.log("Cleaned Tappa UI");
