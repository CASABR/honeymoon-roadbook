const fs = require('fs');

// We simulate lookup
const KNOWN = {
  auckland: { lat: -36.8485, lng: 174.7633 },
  rotorua: { lat: -38.1368, lng: 176.2497 },
  taupo: { lat: -38.6857, lng: 176.0702 },
  tongariro: { lat: -39.2906, lng: 175.5626 },
  wellington: { lat: -41.2865, lng: 174.7762 },
  picton: { lat: -41.2931, lng: 174.0041 },
  abel_tasman: { lat: -40.9419, lng: 173.0189 },
  kaiteriteri: { lat: -41.0378, lng: 173.0177 },
  punakaiki: { lat: -42.1158, lng: 171.3325 },
  franz_josef: { lat: -43.3887, lng: 170.1834 },
  fox_glacier: { lat: -43.4646, lng: 170.0182 },
  wanaka: { lat: -44.7032, lng: 169.1321 },
  queenstown: { lat: -45.0312, lng: 168.6626 },
  milford_sound: { lat: -44.6718, lng: 167.9256 },
  te_anau: { lat: -45.4145, lng: 167.7176 },
  lake_tekapo: { lat: -44.0047, lng: 170.4771 },
  mount_cook: { lat: -43.7342, lng: 170.0963 },
  christchurch: { lat: -43.5321, lng: 172.6362 },
  kaikoura: { lat: -42.4008, lng: 173.6814 },
  adelaide: { lat: -34.9285, lng: 138.6007 },
  kangaroo_island: { lat: -35.7752, lng: 137.2142 },
  penneshaw: { lat: -35.7197, lng: 137.9406 },
  kingscote: { lat: -35.6558, lng: 137.6402 },
  melbourne: { lat: -37.8136, lng: 144.9631 },
  sydney: { lat: -33.8688, lng: 151.2093 },
  manila: { lat: 14.5995, lng: 120.9842 },
  boracay: { lat: 11.9674, lng: 121.9248 },
  caticlan: { lat: 11.9298, lng: 121.9532 },
  el_nido: { lat: 11.1804, lng: 119.3879 },
  coron: { lat: 12.0006, lng: 120.2057 },
  busuanga: { lat: 12.1214, lng: 120.1003 },
  cebu: { lat: 10.3157, lng: 123.8854 },
  bohol: { lat: 9.8500, lng: 124.1435 },
  panglao: { lat: 9.5786, lng: 123.7744 },
  siargao: { lat: 9.8576, lng: 126.0469 },
  pechino: { lat: 40.0799, lng: 116.6031 },
  milano: { lat: 45.4642, lng: 9.1900 },
  duomo: { lat: 45.4641, lng: 9.1896 },
  suzzani: { lat: 45.5085, lng: 9.2045 },
  malpensa: { lat: 45.6301, lng: 8.7255 },
  roma: { lat: 41.9028, lng: 12.4964 },
  waitomo: { lat: -38.2612, lng: 175.1186 },
  hobbiton: { lat: -37.8721, lng: 175.6829 },
  matamata: { lat: -37.8093, lng: 175.7725 },
  waiotapu: { lat: -38.3582, lng: 176.3683 },
  whakarewarewa: { lat: -38.1636, lng: 176.2575 },
  te_puia: { lat: -38.1604, lng: 176.2527 },
  hokitika: { lat: -42.7167, lng: 170.9667 },
  haast: { lat: -43.8810, lng: 169.0422 },
  arrowtown: { lat: -44.9426, lng: 168.8285 },
  glenorchy: { lat: -44.8507, lng: 168.3887 },
  moeraki: { lat: -45.3614, lng: 170.8497 },
  dunedin: { lat: -45.8788, lng: 170.5028 },
  akaroa: { lat: -43.8037, lng: 172.9683 },
  hamer: { lat: -42.5230, lng: 172.8277 },
  hanmer_springs: { lat: -42.5230, lng: 172.8277 },
  barossa: { lat: -34.5333, lng: 138.9500 },
  yarra_valley: { lat: -37.7500, lng: 145.4167 },
  blue_mountains: { lat: -33.7150, lng: 150.3120 },
  katoomba: { lat: -33.7126, lng: 150.3119 },
  mutianyu: { lat: 40.4319, lng: 116.5704 },
  tiananmen: { lat: 39.9055, lng: 116.3976 },
  forbiddencity: { lat: 39.9163, lng: 116.3972 }
};

function lookup(text) {
  if (!text) return null;
  const clean = String(text).toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (KNOWN[w]) return KNOWN[w];
  }
  for (const [key, coord] of Object.entries(KNOWN)) {
    if (key.length <= 3) continue;
    const keySpaced = key.replace(/_/g, ' ');
    if (clean.includes(keySpaced)) return coord;
  }
  return null;
}

// Test against seedTappe
const tappeSrc = fs.readFileSync('src/storage/seedTappe.ts', 'utf8');
const tappeMatches = [...tappeSrc.matchAll(/titolo:\s*[`"']([^`"']+)`["'][\s\S]*?indirizzo:\s*[`"']([^`"']+)`["']/g)];
let matched = 0;
let missed = [];
for (const m of tappeMatches) {
  const coord = lookup(m[2]) || lookup(m[1]);
  if (coord) matched++;
  else missed.push({ titolo: m[1], indirizzo: m[2] });
}
console.log('Tappe tested:', tappeMatches.length, 'Matched:', matched, 'Missed:', missed.length);
console.log('Sample missed tappe:', missed.slice(0, 10));
