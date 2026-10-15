const fs = require('fs');
const path = require('path');
const f = path.join('src', 'components', 'cards', 'AlloggioCard.tsx');
let c = fs.readFileSync(f, 'utf8');

// Replace all multiple useState imports
while (c.match(/import \{ useState \} from 'react';\nimport \{ useState \} from 'react';/)) {
    c = c.replace(/import \{ useState \} from 'react';\nimport \{ useState \} from 'react';/g, "import { useState } from 'react';");
}

// Make sure onUpdate is properly destructured and typed
// Current signature: export default function AlloggioCard({ accommodation, onEdit }: AlloggioCardProps) {
// I previously tried to change it but I guess it didn't stick or the onUpdate was not available.
c = c.replace(/export default function AlloggioCard\(\{ accommodation, onEdit[^\)]*\}[^\)]*\)\s*\{/m, "export default function AlloggioCard({ accommodation, onEdit, onUpdate }: AlloggioCardProps & { onUpdate?: (updated: any) => void }) {");

// Also check for the exact line
if (c.includes('{ accommodation, onEdit, onUpdate }: AlloggioCardProps & { onUpdate?: (updated: Alloggio) => void }')) {
    // it was already patched but maybe onUpdate was still not found?
    c = c.replace(/\{ accommodation, onEdit, onUpdate \}: AlloggioCardProps & \{ onUpdate\?: \(updated: Alloggio\) => void \}/g, "{ accommodation, onEdit, onUpdate }: AlloggioCardProps & { onUpdate?: (updated: any) => void }");
} else if (c.includes('{ accommodation, onEdit, onUpdate }: AlloggioCardProps')) {
    c = c.replace(/\{ accommodation, onEdit, onUpdate \}: AlloggioCardProps/g, "{ accommodation, onEdit, onUpdate }: AlloggioCardProps & { onUpdate?: (updated: any) => void }");
} else if (c.includes('{ accommodation, onEdit }: AlloggioCardProps')) {
    c = c.replace(/\{ accommodation, onEdit \}: AlloggioCardProps/g, "{ accommodation, onEdit, onUpdate }: AlloggioCardProps & { onUpdate?: (updated: any) => void }");
}

fs.writeFileSync(f, c, 'utf8');
console.log('Fixed AlloggioCard');
