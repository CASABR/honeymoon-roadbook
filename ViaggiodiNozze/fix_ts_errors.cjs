const fs = require('fs');
const path = require('path');

const dir = path.join('src', 'components', 'cards');

// 1. Fix AlloggioCard
let file = path.join(dir, 'AlloggioCard.tsx');
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/export default function AlloggioCard\(\{\s*accommodation,/g, "export default function AlloggioCard({ accommodation, onUpdate,");
content = content.replace(/\{accommodation\.completed \? '✓ Confermato' : 'Da Saldare'\}/g, "{accommodation.completed ? '✓ Saldato' : '⏳ Da saldare'}");
fs.writeFileSync(file, content, 'utf8');

// 2. Fix AttivitaCard
file = path.join(dir, 'AttivitaCard.tsx');
content = fs.readFileSync(file, 'utf8');
content = content.replace(/activity\.status === 'completato'/g, "activity.status === 'prenotata'");
content = content.replace(/status: isSaldato \? 'prenotato' : 'completato'/g, "status: isSaldato ? 'da_prenotare' : 'prenotata'");
fs.writeFileSync(file, content, 'utf8');

// 3. Fix TrasportoCard
file = path.join(dir, 'TrasportoCard.tsx');
content = fs.readFileSync(file, 'utf8');
content = content.replace(/transport\.notes/g, "(transport as any).notes");
fs.writeFileSync(file, content, 'utf8');

// 4. Fix unused vars in Ristorante, Shopping, Tappa
const others = ['RistoranteCard.tsx', 'ShoppingCard.tsx', 'TappaCard.tsx'];
for (const f of others) {
  file = path.join(dir, f);
  content = fs.readFileSync(file, 'utf8');
  content = content.replace(/import \{ storageService \} from '\.\.\/\.\.\/storage\/storageService';\r?\n/g, "");
  content = content.replace(/import UniversalCopilotaModal from '\.\.\/modals\/UniversalCopilotaModal';\r?\n/g, "");
  content = content.replace(/const \[isCopilotOpen, setIsCopilotOpen\] = useState\(false\);\r?\n/g, "");
  fs.writeFileSync(file, content, 'utf8');
}
console.log('Fixed TS errors!');
