const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const logo = read('src/components/common/HounigoMotionLogo.tsx');
const logoCss = read('src/components/common/HounigoMotionLogo.css');
const splash = read('src/components/common/HounigoAppSplash.tsx');
const main = read('src/main.tsx');
const live = read('src/views/altro/LiveEditorialExperience.tsx');
const transport = read('src/components/cards/TrasportoCard.tsx');
const today = read('src/views/OggiView.tsx');
const globalCss = read('src/index.css');

assert.match(logo, /M89 105H91L94 101L106 96H121/, 'La H deve usare il tracciato vettoriale ufficiale fornito');
assert.match(logo, /M328 154H351V194L366 185/, 'Il wordmark deve usare il tracciato vettoriale fornito');
assert.match(logo, /HOUNIGO_MOTION_DURATION_MS = 2200/, 'Lo splash deve restare sotto 2,4 secondi');
assert.doesNotMatch(logo + logoCss + splash, /https?:\/\/|<video|\.mp4|\.webm/, 'Lo splash non deve dipendere da asset remoti o video');
assert.match(splash, /hounigo_motion_splash_seen_v1/, 'Lo splash deve apparire una volta per sessione');
assert.match(splash, /Salta animazione iniziale/, 'Lo splash deve essere chiudibile');
assert.match(main, /<HounigoAppSplash \/>[\s\S]*<BrowserRouter/, 'App e splash devono avviarsi insieme senza bloccare il router');
assert.match(logoCss, /prefers-reduced-motion: reduce/, 'Il logo deve rispettare reduced motion');
assert.match(logoCss, /pointer-events: none/, 'L overlay non deve bloccare l app sottostante');

assert.match(live, /hounigo-live-entry/, 'LIVE deve avere un ingresso editoriale singolo');
assert.match(live, /shouldSmoothRealMarker/, 'Il marker reale deve interpolare solo aggiornamenti validi');
assert.match(live, /accuracy \?\? Number\.POSITIVE_INFINITY\) <= 100/, 'Coordinate inaccurate non devono essere interpolate');
assert.match(live, /Math\.hypot\([\s\S]*\) <= 120/, 'Salti eccessivi del marker non devono essere interpolati');
assert.match(live, /setPhotoRevealVersion\(version => version \+ 1\)/, 'Il reveal foto deve partire dopo il salvataggio');
assert.ok(live.indexOf('await props.onUploadPhoto') < live.lastIndexOf('setPhotoRevealVersion'), 'Il reveal foto non deve precedere il salvataggio');
assert.match(transport, /hounigo-transport-route/, 'La tratta deve animarsi una sola volta al mount della card');
assert.match(today, /hounigo-timeline-item/, 'La timeline Oggi deve usare una transizione breve');
assert.match(globalCss, /prefers-reduced-motion: reduce[\s\S]*hounigo-live-marker-transition/, 'Le motion funzionali devono rispettare reduced motion');
assert.doesNotMatch(globalCss, /hounigoGpsConfirmed[^}]*infinite/, 'Il feedback GPS non deve essere continuo');

console.log('✓ Motion identity, splash offline e micro-motion funzionali verificati.');
