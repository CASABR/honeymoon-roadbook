const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

const replacement = `  // @ts-ignore
  const [editingTransportCost, setEditingTransportCost] = useState('');
  // @ts-ignore
  const [editingTransportAcconto, setEditingTransportAcconto] = useState('');

  const openTransportEdit = (tr: any) => {
    setEditingTransportId(tr.id);
    const costNum = parseEuro(tr.cost);
    const accNum = parseEuro(tr.depositPaid || tr.acconto);
    setEditingTransportCost(costNum > 0 ? costNum.toFixed(2) : '');
    setEditingTransportAcconto(accNum > 0 ? accNum.toFixed(2) : '');
  };`;

if (!code.includes('const openTransportEdit')) {
  code = code.replace(/const openItemEdit = \(/, replacement + '\n\n  const openItemEdit = (');
}

fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code);
console.log('Restored openTransportEdit with ignores');
