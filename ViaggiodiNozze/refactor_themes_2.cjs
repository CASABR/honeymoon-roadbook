const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/CUSI/Documents/App-viaggio-di-nozze/ViaggiodiNozze/src/components/cards';
const files = fs.readdirSync(dir).filter(f => f.endsWith('Card.tsx'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // We want to make sure the wrapper is exactly: bg-white dark:bg-[#1E293B] border border-[#ECEAE5] dark:border-slate-700
  // Clean up existing background and border classes
  content = content.replace(/bg-white dark:bg-\[#1E293B\] border border-\[#ECEAE5\] dark:border-slate-700/g, 'bg-white dark:bg-[#1E293B] border border-[#ECEAE5] dark:border-slate-700');
  
  // Cost
  content = content.replace(/text-\[11px\] font-bold text-\[#172033\] dark:text-white/g, 'text-[#172033] dark:text-slate-100 font-semibold');

  fs.writeFileSync(filePath, content, 'utf-8');
});

console.log('Fixed themes and applied EXACT classes requested');
