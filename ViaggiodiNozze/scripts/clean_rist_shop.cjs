const fs = require('fs');

// Clean RistoranteCard.tsx
const ristCardPath = 'src/components/cards/RistoranteCard.tsx';
let ristContent = fs.readFileSync(ristCardPath, 'utf8');
ristContent = ristContent.replace(/\{ristorante\.nota && \(\s*<p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900\/60 border border-slate-200 dark:border-slate-700\/60 p-2 rounded-lg mt-2">\s*\{ristorante\.nota\}\s*<\/p>\s*\)\}/s, '');
fs.writeFileSync(ristCardPath, ristContent, 'utf8');

// Clean ShoppingCard.tsx
const shopCardPath = 'src/components/cards/ShoppingCard.tsx';
let shopContent = fs.readFileSync(shopCardPath, 'utf8');
shopContent = shopContent.replace(/\{shopping\.nota && \(\s*<p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900\/60 border border-slate-200 dark:border-slate-700\/60 p-2 rounded-lg mt-2">\s*\{shopping\.nota\}\s*<\/p>\s*\)\}/s, '');
fs.writeFileSync(shopCardPath, shopContent, 'utf8');

// Clean TimelineItemDetailModal.tsx
const timelinePath = 'src/components/modals/TimelineItemDetailModal.tsx';
let timelineContent = fs.readFileSync(timelinePath, 'utf8');
timelineContent = timelineContent.replace(/\{(rist|shop)\.nota && \(\s*<div>\s*<span className="text-\[10px\] uppercase font-bold text-slate-400 tracking-wider block mb-1">\s*Note & Dettagli\s*<\/span>.*?<\/div>\s*\)\}/gs, '');
fs.writeFileSync(timelinePath, timelineContent, 'utf8');

console.log("Cleaned Ristorante and Shopping UI");
