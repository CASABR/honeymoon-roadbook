const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');
code = code.replace(/\\`/g, '`');
code = code.replace(/\\\$/g, '$');
fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code, 'utf8');
console.log('Fixed all backslashes');
