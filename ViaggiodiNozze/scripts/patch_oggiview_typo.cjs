const fs = require('fs');

let content = fs.readFileSync('src/views/OggiView.tsx', 'utf8');

const targetStr = `if (item.type === 'transport' && item.originalData) {`;
const replacementStr = `if (item.type === 'trasporto' && item.originalData) {`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('src/views/OggiView.tsx', content, 'utf8');
    console.log('OggiView successfully patched (transport -> trasporto)!');
} else {
    console.log('Could not find item.type === "transport" in OggiView.tsx');
}
