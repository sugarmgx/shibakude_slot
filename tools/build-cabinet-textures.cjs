// Generates the cabinet surface textures (brushed metal, plastic grain,
// speaker grille, parlor backdrop) with a canvas in headless Chromium.
// Usage: node tools/build-cabinet-textures.cjs  (needs playwright; dev only)
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const out = path.join(path.resolve(__dirname, '..'), 'assets', 'textures', 'cabinet');

(async () => {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  const files = await page.evaluate(() => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const result = {};

    // Brushed hairline metal, tileable in both directions.
    {
      const w = 512, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const row = rand() * 2 - 1, a = rand() * 6.283, b = rand() * 6.283;
        for (let x = 0; x < w; x++) {
          const t = x / w * 6.283;
          const streak = row * 18 + Math.sin(t * 3 + a) * 6 * row + Math.sin(t * 7 + b) * 3;
          const v = Math.max(0, Math.min(255, 128 + streak + (rand() - 0.5) * 10));
          const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0); result['brushed-metal.png'] = c.toDataURL('image/png');
    }
    // Fine plastic grain.
    {
      const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { const v = 128 + (rand() - 0.5) * 22 + (rand() < 0.02 ? 18 : 0); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
      ctx.putImageData(img, 0, 0); result['plastic-grain.png'] = c.toDataURL('image/png');
    }
    // Speaker grille: staggered round perforations with a lit top edge.
    {
      const w = 20, h = 34, c = canvas(w, h), ctx = c.getContext('2d');
      ctx.fillStyle = '#1b2227'; ctx.fillRect(0, 0, w, h);
      for (const [cx, cy] of [[0, 0], [20, 0], [10, 17], [0, 34], [20, 34]]) {
        const g = ctx.createRadialGradient(cx, cy - 1.5, 1, cx, cy, 6.2);
        g.addColorStop(0, '#000'); g.addColorStop(0.72, '#020304'); g.addColorStop(0.86, '#5f6c73'); g.addColorStop(1, '#1b2227');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 6.2, 0, 7); ctx.fill();
      }
      result['speaker-grille.png'] = c.toDataURL('image/png');
    }
    // Parlor backdrop: rows of neighbouring machines, ceiling lights, floor sheen.
    {
      const w = 1920, h = 1080, c = canvas(w, h), ctx = c.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#07090d'); bg.addColorStop(0.55, '#0b0e14'); bg.addColorStop(0.7, '#05070a'); bg.addColorStop(1, '#020304');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.filter = 'blur(26px)';
      const hues = ['#ff3b30', '#2f8fff', '#ffb43b', '#ff4fb8', '#45dd9c', '#ffffff'];
      for (let i = 0; i < 26; i++) {
        const x = (i / 26) * w + rand() * 40, side = x < w * 0.5 ? -1 : 1;
        if (Math.abs(x - w / 2) < 520) continue;
        const col = hues[Math.floor(rand() * hues.length)];
        ctx.globalAlpha = 0.34 + rand() * 0.3; ctx.fillStyle = col;
        ctx.fillRect(x, 230 + rand() * 40, 46, 150 + rand() * 60);
        ctx.globalAlpha = 0.2; ctx.fillRect(x - 10, 470, 70, 90);
      }
      ctx.filter = 'blur(40px)';
      for (let i = 0; i < 9; i++) { ctx.globalAlpha = 0.28; ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.ellipse(i * 240 + 60, 40, 90, 22, 0, 0, 7); ctx.fill(); }
      ctx.filter = 'blur(60px)'; ctx.globalAlpha = 0.12; ctx.fillStyle = '#6c7c8c'; ctx.fillRect(0, 760, w, 120);
      ctx.filter = 'none'; ctx.globalAlpha = 1;
      const v = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.5, h * 0.95);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)'); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
      result['parlor.jpg'] = c.toDataURL('image/jpeg', 0.82);
    }
    return result;
  });
  for (const [name, url] of Object.entries(files)) {
    fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    console.log('Wrote', name);
  }
  await browser.close();
})();
