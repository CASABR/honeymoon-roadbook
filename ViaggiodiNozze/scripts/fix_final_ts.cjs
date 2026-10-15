const fs = require('fs');
let code = fs.readFileSync('src/views/altro/SpeseBudgetView.tsx', 'utf8');

// 1. Remove export default at the end
code = code.replace(/\nexport default SpeseBudgetView;\n/g, '');

// 2. Add back the missing state variables right above openItemEdit
const vars = `
  // @ts-ignore
  const [editingTransportCost, setEditingTransportCost] = useState('');
  // @ts-ignore
  const [editingTransportAcconto, setEditingTransportAcconto] = useState('');
`;

if (!code.includes('const [editingTransportCost')) {
  code = code.replace('  const openItemEdit =', vars + '\n  const openItemEdit =');
}

fs.writeFileSync('src/views/altro/SpeseBudgetView.tsx', code);
console.log('Fixed final TS errors');
