const fs = require('fs');
const path = require('path');

const file = path.join('src', 'views', 'altro', 'SpeseBudgetView.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Fix the type error 'completato' -> 'saldato'
content = content.replace(
  /const newStatus = isFullyPaid \? 'da_saldare' : 'completato';/g,
  "const newStatus = isFullyPaid ? 'da_saldare' : 'saldato';"
);

// 2. Add the onClick handlers using regex
content = content.replace(
  /<span className="text-emerald-600 bg-emerald-50 px-1\.5 py-0\.5 rounded-full">/g,
  '<span onClick={(ev) => handleTogglePaidStatus(item, ev)} className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-emerald-100 transition-colors shadow-xs hover:shadow-sm">'
);

content = content.replace(
  /<span className="text-amber-600 bg-amber-50 px-1\.5 py-0\.5 rounded-full">/g,
  '<span onClick={(ev) => handleTogglePaidStatus(item, ev)} className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-amber-100 transition-colors shadow-xs hover:shadow-sm">'
);

content = content.replace(
  /<span className={`text-\[10px\] font-bold px-2 py-0\.5 rounded-full inline-block mt-0\.5 \$\{isFullyPaid \? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"\}`}>\s*(.*?)\s*<\/span>/,
  '<span onClick={(ev) => handleTogglePaidStatus(item, ev)} className={`cursor-pointer hover:opacity-80 active:scale-95 transition-all text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 shadow-xs hover:shadow-sm ${isFullyPaid ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200"}`}>\n                  $1\n                </span>'
);

fs.writeFileSync(file, content, 'utf8');
console.log('SpeseBudgetView successfully patched!');
