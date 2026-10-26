// @ts-check
/**
 * Test di validazione: Admin Console, UX Compatta e Hounigo Trail Icons
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- INIZIO VERIFICA AUTOMATIZZATA SPRINT ADMIN & TRAIL ICONS ---');

// 1. Verifica TrailIcons.tsx
const iconsPath = path.join(__dirname, '..', 'src', 'components', 'icons', 'TrailIcons.tsx');
assert(fs.existsSync(iconsPath), 'File TrailIcons.tsx non trovato!');
const iconsContent = fs.readFileSync(iconsPath, 'utf-8');

const requiredIcons = [
  'TrailOggi',
  'TrailItinerario',
  'TrailTappe',
  'TrailAttivita',
  'TrailAlloggi',
  'TrailTrasporti',
  'TrailPrenotazioni',
  'TrailBagagli',
  'TrailSpese',
  'TrailLive',
  'TrailCopiloti',
  'TrailImpostazioni'
];

for (const iconName of requiredIcons) {
  assert(iconsContent.includes(`export function ${iconName}`), `Icona richiesta mancante: ${iconName}`);
}
console.log(`✓ Tutte le ${requiredIcons.length} icone prioritarie sono esportate in TrailIcons.tsx`);

// Verifica viewBox 24x24 e attributi SVG
assert(iconsContent.includes('viewBox="0 0 24 24"'), 'Le icone devono usare la griglia standard 24x24');
assert(iconsContent.includes('strokeLinecap="round"'), 'Le icone devono usare tratti arrotondati');
assert(iconsContent.includes('active'), 'Le icone devono supportare lo stato active');
console.log('✓ Griglia 24x24, tratti arrotondati e supporto active verificati');

// 2. Verifica TrailIconsShowcaseModal.tsx (Tavola di confronto vecchio vs nuovo)
const showcasePath = path.join(__dirname, '..', 'src', 'components', 'icons', 'TrailIconsShowcaseModal.tsx');
assert(fs.existsSync(showcasePath), 'File TrailIconsShowcaseModal.tsx non trovato!');
const showcaseContent = fs.readFileSync(showcasePath, 'utf-8');
assert(showcaseContent.includes('Hounigo Trail Icons'), 'Titolo showcase deve menzionare Hounigo Trail Icons');
assert(showcaseContent.includes('Prima'), 'La tavola deve mostrare le icone precedenti (Prima)');
assert(showcaseContent.includes('Normale'), 'La tavola deve mostrare le nuove trail icons in stato Normale');
assert(showcaseContent.includes('Attivo'), 'La tavola deve mostrare le nuove trail icons in stato Attivo');
console.log('✓ Tavola comparativa vecchio vs nuovo (TrailIconsShowcaseModal) verificata');

// 3. Verifica Integrazione TrailIcons in NavBar, CategorieBar, AltroView
const navBarPath = path.join(__dirname, '..', 'src', 'components', 'NavBar.tsx');
const navBarContent = fs.readFileSync(navBarPath, 'utf-8');
assert(navBarContent.includes('TrailItinerario'), 'NavBar deve usare TrailItinerario');
assert(navBarContent.includes('TrailMappa'), 'NavBar deve usare TrailMappa');
assert(navBarContent.includes('TrailCategorie'), 'NavBar deve usare TrailCategorie');
assert(navBarContent.includes('TrailToolkit'), 'NavBar deve usare TrailToolkit');
console.log('✓ NavBar integrata con TrailIcons');

const altroViewPath = path.join(__dirname, '..', 'src', 'views', 'AltroView.tsx');
const altroViewContent = fs.readFileSync(altroViewPath, 'utf-8');
assert(altroViewContent.includes('TrailIconsShowcaseModal'), 'AltroView deve includere il modale showcase delle icone');
assert(altroViewContent.includes('TrailLive'), 'AltroView deve usare TrailLive');
assert(altroViewContent.includes('TrailCopiloti'), 'AltroView deve usare TrailCopiloti');
console.log('✓ AltroView integrata con TrailIcons e link a showcase');

// 4. Verifica AdminDashboardView.tsx (Paginazione, 4 stati, istruzioni system_admins)
const adminViewPath = path.join(__dirname, '..', 'src', 'views', 'altro', 'AdminDashboardView.tsx');
const adminViewContent = fs.readFileSync(adminViewPath, 'utf-8');
assert(adminViewContent.includes('pageSize, setPageSize] = useState<number>(25)'), 'pageSize predefinito deve essere 25');
assert(adminViewContent.includes('system_admins'), 'Istruzioni console devono citare la collezione system_admins');
assert(adminViewContent.includes('role: "admin"'), 'Istruzioni console devono citare il campo role: "admin"');
assert(adminViewContent.includes('Per pagina:'), 'La tabella deve includere il selettore elementi per pagina');
console.log('✓ AdminDashboardView: default 25 elementi per pagina, selettore e istruzioni esatte Firebase Console verificati');

// 5. Verifica UX Compatta (riduzione testo e gergo tecnico)
const roleModalPath = path.join(__dirname, '..', 'src', 'components', 'common', 'DeviceRoleModal.tsx');
const roleModalContent = fs.readFileSync(roleModalPath, 'utf-8');
assert(!roleModalContent.includes('Geolocation API'), 'DeviceRoleModal non deve contenere gergo Geolocation API');
assert(roleModalContent.includes('Trasmette la posizione del viaggio e gestisce le tappe in tempo reale.'), 'Descrizione guida compatta presente');
console.log('✓ DeviceRoleModal: testo snello e assenza di gergo tecnico verificati');

const onboardingPath = path.join(__dirname, '..', 'src', 'views', 'OnboardingView.tsx');
const onboardingContent = fs.readFileSync(onboardingPath, 'utf-8');
assert(onboardingContent.includes('Crea un nuovo viaggio'), 'Onboarding: titolo compatto Crea un nuovo viaggio');
assert(onboardingContent.includes('Accedi al tuo account'), 'Onboarding: titolo compatto Accedi al tuo account');
assert(!onboardingContent.includes('Multi-dispositivo)'), 'Onboarding: rimosso sottotitolo prolisso');
console.log('✓ OnboardingView: testo compatto e assenza di prolissità verificati');

console.log('--- TUTTI I TEST AUTOMATIZZATI SONO SUPERATI CON SUCCESSO! ---');
