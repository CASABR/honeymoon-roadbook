const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/CUSI/Documents/App-viaggio-di-nozze/ViaggiodiNozze/src/components/cards';
const files = fs.readdirSync(dir).filter(f => f.endsWith('Card.tsx'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Strip all hardcoded and dark: logic, and let the semantic CSS handle it!
  
  // Wrapper
  content = content.replace(/bg-white dark:bg-\[#1E293B\] border border-\[#ECEAE5\] dark:border-slate-700/g, 'bg-white border border-slate-200');
  content = content.replace(/bg-white dark:bg-\[#1E293B\] border-slate-200 dark:border-slate-700/g, 'bg-white border-slate-200');

  // Titles
  content = content.replace(/text-\[#172033\] dark:text-white/g, 'text-slate-900');
  content = content.replace(/text-\[#172033\]/g, 'text-slate-900');

  // Metadata
  content = content.replace(/text-\[#64748B\] dark:text-slate-400/g, 'text-slate-500');
  content = content.replace(/text-\[#64748B\]/g, 'text-slate-500');

  // Costs
  content = content.replace(/text-\[#172033\] dark:text-slate-100/g, 'text-slate-900');

  // Pencil button
  content = content.replace(/bg-slate-100 dark:bg-slate-700\/60 hover:bg-slate-200 text-\[#64748B\] dark:text-slate-400/g, 'bg-slate-100 hover:bg-slate-200 text-slate-500');

  fs.writeFileSync(filePath, content, 'utf-8');
});

console.log('Fixed semantic classes applied');
