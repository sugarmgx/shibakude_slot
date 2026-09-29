const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'assets', 'vendor', 'local-file-assets.js');
const metal = fs.readFileSync(path.join(root, 'assets', 'textures', 'coarse-machined-metal-v1.png')).toString('base64');
const hdri = fs.readFileSync(path.join(root, 'assets', 'environment', 'studio_small_09_2k.exr')).toString('base64');

fs.writeFileSync(output, `(() => {
  'use strict';
  window.CabinetLocalAssets = Object.freeze({
    coarseMachinedMetal: 'data:image/png;base64,${metal}',
    studioHdriBase64: '${hdri}'
  });
})();\n`);

console.log(`Wrote ${path.relative(root, output)}`);
