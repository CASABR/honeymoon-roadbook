const fs = require('fs');
const file_path = 'src/views/altro/SpeseBudgetView.tsx';
let content = fs.readFileSync(file_path, 'utf8');

content = content.replace(
    /\{manualItems\.length === 0 &&\s*alloggiItems\.length === 0 &&\s*trasportiItems\.length === 0 \? \(/g,
    '{manualItems.length === 0 && alloggiItems.length === 0 && trasportiItems.length === 0 && attivitaItems.length === 0 && ristorantiItems.length === 0 ? ('
);

fs.writeFileSync(file_path, content);
