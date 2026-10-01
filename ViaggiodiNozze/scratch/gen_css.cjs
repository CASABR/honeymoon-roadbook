const fs = require('fs');

const colors = ['amber', 'emerald', 'rose', 'blue', 'indigo', 'purple', 'sky', 'teal', 'cyan', 'fuchsia'];
const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

let css = '\n/* Generazione dinamica palette per Dark Mode (Invertita) */\nhtml {\n';
for (const color of colors) {
  for (const shade of shades) {
    css += `  --orig-${color}-${shade}: var(--color-${color}-${shade});\n`;
  }
}
css += '}\n\nhtml.dark {\n';
for (const color of colors) {
  const reversedShades = [...shades].reverse(); // 950, 900, ... 50
  for (let i = 0; i < shades.length; i++) {
    css += `  --color-${color}-${shades[i]}: var(--orig-${color}-${reversedShades[i]});\n`;
  }
}
css += '}\n';

fs.appendFileSync('./src/index.css', css);
console.log('Palette generata con successo.');
