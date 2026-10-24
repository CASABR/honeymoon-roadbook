/**
 * SPRINT 2/4: TEST SUITE DESIGN SYSTEM E TEMI
 * Verifica approfondita per:
 * A. Token semantici centralizzati (Light & Dark Mode)
 * B. Primitives riutilizzabili (.hounigo-card, .hounigo-button-*, .hounigo-badge-*, .hounigo-empty-state)
 * C. Accessibilità e focus ring (WCAG AA ratio, outline-offset, focus-visible)
 * D. Anti-flash e persistenza del tema (index.html, DarkModeToggle.tsx)
 * E. Assenza di override globali distruttivi su classi utility
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log('=== SPRINT 2/4 TEST SUITE: DESIGN SYSTEM E TEMI ===\n');

const cssPath = path.join(__dirname, '../src/index.css');
const cssContent = fs.readFileSync(cssPath, 'utf-8');

// -----------------------------------------------------------------------------
// 1. TEST A: Identità Brand & Token Semantici
// -----------------------------------------------------------------------------
runTest('A.1: Brand Identity presente (Navy, Coral, Cloud, Manrope)', () => {
  assert(cssContent.includes('#172033'), 'Navy (#172033) presente');
  assert(cssContent.includes('#FF6B5F'), 'Coral (#FF6B5F) presente');
  assert(cssContent.includes('#F8F7F3'), 'Cloud (#F8F7F3) presente');
  assert(cssContent.includes('Manrope'), 'Font Manrope configurato');
});

runTest('A.2: Token semantici Light Mode completi', () => {
  const lightTokens = [
    '--bg-app: #F8F7F3',
    '--surface-card: #ffffff',
    '--surface-card-subtle',
    '--surface-muted',
    '--surface-input',
    '--border-input',
    '--text-main: #172033',
    '--text-body',
    '--text-muted',
    '--border-subtle',
    '--border-card',
    '--accent-primary: #FF6B5F',
    '--status-success-bg',
    '--status-warning-bg',
    '--status-error-bg'
  ];
  for (const token of lightTokens) {
    assert(cssContent.includes(token), `Token Light ${token} deve essere presente`);
  }
});

runTest('A.3: Token semantici Dark Mode completi', () => {
  const darkTokens = [
    '--bg-app: #0f172a',
    '--surface-card: #1e293b',
    '--surface-input: #0f172a',
    '--border-input: #334155',
    '--text-main: #f8fafc',
    '--text-body: #e2e8f0',
    '--text-muted: #94a3b8',
    '--border-subtle: #334155',
    '--border-card: #334155'
  ];
  for (const token of darkTokens) {
    assert(cssContent.includes(token), `Token Dark ${token} deve essere presente`);
  }
});

// -----------------------------------------------------------------------------
// 2. TEST B: Componenti Condivisi e Primitives
// -----------------------------------------------------------------------------
runTest('B.1: Primitive card e pannelli (.hounigo-card, .hounigo-card-subtle, .hounigo-panel)', () => {
  assert(cssContent.includes('.hounigo-card {'), '.hounigo-card definita');
  assert(cssContent.includes('.hounigo-card-subtle {'), '.hounigo-card-subtle definita');
  assert(cssContent.includes('.hounigo-panel {'), '.hounigo-panel definita');
  assert(cssContent.includes('.hounigo-panel-muted {'), '.hounigo-panel-muted definita');
});

runTest('B.2: Primitive pulsanti (.hounigo-button-primary, .hounigo-button-secondary, .hounigo-button-ghost)', () => {
  assert(cssContent.includes('.hounigo-button-primary {'), '.hounigo-button-primary definita');
  assert(cssContent.includes('.hounigo-button-secondary {'), '.hounigo-button-secondary definita');
  assert(cssContent.includes('.hounigo-button-ghost {'), '.hounigo-button-ghost definita');
});

runTest('B.3: Primitive badge di stato (.hounigo-badge-*)', () => {
  assert(cssContent.includes('.hounigo-badge-neutral {'), '.hounigo-badge-neutral definita');
  assert(cssContent.includes('.hounigo-badge-coral {'), '.hounigo-badge-coral definita');
  assert(cssContent.includes('.hounigo-badge-success {'), '.hounigo-badge-success definita');
  assert(cssContent.includes('.hounigo-badge-warning {'), '.hounigo-badge-warning definita');
});

runTest('B.4: Primitiva stato vuoto (.hounigo-empty-state)', () => {
  assert(cssContent.includes('.hounigo-empty-state {'), '.hounigo-empty-state definita');
});

// -----------------------------------------------------------------------------
// 3. TEST C: Accessibilità & Contrasto WCAG AA
// -----------------------------------------------------------------------------
runTest('C.1: Focus ring visibile accessibile definito in CSS', () => {
  assert(cssContent.includes('focus-visible'), 'focus-visible presente per elementi interattivi');
  assert(cssContent.includes('outline: 2px solid'), 'Outline 2px per accessibilità presente');
});

// Calcolo luminosità relativa WCAG
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

runTest('C.2: Contrasto WCAG AA per testo principale su sfondo (Light e Dark)', () => {
  // Light: Text #172033 su Surface #FFFFFF e Background #F8F7F3
  const lightContrastSurface = getContrastRatio('#172033', '#ffffff');
  const lightContrastBg = getContrastRatio('#172033', '#F8F7F3');
  assert(lightContrastSurface >= 4.5, `Light surface ratio ${lightContrastSurface.toFixed(2)} deve essere >= 4.5`);
  assert(lightContrastBg >= 4.5, `Light bg ratio ${lightContrastBg.toFixed(2)} deve essere >= 4.5`);

  // Dark: Text #f8fafc su Surface #1e293b e Background #0f172a
  const darkContrastSurface = getContrastRatio('#f8fafc', '#1e293b');
  const darkContrastBg = getContrastRatio('#f8fafc', '#0f172a');
  assert(darkContrastSurface >= 4.5, `Dark surface ratio ${darkContrastSurface.toFixed(2)} deve essere >= 4.5`);
  assert(darkContrastBg >= 4.5, `Dark bg ratio ${darkContrastBg.toFixed(2)} deve essere >= 4.5`);
});

// -----------------------------------------------------------------------------
// 4. TEST D: Anti-Flash & Gestione Tema
// -----------------------------------------------------------------------------
runTest('D.1: index.html include script anti-flash con default Light', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  assert(htmlContent.includes("localStorage.getItem('houni_theme')"), 'Controllo houni_theme in index.html');
  assert(htmlContent.includes("document.documentElement.classList.remove('dark')"), 'Default Light mode verificato');
});

runTest('D.2: DarkModeToggle.tsx sincronizza stato e notifica con theme_changed', () => {
  const togglePath = path.join(__dirname, '../src/components/common/DarkModeToggle.tsx');
  const toggleContent = fs.readFileSync(togglePath, 'utf-8');
  assert(toggleContent.includes('localStorage.setItem(\'houni_theme\''), 'Persistenza su houni_theme');
  assert(toggleContent.includes('theme_changed'), 'Evento theme_changed emesso');
  assert(toggleContent.includes('dark:bg-slate-800'), 'Styling dark del toggle button');
});

// -----------------------------------------------------------------------------
// 5. TEST E: Pulizia CSS (Nessun override distruttivo)
// -----------------------------------------------------------------------------
runTest('E.1: Assenza di override globali generici su bg-white con !important', () => {
  assert(!cssContent.includes('html.dark .bg-white'), 'Nessun selettore forzato html.dark .bg-white');
  assert(!cssContent.includes('html.dark [class*="bg-white/"]'), 'Nessun selettore forzato html.dark [class*="bg-white/"]');
});

console.log(`\n=== RISULTATO: ${passedTests}/${totalTests} TEST SUPERATI CON SUCCESSO ===`);
if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
