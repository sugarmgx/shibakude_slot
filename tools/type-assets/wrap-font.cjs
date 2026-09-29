const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'assets/fonts/slot-black.typeface.json');
const target = path.join(root, 'assets/fonts/slot-black.typeface.js');
const typeface = JSON.parse(fs.readFileSync(source, 'utf8'));

fs.writeFileSync(target, `window.SlotBlackTypeface=${JSON.stringify(typeface)};\n`);
console.log(`wrapped ${Object.keys(typeface.glyphs || {}).length} glyphs`);
