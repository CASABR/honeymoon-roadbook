# HOUNIGO — STRUTTURA ASSET FOTOGRAFICI REALI

Questa directory ospita esclusivamente le **fotografie originali e autentiche di HOUNIGO** coerenti con la narrazione Instagram (**@hounigo**).

---

## REGOLE INDEROGABILI
1. **NO Foto Stock generiche** (Unsplash/Freepik/Pexels con modelli generici).
2. **NO Immagini AI** presentate come fotografie reali.
3. **NO Caroselli social con testi o CTA grafiche sovraimpresse**.
4. **SOLO Scatti fotografici reali** (luce naturale, paesaggi del viaggio, dettagli on-the-road).

---

## SPECIFICA SLOT FOTOGRAFICI UFFICIALI

| Slot / Destinazione | Nome File Raccomandato | Risoluzione Ottimale | Formato Primario | Aspetto |
| :--- | :--- | :--- | :--- | :--- |
| **Hero Cover Onboarding** | `onboarding-road-trip.webp` | `1200×800` (150-200 KB) | WebP / JPEG | 3:2 orizzontale, luce calda |
| **Cover Viaggio Default (NZ/Aus)** | `trip-cover-roadbook.webp` | `1600×900` (250 KB) | WebP / JPEG | 16:9 panoramico |
| **Tappa Paesaggio — Fiordi & Laghi** | `stage-landscape-fiord.webp` | `1024×680` (120 KB) | WebP / JPEG | 3:2 |
| **Tappa Paesaggio — Coste & Oceano** | `stage-landscape-coast.webp` | `1024×680` (120 KB) | WebP / JPEG | 3:2 |
| **Tappa Paesaggio — Parchi & Foreste** | `stage-landscape-nature.webp` | `1024×680` (120 KB) | WebP / JPEG | 3:2 |

---

## GESTIONE FALLBACK E PRESTAZIONI
- Fino al caricamento degli scatti fotografici ufficiali da parte dell'organizzatore del viaggio, i componenti UI utilizzano placeholder cromatici eleganti basati sulla palette ufficiale (`#172033` Navy, `#FF6B5F` Coral, `#F8F7F3` Cloud) senza causare layout shift (`aspect-ratio` fisso e `object-fit: cover`).
- Il caricamento è configurato con `loading="lazy"` per non impattare il Largest Contentful Paint (LCP) né rallentare il primo accesso.
