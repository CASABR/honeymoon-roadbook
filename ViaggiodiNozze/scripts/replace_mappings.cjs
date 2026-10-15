const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

// Replace alloggiToRender
code = code.replace(
  /\{alloggiToRender\.map\(\(acc: any\) => \{[\s\S]*?\}\)\}/,
  `{alloggiToRender.map((acc: any) => renderItemRow(acc, 'alloggio', {icon: '🏨', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Alloggio', deleteHandler: handleDeleteAlloggio, updateHandler: handleUpdateAlloggio}))}`
);

// Replace trasportiToRender
code = code.replace(
  /\{trasportiToRender\.map\(\(tr: any\) => \{[\s\S]*?\}\)\}/,
  `{trasportiToRender.map((tr: any) => renderItemRow(tr, 'trasporto', {icon: '✈️', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', label: 'Trasporto', deleteHandler: handleDeleteTransport, updateHandler: () => {} /* Handled uniquely */}))}`
);

// Replace attivitaToRender
code = code.replace(
  /\{attivitaToRender\.map\(\(att: any\) => \{[\s\S]*?\}\)\}/,
  `{attivitaToRender.map((att: any) => renderItemRow(att, 'attivita', {icon: '🎟️', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'Attività', deleteHandler: handleDeleteAttivita, updateHandler: handleUpdateAttivita}))}`
);

// Replace ristorantiToRender
code = code.replace(
  /\{ristorantiToRender\.map\(\(rist: any\) => \{[\s\S]*?\}\)\}/,
  `{ristorantiToRender.map((rist: any) => renderItemRow(rist, 'ristorante', {icon: '🍽️', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', label: 'Ristorante', deleteHandler: handleDeleteRistorante, updateHandler: handleUpdateRistorante}))}`
);

// Replace shoppingToRender
code = code.replace(
  /\{shoppingToRender\.map\(\(sh: any\) => \{[\s\S]*?\}\)\}/,
  `{shoppingToRender.map((sh: any) => renderItemRow(sh, 'shopping', {icon: '🛍️', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', label: 'Shopping', deleteHandler: handleDeleteShopping, updateHandler: handleUpdateShopping}))}`
);


// NOW REPLACE THE MODAL MAPPINGS (which use `Items` instead of `ToRender`)
code = code.replace(
  /\{alloggiItems\.map\(\(acc\) => \{[\s\S]*?\}\)\}/,
  `{alloggiItems.map((acc: any) => renderItemRow(acc, 'alloggio', {icon: '🏨', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Alloggio', deleteHandler: handleDeleteAlloggio, updateHandler: handleUpdateAlloggio}))}`
);

code = code.replace(
  /\{trasportiItems\.map\(\(tr\) => \{[\s\S]*?\}\)\}/,
  `{trasportiItems.map((tr: any) => renderItemRow(tr, 'trasporto', {icon: '✈️', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', label: 'Trasporto', deleteHandler: handleDeleteTransport, updateHandler: () => {} }))}`
);

code = code.replace(
  /\{attivitaItems\.map\(\(att: any\) => \{[\s\S]*?\}\)\}/,
  `{attivitaItems.map((att: any) => renderItemRow(att, 'attivita', {icon: '🎟️', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'Attività', deleteHandler: handleDeleteAttivita, updateHandler: handleUpdateAttivita}))}`
);

code = code.replace(
  /\{ristorantiItems\.map\(\(rist: any\) => \{[\s\S]*?\}\)\}/,
  `{ristorantiItems.map((rist: any) => renderItemRow(rist, 'ristorante', {icon: '🍽️', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', label: 'Ristorante', deleteHandler: handleDeleteRistorante, updateHandler: handleUpdateRistorante}))}`
);

code = code.replace(
  /\{shoppingItems\.map\(\(sh\) => \{[\s\S]*?\}\)\}/,
  `{shoppingItems.map((sh: any) => renderItemRow(sh, 'shopping', {icon: '🛍️', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', label: 'Shopping', deleteHandler: handleDeleteShopping, updateHandler: handleUpdateShopping}))}`
);

// We need to provide handleDeleteTransport since it's used in trasporti items
if (!code.includes('const handleDeleteTransport =')) {
  code = code.replace(
    '  const handleUpdateAlloggio =',
    `  const handleDeleteTransport = async (id: string) => {
    if(!confirm('Eliminare questo trasporto?')) return;
    await storageService.deleteTransport(id);
    await loadAllData();
  };

  const handleUpdateAlloggio =`
  );
}

fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code);
console.log('Done refactoring UI components.');
