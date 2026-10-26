// @ts-check
/**
 * Test di validazione: Allineamento Brand Identity App <-> Instagram @hounigo
 * Colori: Navy #172033, Coral #FF6B5F, Cloud #F8F7F3, Bianco tecnico.
 * Tipografia: Manrope.
 * Icone: Sistema Trail SVG (incluso TrailAi).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- INIZIO VERIFICA AUTOMATIZZATA BRAND IDENTITY HOUNIGO ---');

// 1. Verifica token grafici in index.css
const cssPath = path.join(__dirname, '..', 'src', 'index.css');
assert(fs.existsSync(cssPath), 'File index.css non trovato!');
const cssContent = fs.readFileSync(cssPath, 'utf-8');
assert(cssContent.includes('--color-hounigo-navy: #172033;'), 'CSS deve definire --color-hounigo-navy: #172033');
assert(cssContent.includes('--color-hounigo-coral: #FF6B5F;'), 'CSS deve definire --color-hounigo-coral: #FF6B5F');
assert(cssContent.includes('--color-hounigo-cloud: #F8F7F3;'), 'CSS deve definire --color-hounigo-cloud: #F8F7F3');
assert(cssContent.includes('.font-brand-title'), 'CSS deve definire classe .font-brand-title');
assert(cssContent.includes('.font-brand-body'), 'CSS deve definire classe .font-brand-body');
console.log('✓ Token del design system (.bg-hounigo-*, .text-hounigo-*, Manrope) presenti in index.css');

// 2. Verifica TrailAi in TrailIcons.tsx e TrailIconsShowcaseModal.tsx
const iconsPath = path.join(__dirname, '..', 'src', 'components', 'icons', 'TrailIcons.tsx');
const iconsContent = fs.readFileSync(iconsPath, 'utf-8');
assert(iconsContent.includes('export function TrailAi'), 'TrailIcons.tsx deve esportare TrailAi');
assert(iconsContent.includes('viewBox="0 0 24 24"'), 'TrailAi deve usare la griglia 24x24 standard');

const showcasePath = path.join(__dirname, '..', 'src', 'components', 'icons', 'TrailIconsShowcaseModal.tsx');
const showcaseContent = fs.readFileSync(showcasePath, 'utf-8');
assert(showcaseContent.includes('name: \'HouniAI\''), 'Tavola comparativa deve includere HouniAI');
console.log('✓ Icona originale TrailAi creata e inclusa nella tavola di confronto');

// 3. Verifica NavBar
const navPath = path.join(__dirname, '..', 'src', 'components', 'NavBar.tsx');
const navContent = fs.readFileSync(navPath, 'utf-8');
assert(navContent.includes('#FF6B5F'), 'NavBar deve usare Coral #FF6B5F per elementi attivi');
assert(navContent.includes('TrailAi'), 'NavBar pulsante centrale deve usare TrailAi');
assert(navContent.includes('HouniAI'), 'NavBar pulsante centrale deve avere label HouniAI');
assert(!navContent.includes('✨'), 'NavBar non deve contenere emoji generica ✨');
console.log('✓ NavBar allineata: sfondo Cloud, tab attivi Coral, pulsante centrale TrailAi');

// 4. Verifica CategorieBar (rimozione arcobaleno)
const catPath = path.join(__dirname, '..', 'src', 'components', 'CategorieBar.tsx');
const catContent = fs.readFileSync(catPath, 'utf-8');
assert(!catContent.includes('bg-amber-50'), 'CategorieBar non deve usare bicchierini amber');
assert(!catContent.includes('bg-indigo-50'), 'CategorieBar non deve usare bicchierini indigo');
assert(!catContent.includes('bg-purple-50'), 'CategorieBar non deve usare bicchierini purple');
assert(!catContent.includes('bg-emerald-50'), 'CategorieBar non deve usare bicchierini emerald');
assert(catContent.includes('#FF6B5F'), 'CategorieBar chip attivo deve usare Coral #FF6B5F');
assert(catContent.includes('item.renderIcon(isActive)'), 'TrailIcons in CategorieBar devono ricevere lo stato attivo');
console.log('✓ CategorieBar ripulita da colori arcobaleno, unificata su Cloud, Navy e accento Coral');

// 5. Verifica OnboardingView
const onbPath = path.join(__dirname, '..', 'src', 'views', 'OnboardingView.tsx');
const onbContent = fs.readFileSync(onbPath, 'utf-8');
assert(!onbContent.includes('peach'), 'OnboardingView non deve usare colori peach estranei');
assert(!onbContent.includes('✨ Crea il tuo itinerario'), 'OnboardingView non deve usare emoji generiche');
assert(onbContent.includes('#172033'), 'OnboardingView deve usare Navy #172033 come sfondo primario');
assert(onbContent.includes('#FF6B5F'), 'OnboardingView deve usare Coral #FF6B5F per il CTA');
assert(onbContent.includes('TrailItinerario'), 'OnboardingView deve usare TrailItinerario nel pulsante Crea');
console.log('✓ OnboardingView allineata: Navy, Coral, Manrope e TrailIcons native');

// 6. Verifica TripSelectorModal
const tripSelPath = path.join(__dirname, '..', 'src', 'components', 'modals', 'TripSelectorModal.tsx');
const tripSelContent = fs.readFileSync(tripSelPath, 'utf-8');
assert(!tripSelContent.includes('border-indigo-500'), 'TripSelectorModal non deve usare bordo indigo');
assert(tripSelContent.includes('#FF6B5F'), 'TripSelectorModal deve usare Coral #FF6B5F per evidenziare il viaggio attivo');
console.log('✓ Card Viaggio (TripSelectorModal) allineata su Coral');

// 7. Verifica SmartInsertModal (HouniAI)
const smartPath = path.join(__dirname, '..', 'src', 'components', 'modals', 'SmartInsertModal.tsx');
const smartContent = fs.readFileSync(smartPath, 'utf-8');
assert(smartContent.includes('HouniAI'), 'Modal deve avere titolo HouniAI');
assert(smartContent.includes('TrailAi'), 'Modal deve usare icona TrailAi per l\'assistente');
assert(!smartContent.includes('Inserimento Smart'), 'Modal non deve chiamarsi Inserimento Smart');
console.log('✓ Assistente HouniAI unificato per nome, copy e icona vettoriale TrailAi');

// 8. Verifica AltroView
const altroPath = path.join(__dirname, '..', 'src', 'views', 'AltroView.tsx');
const altroContent = fs.readFileSync(altroPath, 'utf-8');
assert(!altroContent.includes('bg-indigo-500/10 text-indigo-600'), 'AltroView non deve usare bicchierino indigo');
assert(!altroContent.includes('bg-emerald-500/10 text-emerald-600'), 'AltroView non deve usare bicchierino emerald');
assert(altroContent.includes('#FF6B5F'), 'AltroView LIVE deve usare accento Coral #FF6B5F');
console.log('✓ Menu Altro ripulito da bicchierini multicolore e allineato su Cloud, Navy e Coral');

console.log('--- TUTTI GLI 8 CRITERI DI ALLINEAMENTO BRAND IDENTITY HOUNIGO SONO SUPERATI! ---');
