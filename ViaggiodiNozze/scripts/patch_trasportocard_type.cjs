const fs = require('fs');

let content = fs.readFileSync('src/components/cards/TrasportoCard.tsx', 'utf8');

const regex = /\{transport\.cost === '0\.00' \|\| transport\.cost === '0' \|\| transport\.cost === 0 \? \(/;

const replacementStr = `{transport.cost === '0.00' || transport.cost === '0' ? (`;

if (regex.test(content)) {
    content = content.replace(regex, replacementStr);
    fs.writeFileSync('src/components/cards/TrasportoCard.tsx', content, 'utf8');
    console.log('TrasportoCard successfully fixed typing!');
} else {
    console.log('Regex did not match in TrasportoCard.tsx');
}
