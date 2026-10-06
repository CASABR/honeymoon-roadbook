# Piano di Uniformazione Design System Hounigo

## Obiettivo
Sradicare ogni colore legacy (Emerald, Indigo, Violet, Fuchsia, gradienti) e riallineare tutti i componenti "orfani" al Design System ufficiale, rispettando rigorosamente le regole semantiche imposte:

- **Coral (`#FF6B5F`)**: Brand, CTA primarie, Live, Houni AI.
- **Sky (`#DDF4F5` e `#F0FAF9`)**: Informazioni, mappe, componenti secondari.
- **Sun (`#FFC857` e `#FFFDF2`)**: Avvisi, check e acconti. Testo in Navy.
- **Sage (`#E6F4EA`)**: Esclusivamente successo, completato, saldato.
- **Navy (`#172033`) / Slate (`#64748B`)**: Gerarchia testuale.

## Componenti da modificare e Sostituzioni Previste

### 1. `index.html` e `src/index.css`
- **Modifiche**: 
  - `theme-color` nel meta tag: da `#10b981` (emerald) a `#FF6B5F` (Coral).
  - Variabili root in `index.css`: Eliminare i riferimenti hardcoded all'emerald e settare la base del tema su Coral.

### 2. Modali e Menu Globali
- **`src/components/common/AddMenu.tsx`**:
  - `bg-gradient-to-r from-violet-600 to-indigo-600` ➔ `bg-[#FF6B5F]` (Coral).
- **`src/components/modals/SmartInsertModal.tsx` (Inserimento IA)**:
  - Header sfumato (indigo/violet) ➔ Solido Sky Tint (`#F0FAF9`) o White, testo Navy.
  - Tasto CTA "Aggiungi con Houni AI" (violet/indigo gradient) ➔ Coral (`#FF6B5F`).
  - Tasti conferma (emerald gradient) ➔ Coral (`#FF6B5F`) o Sky.
- **`src/components/modals/WalkthroughModal.tsx`**:
  - Gradienti decorativi (indigo/violet) ➔ Sky / Coral tint.
- **`src/components/NavBar.tsx`**:
  - Pulsante centrale "Houni AI" (gradient violet) ➔ Coral (`#FF6B5F`).
  - Icone tab attive (emerald) ➔ Coral. Testo in Navy/Slate.

### 3. Viste Principali (Da ripulire dall'Emerald)
- **`src/views/OggiView.tsx`**:
  - CTA "Nuova Spesa" (emerald) ➔ Coral.
  - Gradienti decorativi (rose/violet) ➔ Rimossi, uso sfondi Sky Tint o White solid.
  - Header e sfondi budget ➔ Navy o Sky Tint.
- **`src/views/altro/SpeseBudgetView.tsx`**:
  - `bg-emerald-500/100` e varianti per CTA ➔ Coral per i pulsanti.
  - Saldo Positivo ➔ Mantenuto in Sage (`#E6F4EA` / `text-emerald-700`) in quanto rappresenta "successo/positivo".
- **`src/views/altro/LiveView.tsx`**:
  - Badge e status "Live" (emerald) ➔ Coral (regola aurea: "LIVE = Coral").
  - Gradienti bg (sky/indigo) ➔ Sky Tint o Cloud.
- **`src/views/AltroView.tsx` (Dashboard opzioni)**:
  - Tasti di navigazione (emerald/indigo gradient) ➔ Sky Tint (`#F0FAF9`) per utilità, White con icone Coral per le app principali.
- **`src/views/MappaView.tsx`**:
  - Pin mappa (emerald) ➔ Riassegnati a Coral / Sky / Navy a seconda della tipologia, rimuovendo l'emerald.
- **`src/views/altro/RistorantiView.tsx`**:
  - CTA "Scegli per me / Random" (emerald) ➔ Coral.

### 4. Componenti di Dettaglio
- **`src/components/forms/ShoppingForm.tsx`**:
  - Header sfumato (pink/orange) ➔ Sky Tint (`#F0FAF9`) o Coral Tint (`#FFF0ED`).
- **`src/components/cards/TrasportoCard.tsx`**:
  - `bg-[#F0F7FF]` (Soft Azure) ➔ `#F0FAF9` (Sky Tint), per unificarlo al DS senza introdurre colori fuori palette.
