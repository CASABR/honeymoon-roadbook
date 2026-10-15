const fs = require('fs');

const f1 = 'src/components/cards/TrasportoCard.tsx';
let c1 = fs.readFileSync(f1, 'utf8');

const target1 = `  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-');
      return \`\${d}/\${m}/\${y}\`;
    } catch {
      return dateStr;
    }
  };`;

c1 = c1.replace(target1, '');

// Also trying with \r\n
const target2 = target1.replace(/\n/g, '\r\n');
c1 = c1.replace(target2, '');

fs.writeFileSync(f1, c1, 'utf8');
