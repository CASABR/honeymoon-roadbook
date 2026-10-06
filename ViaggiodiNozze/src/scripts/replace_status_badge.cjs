const fs = require('fs');
const path = require('path');

const cardsDir = path.join(__dirname, '..', '..', '..', 'ViaggiodiNozze', 'src', 'components', 'cards');
const cardFiles = fs.readdirSync(cardsDir).filter(f => f.endsWith('Card.tsx'));

for (const file of cardFiles) {
  const filePath = path.join(cardsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Find the handleToggleComplete block and replace the button
  // We need to know the variable name for `.completed`.
  // Alloggio: accommodation.completed
  // Ristorante: ristorante.completed
  // Attivita: activity.completed
  // Trasporto: transport.completed
  // Shopping: shopping.completed
  // Tappa: tappa.completed

  let varName = '';
  if (file === 'AlloggioCard.tsx') varName = 'accommodation';
  if (file === 'RistoranteCard.tsx') varName = 'ristorante';
  if (file === 'AttivitaCard.tsx') varName = 'activity';
  if (file === 'TrasportoCard.tsx') varName = 'transport';
  if (file === 'ShoppingCard.tsx') varName = 'shopping';
  if (file === 'TappaCard.tsx') varName = 'tappa';

  if (!varName) continue;

  const buttonRegex = new RegExp(`<button\\s+type="button"\\s+onClick=\\{handleToggleComplete\\}\\s+className=\\{[\\s\\S]*?<\\/svg>\\s*\\)\\}\\s*<\\/button>`, 'g');
  
  const newButton = `<button
    type="button"
    onClick={handleToggleComplete}
    className={\`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all \${
      ${varName}.completed
        ? 'bg-[#E6F4EA] text-[#39734A] dark:bg-[#143521] dark:text-[#4ADE80] border-transparent dark:border-[#235835]'
        : 'bg-[#FFFDF2] text-[#172033] border-[#FFC857]/40 dark:bg-[#382C0E] dark:text-[#FDE047] dark:border-[#785912]'
    }\`}
  >
    {${varName}.completed ? '✓ Confermato' : 'Da Saldare'}
  </button>`;

  // Some cards might have slightly different button regex due to differences, so let's just do a more generic replacement
  // Actually, I can just replace the whole `<button ... > ... </button>` before `<h3`
  
  const blockRegex = new RegExp(`<button\\s+type="button"\\s+onClick=\\{handleToggleComplete\\}[\\s\\S]*?<\\/button>\\s*<h3`, 'g');
  
  const replacement = newButton + '\n            <h3';

  content = content.replace(blockRegex, replacement);

  fs.writeFileSync(filePath, content);
}
console.log('Status badges applied');
