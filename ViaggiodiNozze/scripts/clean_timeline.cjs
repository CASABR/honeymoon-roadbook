const fs = require('fs');

const targetFile = 'src/components/modals/TimelineItemDetailModal.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

// Remove att.link block
content = content.replace(/\{att\.link && \(\s*<div>\s*<span className="text-\[10px\] uppercase font-bold text-slate-400 tracking-wider block mb-0\.5">\s*Link \/ Sito Web\s*<\/span>.*?<\/div>\s*\)\}/gs, '');

// Remove att.notes block for Attivita
content = content.replace(/\{att\.notes && \(\s*<div>\s*<span className="text-\[10px\] uppercase font-bold text-slate-400 tracking-wider block mb-1">\s*Note & Dettagli\s*<\/span>.*?<\/div>\s*\)\}/gs, '');

fs.writeFileSync(targetFile, content, 'utf8');
console.log("Cleaned TimelineItemDetailModal.tsx");
