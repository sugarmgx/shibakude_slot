// Builds the stage surface bundle for the normal-stage scenery:
//   assets/textures/stage/stage-textures.js  (window.ShibakuStageTextures)
//   assets/environment/stage-hdri.js         (window.ShibakuStageHDRI)
// Albedo / normal maps are generated here (original work); HDRIs and a few
// detail normals come from @pmndrs/assets (CC0-1.0, Poly Haven sources).
// Everything is embedded as data URLs because WebGL cannot sample file://
// images. Usage: node tools/build-stage-textures.cjs  (dev only; needs
// playwright and `npm pack @pmndrs/assets@1.7.0`).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { execSync } = require('node:child_process');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const root = path.resolve(__dirname, '..');
const PMNDRS = '@pmndrs/assets@1.7.0';

function pmndrs() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmndrs-'));
  execSync(`npm pack ${PMNDRS} --silent`, { cwd: dir });
  const tgz = fs.readdirSync(dir).find(f => f.endsWith('.tgz'));
  execSync(`tar xzf ${tgz}`, { cwd: dir });
  const read = rel => fs.readFileSync(path.join(dir, 'package', rel), 'utf8').match(/'(data:[^']+)'/)[1];
  return { read };
}

(async () => {
  const cc0 = pmndrs();
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>x</title>'); return; }
    res.writeHead(200); fs.createReadStream(file).pipe(res);
  }).listen(0);
  const port = server.address().port;
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/`);
  const textures = await page.evaluate(async () => {
    const font = new FontFace('StageFont', 'url(/assets/fonts/LINESeedJP-ExtraBold.woff2)');
    await font.load(); document.fonts.add(font);
    let seed = 20260929;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    // Tileable value noise / fbm.
    const lattice = new Float32Array(256 * 256).map(() => rand());
    const noise = (x, y, period) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const at = (a, b) => lattice[((((b % period) + period) % period) * 256) + (((a % period) + period) % period)];
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
    };
    const fbm = (x, y, period, octaves = 4) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < octaves; i++) { v += noise(x * f, y * f, period * f) * a; a *= 0.5; f *= 2; } return v; };
    // Height canvas -> tangent-space normal map (Sobel).
    const normalFrom = (height, strength) => {
      const w = height.width, h = height.height, src = height.getContext('2d').getImageData(0, 0, w, h).data;
      const out = canvas(w, h), ctx = out.getContext('2d'), img = ctx.createImageData(w, h);
      const H = (x, y) => src[((((y + h) % h) * w + ((x + w) % w)) * 4)] / 255;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
        const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
        let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const i = (y * w + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0); return out;
    };
    const pixels = (w, h, fn) => {
      const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); const i = (y * w + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255; }
      ctx.putImageData(img, 0, 0); return c;
    };
    const jpg = (c, q = 0.84) => c.toDataURL('image/jpeg', q);
    const out = {};

    // Station floor: large polished terrazzo slabs (2 x 2 per texture), fine
    // aggregate, hairline joints and soft traffic wear. Low contrast on purpose:
    // the shader adds light, reflections and grime.
    {
      const S = 1024, T = 512;
      const joint = (x, y) => Math.min(x % T, y % T, T - 1 - (x % T), T - 1 - (y % T));
      const slabTone = [...Array(4)].map(() => 0.97 + rand() * 0.06);
      const speck = new Uint8Array(S * S); for (let i = 0; i < 60000; i++) speck[Math.floor(rand() * S * S)] = 1 + Math.floor(rand() * 3);
      const albedo = pixels(S, S, (x, y) => {
        const tone = slabTone[Math.floor(y / T) * 2 + Math.floor(x / T)];
        const wear = 0.95 + (fbm(x / 170, y / 170, 6) - 0.5) * 0.12;
        let v = 132 * tone * wear;
        const s = speck[y * S + x]; if (s === 1) v *= 0.8; else if (s === 2) v *= 1.1; else if (s === 3) v *= 0.9;
        if (joint(x, y) < 1) v *= 0.72;
        return [v * 0.985, v, v * 1.015];
      });
      const height = pixels(S, S, (x, y) => { const v = joint(x, y) < 1 ? 60 : 255; return [v, v, v]; });
      out.floorMap = jpg(albedo, 0.9); out.floorNormal = jpg(normalFrom(height, 0.8), 0.9);
    }
    // Tactile paving: yellow with raised dots.
    {
      const S = 256, cell = 32;
      const dome = (x, y) => { const dx = (x % cell) - cell / 2, dy = (y % cell) - cell / 2; const d = Math.hypot(dx, dy) / 10; return d < 1 ? Math.sqrt(1 - d * d) : 0; };
      const albedo = pixels(S, S, (x, y) => { const k = 0.85 + dome(x, y) * 0.2 + (rand() - 0.5) * 0.06; return [228 * k, 182 * k, 30 * k]; });
      const height = pixels(S, S, (x, y) => { const v = dome(x, y) * 255; return [v, v, v]; });
      out.tactileMap = jpg(albedo); out.tactileNormal = jpg(normalFrom(height, 3), 0.9);
    }
    // Concrete: smooth fair-faced finish, faint formwork seam, soft blotches.
    {
      const S = 512;
      const albedo = pixels(S, S, (x, y) => {
        let v = 138 + (fbm(x / 90, y / 90, 6) - 0.5) * 22 + (rand() - 0.5) * 4;
        v -= Math.max(0, fbm(x / 14, y / 220, 37, 3) - 0.6) * 40;
        if (y % 256 < 1) v -= 10;
        return [v, v * 0.995, v * 0.975];
      });
      const height = pixels(S, S, (x, y) => { const v = 128 + (fbm(x / 22, y / 22, 23) - 0.5) * 60; return [v, v, v]; });
      out.concreteMap = jpg(albedo, 0.9); out.concreteNormal = jpg(normalFrom(height, 0.5), 0.9);
    }
    // Wall cladding: enamelled steel panels (2 x 1 per texture), hairline
    // seams, a very slight tone drift between panels.
    {
      const S = 512, PW = 256, PH = 512;
      const tones = [...Array(2)].map(() => 0.98 + rand() * 0.04);
      const albedo = pixels(S, S, (x, y) => {
        const seam = Math.min(x % PW, PW - 1 - (x % PW), y, S - 1 - y);
        const v = (seam < 1 ? 150 : 196) * tones[Math.floor(x / PW)] * (0.985 + fbm(x / 120, y / 120, 4) * 0.03);
        return [v, v * 0.985, v * 0.955];
      });
      const height = pixels(S, S, (x, y) => { const e = Math.min(x % PW, PW - 1 - (x % PW), y, S - 1 - y); const v = Math.min(1, e / 3) * 255; return [v, v, v]; });
      out.wallTileMap = jpg(albedo, 0.9); out.wallTileNormal = jpg(normalFrom(height, 0.9), 0.9);
    }
    // Ballast: packed gravel.
    {
      const S = 512, c = canvas(S, S), ctx = c.getContext('2d'), hc = canvas(S, S), hx = hc.getContext('2d');
      ctx.fillStyle = '#3c3a37'; ctx.fillRect(0, 0, S, S); hx.fillStyle = '#000'; hx.fillRect(0, 0, S, S);
      for (let i = 0; i < 5200; i++) {
        const x = rand() * S, y = rand() * S, r = 3 + rand() * 7, a = rand() * 3.14, tone = 70 + rand() * 90;
        for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
          ctx.fillStyle = `rgb(${tone},${tone * 0.96},${tone * 0.9})`; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r, r * 0.7, a, 0, 7); ctx.fill();
          const g = hx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); g.addColorStop(0, '#fff'); g.addColorStop(1, '#222');
          hx.fillStyle = g; hx.beginPath(); hx.ellipse(x + ox, y + oy, r, r * 0.7, a, 0, 7); hx.fill();
        }
      }
      out.ballastMap = jpg(c); out.ballastNormal = jpg(normalFrom(hc, 2.4), 0.9);
    }
    // Ceiling louvres.
    {
      const S = 256;
      const albedo = pixels(S, S, (x, y) => { const k = x % 32; const v = k < 3 ? 26 : 52 + (k / 32) * 26 + (rand() - 0.5) * 6; return [v, v * 1.03, v * 1.08]; });
      const height = pixels(S, S, (x, y) => { const k = x % 32; const v = k < 3 ? 0 : 255 * Math.sin((k / 32) * Math.PI); return [v, v, v]; });
      out.ceilingMap = jpg(albedo); out.ceilingNormal = jpg(normalFrom(height, 1.5), 0.9);
    }
    // Station name board (generic design; the stage name is already on screen).
    {
      const c = canvas(1024, 256), ctx = c.getContext('2d');
      ctx.fillStyle = '#f4f6f5'; ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = '#1f7a4c'; ctx.fillRect(0, 168, 1024, 14);
      ctx.fillStyle = '#16191b'; ctx.textAlign = 'center';
      ctx.font = '26px StageFont'; ctx.fillText('はしもと', 512, 46);
      ctx.font = '96px StageFont'; ctx.fillText('橋 本', 512, 150);
      ctx.font = '26px StageFont'; ctx.fillText('Hashimoto', 512, 222);
      ctx.fillStyle = '#16191b'; for (const side of [-1, 1]) { ctx.beginPath(); const x = 512 + side * 440; ctx.moveTo(x + side * 34, 175); ctx.lineTo(x, 160); ctx.lineTo(x, 190); ctx.fill(); ctx.fillRect(Math.min(x, x - side * 80), 171, 80, 8); }
      out.stationSign = jpg(c, 0.9);
    }
    // Vending machine face (no brands).
    {
      const c = canvas(256, 512), ctx = c.getContext('2d');
      ctx.fillStyle = '#e9ecec'; ctx.fillRect(0, 0, 256, 512);
      ctx.fillStyle = '#111820'; ctx.fillRect(14, 20, 228, 250);
      const drink = ['#d7262c', '#1f63c9', '#f2b705', '#2a9d4b', '#ffffff', '#6b3b1f', '#ee7b21', '#8f44ad'];
      for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
        const x = 26 + col * 37, y = 34 + row * 80;
        const g = ctx.createLinearGradient(x, 0, x + 26, 0); const hue = drink[Math.floor(rand() * drink.length)];
        g.addColorStop(0, hue); g.addColorStop(0.45, '#fff'); g.addColorStop(0.6, hue); g.addColorStop(1, '#222');
        ctx.fillStyle = g; ctx.fillRect(x, y, 26, 56); ctx.fillStyle = '#0a0d10'; ctx.fillRect(x, y + 60, 26, 8);
        ctx.fillStyle = rand() < 0.2 ? '#ff3b30' : '#32d74b'; ctx.fillRect(x + 8, y + 62, 10, 4);
      }
      ctx.fillStyle = '#c9ced0'; ctx.fillRect(14, 290, 228, 120); ctx.fillStyle = '#1a1f24'; ctx.fillRect(60, 310, 70, 24); ctx.fillRect(160, 300, 60, 90);
      ctx.fillStyle = '#20262c'; ctx.fillRect(30, 430, 196, 60);
      out.vendingMap = jpg(c, 0.88);
    }
    // Lit advertising panels (abstract; one carries the game's own name).
    {
      const panel = (draw) => { const c = canvas(512, 256), ctx = c.getContext('2d'); draw(ctx); return jpg(c, 0.86); };
      out.adGame = panel(ctx => {
        const g = ctx.createLinearGradient(0, 0, 512, 256); g.addColorStop(0, '#3b0006'); g.addColorStop(0.5, '#b3121b'); g.addColorStop(1, '#0a1f5c');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
        for (let i = 0; i < 9; i++) { ctx.strokeStyle = `rgba(255,220,140,${0.1 + i * 0.03})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(390, 128, 30 + i * 18, 0, 7); ctx.stroke(); }
        ctx.fillStyle = '#fff'; ctx.font = 'italic 54px StageFont'; ctx.fillText('しばくでスロット', 26, 150);
        ctx.fillStyle = '#ffb43b'; ctx.fillRect(26, 170, 250, 6);
      });
      out.adCity = panel(ctx => {
        const g = ctx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#0d2a4a'); g.addColorStop(1, '#f0a35e');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
        for (let i = 0; i < 40; i++) { const w = 12 + rand() * 30, h = 40 + rand() * 150; ctx.fillStyle = `rgba(10,16,30,${0.6 + rand() * 0.3})`; ctx.fillRect(i * 13, 256 - h, w, h); }
        ctx.fillStyle = '#fff6'; ctx.beginPath(); ctx.arc(420, 70, 26, 0, 7); ctx.fill();
      });
      out.adSoda = panel(ctx => {
        ctx.fillStyle = '#e8f6ff'; ctx.fillRect(0, 0, 512, 256);
        for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(80,170,255,${rand() * 0.5})`; ctx.beginPath(); ctx.arc(rand() * 512, rand() * 256, 3 + rand() * 18, 0, 7); ctx.fill(); }
        const g = ctx.createLinearGradient(300, 0, 380, 0); g.addColorStop(0, '#0f6fd6'); g.addColorStop(0.5, '#bfe6ff'); g.addColorStop(1, '#0a4ea0');
        ctx.fillStyle = g; ctx.fillRect(300, 40, 80, 190);
      });
    }
    // Hall carpet and booth posters; lounge wood floor and velvet.
    {
      const S = 512;
      out.carpetMap = jpg(pixels(S, S, (x, y) => { const pattern = ((Math.floor(x / 32) + Math.floor(y / 32)) % 2) ? 1 : 0.9; const v = (0.8 + rand() * 0.25) * pattern; return [26 * v, 34 * v, 58 * v]; }));
      const poster = (a, b) => { const c = canvas(256, 384), ctx = c.getContext('2d'); const g = ctx.createLinearGradient(0, 0, 256, 384); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 384);
        for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.35})`; ctx.beginPath(); ctx.arc(rand() * 256, rand() * 384, 8 + rand() * 60, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#ffffffcc'; ctx.fillRect(20, 300, 216, 10); ctx.fillRect(20, 320, 150, 8); return jpg(c, 0.86); };
      out.posterA = poster('#ff5fa2', '#3b1c8c'); out.posterB = poster('#2ad4ff', '#0b2a6b'); out.posterC = poster('#ffd166', '#c2185b');
      const W = 1024;
      const plankTone = [...Array(64)].map(() => 0.8 + rand() * 0.35);
      const wood = pixels(W, W, (x, y) => {
        const plank = Math.floor(x / 128), offset = (plank % 2) * 300, row = Math.floor((y + offset) / 512);
        const tone = plankTone[(plank * 3 + row) % 64];
        const grain = fbm(x / 6, (y + offset) / 90, 170, 3);
        const seam = (x % 128 < 2) || ((y + offset) % 512 < 2);
        const v = seam ? 0.35 : tone * (0.72 + grain * 0.45);
        return [120 * v, 72 * v, 40 * v];
      });
      const woodHeight = pixels(W, W, (x, y) => { const offset = (Math.floor(x / 128) % 2) * 300; const v = ((x % 128 < 2) || ((y + offset) % 512 < 2)) ? 0 : 200 + fbm(x / 6, y / 90, 170, 3) * 55; return [v, v, v]; });
      out.woodMap = jpg(wood); out.woodNormal = jpg(normalFrom(woodHeight, 1.4), 0.9);
      out.velvetMap = jpg(pixels(256, 256, (x, y) => { const v = 0.75 + fbm(x / 20, y / 20, 13) * 0.4 + (rand() - 0.5) * 0.08; return [110 * v, 18 * v, 32 * v]; }));
    }
    return out;
  });
  // CC0 detail normals from @pmndrs/assets (Poly Haven sources).
  textures.concreteDetailNormal = cc0.read('normals/0015.webp.js');
  textures.metalPanelNormal = cc0.read('normals/0012.webp.js');
  textures.carpetNormal = cc0.read('normals/0021.webp.js');
  await browser.close(); server.close();

  const stageDir = path.join(root, 'assets', 'textures', 'stage');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'stage-textures.js'),
    `// Generated by tools/build-stage-textures.cjs. Original textures plus CC0 detail normals from @pmndrs/assets.\nwindow.ShibakuStageTextures = ${JSON.stringify(textures)};\n`);
  const hdri = { station: cc0.read('hdri/warehouse.exr.js'), hall: cc0.read('hdri/hall.exr.js'), lounge: cc0.read('hdri/lobby.exr.js') };
  fs.writeFileSync(path.join(root, 'assets', 'environment', 'stage-hdri.js'),
    `// Generated by tools/build-stage-textures.cjs. CC0-1.0 HDRIs from @pmndrs/assets (Poly Haven).\nwindow.ShibakuStageHDRI = ${JSON.stringify(hdri)};\n`);
  const kb = f => Math.round(fs.statSync(f).size / 1024) + 'KB';
  console.log('stage-textures.js', kb(path.join(stageDir, 'stage-textures.js')), '| stage-hdri.js', kb(path.join(root, 'assets', 'environment', 'stage-hdri.js')));
})();
