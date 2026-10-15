const fs = require('fs');

let content = fs.readFileSync('src/components/cards/TrasportoCard.tsx', 'utf8');

const regex = /\{transport\.cost \? \(\s*<span className="text-slate-900 dark:text-slate-100 font-semibold bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md">\s*\{transport\.cost\}\s*<\/span>\s*\) : \(/;

const replacementStr = `{transport.cost === '0.00' || transport.cost === '0' || transport.cost === 0 ? (
              <span className="text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-100 px-2 py-1 rounded-md">
                Incluso nel pacchetto
              </span>
            ) : transport.cost ? (
              <span className="text-slate-900 dark:text-slate-100 font-semibold bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md">
                {transport.cost}
              </span>
            ) : (`;

if (regex.test(content)) {
    content = content.replace(regex, replacementStr);
    fs.writeFileSync('src/components/cards/TrasportoCard.tsx', content, 'utf8');
    console.log('TrasportoCard successfully patched!');
} else {
    console.log('Regex did not match in TrasportoCard.tsx');
}
