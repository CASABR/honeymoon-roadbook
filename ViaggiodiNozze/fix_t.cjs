const fs = require('fs');

const f = 'src/components/cards/TrasportoCard.tsx';
let content = fs.readFileSync(f, 'utf8');

const regex = /  const formatDate = \(\w*\?\: string\) => \{\n    if \(\!\w*\) return '';\n    try \{\n      const \[y, m, d\] = \w*\.split\('-'\);\n      return `\$\{d\}\\\/\$\{m\}\\\/\$\{y\}`;\n    \} catch \{\n      return \w*;\n    \}\n  \};\n/g;

content = content.replace(regex, '');
if (!content.includes('import { formatDate } from')) {
    content = "import { formatDate } from '../../utils/tripDates';\n" + content;
}

fs.writeFileSync(f, content, 'utf8');

const f2 = 'src/components/modals/TrasportoInfoModal.tsx';
let c2 = fs.readFileSync(f2, 'utf8');

c2 = c2.replace(regex, '');
if (!c2.includes('import { formatDate } from')) {
    c2 = "import { formatDate } from '../../utils/tripDates';\n" + c2;
}

fs.writeFileSync(f2, c2, 'utf8');
