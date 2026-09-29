const fs = require('fs');
const opentype = require('opentype.js');

const [fontPath, characterSource, jsonTarget, jsTarget] = process.argv.slice(2);
if (!fontPath || !characterSource || !jsonTarget || !jsTarget) {
  throw new Error('usage: node build-line-seed-typeface.cjs FONT.ttf SOURCE.json TARGET.json TARGET.js');
}

const font = opentype.loadSync(fontPath);
const source = JSON.parse(fs.readFileSync(characterSource, 'utf8'));
const resolution = font.unitsPerEm || 1000;
const round = value => Math.round(value * 1000) / 1000;
const outline = glyph => glyph.path.commands.map(command => {
  if (command.type === 'M') return `m ${round(command.x)} ${round(command.y)}`;
  if (command.type === 'L') return `l ${round(command.x)} ${round(command.y)}`;
  if (command.type === 'Q') return `q ${round(command.x)} ${round(command.y)} ${round(command.x1)} ${round(command.y1)}`;
  if (command.type === 'C') return `b ${round(command.x)} ${round(command.y)} ${round(command.x1)} ${round(command.y1)} ${round(command.x2)} ${round(command.y2)}`;
  return '';
}).filter(Boolean).join(' ');

const glyphs = {};
for (const character of Object.keys(source.glyphs || {})) {
  const glyph = font.charToGlyph(character);
  if (!glyph || glyph.unicode === undefined) continue;
  const box = glyph.getBoundingBox();
  glyphs[character] = {
    ha: round(glyph.advanceWidth || resolution),
    x_min: round(box.x1),
    x_max: round(box.x2),
    o: outline(glyph)
  };
}

const typeface = {
  glyphs,
  familyName: 'LINE Seed JP ExtraBold Subset',
  resolution,
  boundingBox: { yMin: font.descender, yMax: font.ascender },
  underlineThickness: Math.max(1, Math.round(resolution * .05))
};
fs.writeFileSync(jsonTarget, `${JSON.stringify(typeface)}\n`);
fs.writeFileSync(jsTarget, `window.LineSeedJPExtraBoldTypeface=${JSON.stringify(typeface)};\n`);
console.log(`wrapped ${Object.keys(glyphs).length} glyphs`);
