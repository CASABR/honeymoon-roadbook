const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/CUSI/Documents/App-viaggio-di-nozze/ViaggiodiNozze/src/components/cards';
const files = fs.readdirSync(dir).filter(f => f.endsWith('Card.tsx'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Fix main wrapper classes
  content = content.replace(/bg-\[#FFFFFF\] dark:bg-\[#1E293B\] border-\[#ECEAE5\] dark:border-slate-700/g, 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700');
  
  // Fix border missing (it had border but maybe we need to be careful)
  // Let's replace the whole string to ensure it's correct
  content = content.replace(/border bg-\[#FFFFFF\] dark:bg-\[#1E293B\] border-\[#ECEAE5\] dark:border-slate-700/g, 'bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700');

  content = content.replace(/bg-\[#FFFFFF\] dark:bg-\[#1E293B\] border-\[#ECEAE5\] dark:border-slate-700/g, 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700');

  // Fix titles
  content = content.replace(/text-\[#172033\] dark:text-slate-50/g, 'text-slate-900 dark:text-white');
  
  // Fix metadata
  content = content.replace(/text-\[#64748B\] dark:text-slate-400/g, 'text-slate-500 dark:text-slate-400');
  
  // Fix old bg-white in case there is any left over
  
  fs.writeFileSync(filePath, content, 'utf-8');
});

// Also fix Hitchy in SmartInsertModal
const smartModal = 'c:/Users/CUSI/Documents/App-viaggio-di-nozze/ViaggiodiNozze/src/components/modals/SmartInsertModal.tsx';
let smartContent = fs.readFileSync(smartModal, 'utf-8');
smartContent = smartContent.replace(/Hitchy sta pensando/g, 'Houni AI sta pensando');
smartContent = smartContent.replace(/Hitchy · Concierge/g, 'Houni AI · Concierge');
fs.writeFileSync(smartModal, smartContent, 'utf-8');

// Also fix Hitchy in aiExtractor
const aiExtractor = 'c:/Users/CUSI/Documents/App-viaggio-di-nozze/ViaggiodiNozze/src/services/aiExtractor.ts';
let aiContent = fs.readFileSync(aiExtractor, 'utf-8');
aiContent = aiContent.replace(/Sei Hitchy/g, 'Sei Houni AI');
fs.writeFileSync(aiExtractor, aiContent, 'utf-8');

console.log('All files fixed');
