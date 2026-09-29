const fs = require('fs');

const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error('usage: node wrap-title-texture.cjs SOURCE.png TARGET.js');
const encoded = fs.readFileSync(source).toString('base64');
fs.writeFileSync(target, `window.CabinetTitleMetalTextureData='data:image/png;base64,${encoded}';\n`);
console.log(`wrapped ${fs.statSync(source).size} bytes`);
