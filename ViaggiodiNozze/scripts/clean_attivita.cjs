const fs = require('fs');

const targetFile = 'src/components/cards/AttivitaCard.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

content = content.replace(/const categoryLabels.*?\};\s*const icon = categoryLabels\[activity\.category\] \|\| '📌';/gs, "const icon = '📌';");

content = content.replace(/\{activity\.platform && \(\s*<span className="inline-flex items-center text-\[9px\] font-bold px-2 py-0\.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">\s*\{activity\.platform\}\s*<\/span>\s*\)\}/g, '');

fs.writeFileSync(targetFile, content, 'utf8');
console.log("Cleaned AttivitaCard.tsx");
