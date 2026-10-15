const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

const unifiedItemsDef = `
  const alloggiToRender = selectedCategory === "tutte" || selectedCategory === "alloggi" ? alloggi.filter(a => parseEuro(a.cost) > 0) : [];
  const trasportiToRender = selectedCategory === "tutte" || selectedCategory === "trasporti" ? trasporti.filter(t => parseEuro(t.cost) > 0) : [];
  const attivitaToRender = selectedCategory === "tutte" || selectedCategory === "attivita" ? attivita.filter(a => parseEuro(a.cost) > 0) : [];
  const ristorantiToRender = selectedCategory === "tutte" || selectedCategory === "ristoranti" ? ristoranti.filter((r: any) => parseEuro(r.budget || "") > 0) : [];
  const shoppingToRender = selectedCategory === "tutte" || selectedCategory === "shopping" ? shoppingItemsList.filter((s: any) => parseEuro(s.budget || "") > 0) : [];
  
  const totalItemsCount = filteredSpese.length + alloggiToRender.length + trasportiToRender.length + attivitaToRender.length + ristorantiToRender.length + shoppingToRender.length;
`;

if (!code.includes('const alloggiToRender =')) {
  // We want to insert it right before the main return statement of SpeseBudgetView
  // To be safe, let's find `const filteredSpese = useMemo(() => {` block's end.
  const endMemoIdx = code.indexOf('}, [spese, selectedCategory]);');
  if (endMemoIdx !== -1) {
    code = code.substring(0, endMemoIdx + 30) + '\n' + unifiedItemsDef + '\n' + code.substring(endMemoIdx + 30);
  }
}

// Remove unused state parameters:
code = code.replace(/const \[editingItemAcconto, setEditingItemAcconto\] = useState\(\'\'\);/g, '');
code = code.replace(/const openItemEdit = \(id: string, cost: number, acconto: number, status: StatoSpesa = 'da_saldare'\) => \{/, 'const openItemEdit = (id: string, cost: number, status: StatoSpesa = "da_saldare") => {');
code = code.replace(/setEditingItemAcconto\(acconto > 0 \? acconto\.toFixed\(2\) : \'\'\);/g, '');
code = code.replace(/const \[savingTransportId, setSavingTransportId\] = useState<string \| null>\(\n    null,\n  \);/, '');
code = code.replace(/const saveTransportCost = async \(tr: Trasporto\) => \{[\s\S]*?finally \{\n      setSavingTransportId\(null\);\n    \}\n  \};/, '');


fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code);
console.log('Fixed missing ToRender');
