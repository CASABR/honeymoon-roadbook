const fs = require('fs');

let content = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

const regex = /\{isPartiallyPaid \? \(\s*<div className="flex items-center gap-2 text-\[10px\] font-bold">/;
const replacementStr = `{item.cost === 0 && item.category === 'trasporti' ? (
                <span className="cursor-default text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 shadow-xs bg-sky-50 text-sky-700 border border-sky-200">
                  Incluso nel pacchetto
                </span>
              ) : item.cost === 0 ? (
                <span className="cursor-default text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 shadow-xs bg-slate-50 text-slate-600 border border-slate-200">
                  Gratuito
                </span>
              ) : isPartiallyPaid ? (
                <div className="flex items-center gap-2 text-[10px] font-bold">`;

if (regex.test(content)) {
    content = content.replace(regex, replacementStr);
    fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', content, 'utf8');
    console.log('SpeseBudgetView successfully patched!');
} else {
    console.log('Regex did not match in SpeseBudgetView.tsx');
}
