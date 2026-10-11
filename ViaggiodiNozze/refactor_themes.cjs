const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/CUSI/Documents/App-viaggio-di-nozze/ViaggiodiNozze/src/components/cards';
const files = fs.readdirSync(dir).filter(f => f.endsWith('Card.tsx'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Wrapper
  content = content.replace(/bg-white dark:bg-slate-800\/90 border-slate-200 dark:border-slate-700/g, 'bg-white dark:bg-[#1E293B] border border-[#ECEAE5] dark:border-slate-700');
  content = content.replace(/bg-white dark:bg-slate-800\/90 border border-slate-200 dark:border-slate-700/g, 'bg-white dark:bg-[#1E293B] border border-[#ECEAE5] dark:border-slate-700');
  
  // Also clean up any accidental double border
  content = content.replace(/border border border-\[\#ECEAE5\]/g, 'border border-[#ECEAE5]');

  // Titles
  content = content.replace(/text-slate-900 dark:text-white/g, 'text-[#172033] dark:text-white');
  
  // Metadata & Timings
  content = content.replace(/text-slate-500 dark:text-slate-400/g, 'text-[#64748B] dark:text-slate-400');
  
  // Costs (previously text-[11px] font-bold text-[#172033] dark:text-slate-50)
  content = content.replace(/text-\[#172033\] dark:text-slate-50/g, 'text-[#172033] dark:text-slate-100');

  // Pencil button
  // Was: className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
  content = content.replace(/bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors/g, 'bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 text-[#64748B] dark:text-slate-400 transition-colors');

  fs.writeFileSync(filePath, content, 'utf-8');
});

console.log('Fixed themes and applied EXACT classes requested');
