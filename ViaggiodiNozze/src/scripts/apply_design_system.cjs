const fs = require('fs');
const path = require('path');

const cardsDir = path.join(__dirname, '..', '..', '..', 'ViaggiodiNozze', 'src', 'components', 'cards');
const cardFiles = fs.readdirSync(cardsDir).filter(f => f.endsWith('Card.tsx'));

const containerRegex = /<div onClick=\{onEdit\}[^>]*className=\{`[^`]+`\}[^>]*>/;
const newContainer = `<div onClick={onEdit} className="cursor-pointer rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3 relative active:scale-[0.99] bg-[#FFFFFF] dark:bg-[#1E293B] border-[#ECEAE5] dark:border-slate-700">`;

for (const file of cardFiles) {
  const filePath = path.join(cardsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace container
  content = content.replace(containerRegex, newContainer);

  // Replace old text colors to new design system text colors
  // Replace generic text-slate-800/900 with text-[#172033] dark:text-slate-50
  content = content.replace(/\btext-slate-[89]00\b/g, 'text-[#172033] dark:text-slate-50');
  
  // Replace generic text-slate-500/600 with text-[#64748B] dark:text-slate-400
  content = content.replace(/\btext-slate-[56]00\b/g, 'text-[#64748B] dark:text-slate-400');
  
  // Replace Maps button
  // Light -> bg-[#DDF4F5] text-[#172033] | Dark -> bg-[#164E63] text-[#E0F2FE]
  content = content.replace(
    /className="([^"]*bg-sky-50[^"]*text-sky-700[^"]*)"/g,
    `className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors bg-[#DDF4F5] text-[#172033] hover:bg-[#cdeef0] dark:bg-[#164E63] dark:text-[#E0F2FE]"`
  );
  content = content.replace(
    /className="([^"]*bg-blue-50[^"]*text-blue-700[^"]*)"/g,
    `className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors bg-[#DDF4F5] text-[#172033] hover:bg-[#cdeef0] dark:bg-[#164E63] dark:text-[#E0F2FE]"`
  );

  // Secondary buttons (PNR, Chiama, etc)
  // bg-white border border-slate-200 text-[#172033] | Dark -> bg-slate-800/80 border border-slate-700 text-slate-200
  content = content.replace(
    /className="([^"]*bg-white[^"]*text-slate-700[^"]*border[^"]*)"/g,
    `className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors bg-white border border-slate-200 text-[#172033] hover:bg-slate-50 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"`
  );

  // Status badges: "Saldato / Confermato" (completed)
  // Light -> bg-[#E6F4EA] text-[#39734A] | Dark -> bg-[#143521] text-[#4ADE80] border border-[#235835]
  // We need to inject the logic where completion check box is. Usually it's a button.
  // Wait, let's leave the completion logic manual because it's complex and differs per file.

  // Remove full-width colored header from AlloggioCard
  if (file === 'AlloggioCard.tsx') {
    content = content.replace(/border-b border-indigo-50\/80/g, '');
  }

  fs.writeFileSync(filePath, content);
}
console.log('Design System baseline applied');
