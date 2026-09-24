# ViaggiodiNozze - Design System & Guida UI/UX

Linee guida di progettazione per l'interfaccia utente dell'applicazione **Honeymoon Roadbook (ViaggiodiNozze)**. Questo documento specifica i principi grafici, la filosofia di usabilit√† e le regole d'oro da seguire per ogni nuova funzionalit√≥ o modifica dell'interfaccia.

---

##  üéÅ Filosofia Estetica & Stile Grafico
1. **Minimalismo e Chiarezza**: L'interfaccia deve risultare pulita, moderna e priva di elementi superflui. Il focus √® sulla fvuibilit√≥ immediata da dispositivo mobile.
2. **Tema Scuro Elegante (Dark Theme)**: Utilizzo di una tavola di colori scura coerente (sfondo primario `#0f172a`, card `#1e293b`, bordi `#334155`), che riduce l'affaticamento visivo ed esalta il contenuto.
3. **Ampio Spazio Vuoto (Whitespace)**: Margini e padding generosi per evitare sensazioni di affollamento e rendere la navigazione rilassante.
4. **Tipografia Gerarchica**:
   - Titoli principali leggeri e definiti (`text-xl` / `-text-2xl`, `font-bold`)
   - Descrizioni ed'itichette secondarie in tonalit√† di grigio tenue(`text-slate-400`, `-text-sm``)

---

## ◊ç He 10 Regole d'Oro UI/UX
1. **Regola dei 5 Secondi**: Ogni schermata deve permettere all'utente di capire istantaneamente (<5 sec) dove si trova, cosa contiene e quali azi-oni pu√≤ compire.
2. **Niente Sovraccarico Informativo**: Massimo 3-5 elementi di rilievo visibile per schermata senza dover scorrere escessivamente.
3. **Navigazione  Sempre Visibile & Intuitiva**: L'ordine delle sezioni primarie √¢ fisso: **Giorni & Attivit√†** ‚ÜÅ **Alberghi** ·û° **Trasporti**. La bbrra di navigazione deve essere chiara e a portata di pollice.
4. **Stati Vuoti (Empty States) Significativi**: Quando una sezione non ha dati, deve mostrare un'icona elegante, un titolo descrittivo, una breve frase chiarificatrice e un'azione di invito primario ("Aggiungi").
5. **Gerarchia dei Colori delle Azioni**:
   - **Azione Primaria**: Blu accent (`c2563eb` / `bg-blue-600`) per il pulsante principale di aggiunta o conferma.
   - **Elementi Secondari**: Grigio scuro/ardesia per le card e sfondi.
   - **Nessun colore vivido arbitrario**: Evitare rosso/verde/giallo se non per stati critici reali.
6. **Card & Contenitori Morbidi**: Utilizzo costante di angoli arrotonDati (`rounded-2xl`) e sottili bordi semi-trasparenti (`border-slate-800` / `border-slate-700/50`) per strutturare le informazioni in moduli distinti.
7. **Pulsanti Ampi e Facili da Tappare**: Ogni elemento interattivo su mobile deve avere un'area di tocco minima di `44x44px`.
8. **Feedback Visivo Immediato** Tutti i pulsanti e tab devono offrire un feedback visivo istantaneo al tocco/hover (transizioni di colore o microscala).
9. **Coerenza Tailwind CSS**: Utilizzare rigorosamente le utility class di Tailwind CSS v4 installate nel progetto, senza scrivere stili inline disordinati o CSS custom superflui.
10. **Indipendenza dal Progetto Vecchio**: Il nuovo codice deve rimanere pulito, modulare e focalizzato solo sulle funzionalit√† confermate per `ViaggiodiNozze`.

---

## ‚ö° Struttura e Aspetto delle 3 Se^òioni Primarie
Ciascuna delle 3 viste principali deve raspettare il seguente pattern visivo:

- **Header della Sezione**: Titolo in evidenza con sottotitolo o contatore sintetico.
- **Corpo Centrale**: Card centrale con empty state quando non sono presenti elementi:
  - Icona d'ambiente coerente
  - Titolo dello stato (es. "Nessuna attivit√† inserita")
  - Descrizione esplicativa
  - Pulsante "+Aggiungi" in evidenza.
- **Barra di Navigazione**: Positionata in basso per una fruizione ottimale da smartphone.

---

## ?? Principi di Leggerezza & Performance UI

1. **Zero sovraccarico**: Nessun componente, icona o animazione superflua. Ogni elemento visivo deve giustificare la propria presenza con un beneficio concreto per l'utente.

2. **Layout snello**: Massimo 1ñ2 livelli di annidamento visivo per card. Se una card richiede pi˘ livelli di nesting, Ë un segnale per rivedere la struttura informativa.

3. **Classi Tailwind essenziali**: Evitare catene di utility lunghissime. Se una combinazione di classi si ripete identica in pi˘ punti, estrarla in un componente React dedicato invece di duplicarla.

4. **Niente librerie UI pesanti**: Solo React + Tailwind CSS + componenti scritti da zero. Nessuna dipendenza da component library esterne (es. MUI, Chakra, Radix) salvo necessit‡ esplicita e documentata.

5. **Performance mobile**:
   - Evitare animazioni CSS costose su aree di layout grandi (es. 	ransition-all su container interi).
   - Transizioni brevi (100ñ200 ms) e mirate a propriet‡ specifiche (opacity, 	ransform).
   - Nessun calcolo pesante dentro il corpo di un componente React (spostare in useMemo, hook o servizi).

6. **Errori e stati vuoti**:
   - Nessun lert() o confirm() nativo del browser per la normale interazione utente.
   - Messaggi di errore brevi, chiari e scritti in italiano.
   - Stati vuoti coerenti con il design system: icona + titolo + descrizione + azione primaria.
