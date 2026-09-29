// LCD glass: a procedural crack web on a canvas over the LCD, which can hold
// (the failure look) or shatter into falling shards (the revival). Cosmetic
// only; it never reads game state.
(() => {
  "use strict";

  const TAU = Math.PI * 2;

  class LcdGlass {
    constructor(host) {
      this.host = host;
      this.canvas = document.createElement("canvas");
      this.canvas.className = "lcd-glass";
      this.canvas.setAttribute("aria-hidden", "true");
      host?.append(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.mode = "idle";
      this.raf = 0;
      this.seed = 1;
    }

    random() {
      this.seed ^= this.seed << 13; this.seed >>>= 0;
      this.seed ^= this.seed >>> 17;
      this.seed ^= this.seed << 5; this.seed >>>= 0;
      return this.seed / 4294967296;
    }

    resize() {
      const rect = this.host.getBoundingClientRect();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      this.w = Math.max(1, rect.width);
      this.h = Math.max(1, rect.height);
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Radial rays crossed by jittered rings; each cell between two rays and
    // two rings becomes a shard.
    build() {
      this.seed = ((Date.now() ^ 0x9e3779b9) >>> 0) || 1;
      const cx = this.w * (0.42 + this.random() * 0.16);
      const cy = this.h * (0.38 + this.random() * 0.2);
      this.center = { x: cx, y: cy };
      const rays = 15;
      const reach = Math.hypot(this.w, this.h);
      const radii = [0, 0.035, 0.08, 0.15, 0.26, 0.42, 0.7, 1.2].map((r) => r * reach);
      const angles = [];
      for (let i = 0; i < rays; i += 1) angles.push((i + (this.random() - 0.5) * 0.7) / rays * TAU);
      // points[i][k]: ray i at ring k
      this.points = angles.map((angle) => radii.map((radius, k) => {
        if (k === 0) return { x: cx, y: cy };
        const wobble = (this.random() - 0.5) * 0.16;
        const r = radius * (0.85 + this.random() * 0.3);
        return { x: cx + Math.cos(angle + wobble) * r, y: cy + Math.sin(angle + wobble) * r };
      }));
      this.shards = [];
      for (let i = 0; i < rays; i += 1) {
        const a = this.points[i];
        const b = this.points[(i + 1) % rays];
        for (let k = 0; k < radii.length - 1; k += 1) {
          const poly = k === 0 ? [a[0], a[1], b[1]] : [a[k], a[k + 1], b[k + 1], b[k]];
          const mx = poly.reduce((sum, p) => sum + p.x, 0) / poly.length;
          const my = poly.reduce((sum, p) => sum + p.y, 0) / poly.length;
          const dist = Math.hypot(mx - cx, my - cy) / reach;
          this.shards.push({
            poly: poly.map((p) => ({ x: p.x - mx, y: p.y - my })),
            x: mx, y: my,
            vx: (mx - cx) * (1.1 + this.random() * 1.6) + (this.random() - 0.5) * 120,
            vy: (my - cy) * (0.6 + this.random()) - 160 - this.random() * 200,
            spin: (this.random() - 0.5) * 9,
            tilt: this.random() * TAU,
            tiltSpeed: 2 + this.random() * 6,
            shade: 0.05 + this.random() * 0.12,
            delay: dist * 0.35 + this.random() * 0.05,
          });
        }
      }
      // Concentric cracks are partial: real glass breaks mostly radially.
      this.ringMask = radii.map((_, k) => angles.map(() => this.random() < (k <= 2 ? 0.8 : 0.42)));
      // A few short spur cracks off the rays, for an irregular web.
      this.spurs = [];
      for (let i = 0; i < 26; i += 1) {
        const ray = this.points[Math.floor(this.random() * rays)];
        const k = 1 + Math.floor(this.random() * 5);
        const p = ray[k];
        const angle = this.random() * TAU;
        const len = 8 + this.random() * 30 * k;
        this.spurs.push([p, { x: p.x + Math.cos(angle) * len, y: p.y + Math.sin(angle) * len }]);
      }
    }

    crack() {
      this.resize();
      this.build();
      this.mode = "crack";
      this.startedAt = performance.now();
      this.canvas.classList.add("is-active");
      this.loop();
    }

    shatter() {
      if (this.mode !== "crack") this.crack();
      this.mode = "shatter";
      this.startedAt = performance.now();
      this.loop();
    }

    clear() {
      this.mode = "idle";
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.canvas.classList.remove("is-active");
      this.ctx.clearRect(0, 0, this.w || 0, this.h || 0);
    }

    loop() {
      cancelAnimationFrame(this.raf);
      const tick = (now) => {
        if (this.mode === "idle") return;
        const done = this.draw((now - this.startedAt) / 1000);
        if (!done) this.raf = requestAnimationFrame(tick);
        else if (this.mode === "shatter") this.clear();
      };
      this.raf = requestAnimationFrame(tick);
    }

    strokeWeb(ctx, grow) {
      const rings = this.points[0].length;
      const visibleRing = Math.max(1, Math.min(rings - 1, grow * (rings - 1)));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const [pass, width, color] of [[0, 3.2, "rgba(0,8,14,.35)"], [1, 1.2, "rgba(235,250,255,.9)"], [2, 0.5, "rgba(255,255,255,1)"]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (const ray of this.points) {
          ctx.moveTo(ray[0].x, ray[0].y);
          for (let k = 1; k <= Math.ceil(visibleRing); k += 1) {
            const f = Math.min(1, visibleRing - (k - 1));
            const p0 = ray[k - 1], p1 = ray[k];
            ctx.lineTo(p0.x + (p1.x - p0.x) * f, p0.y + (p1.y - p0.y) * f);
          }
        }
        for (let k = 1; k < Math.min(rings, Math.floor(visibleRing) + 1); k += 1) {
          if (k > 5) break;
          for (let i = 0; i < this.points.length; i += 1) {
            if (!this.ringMask[k][i]) continue;
            const a = this.points[i][k], b = this.points[(i + 1) % this.points.length][k];
            const bend = (this.center.x - (a.x + b.x) / 2) * 0.06;
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo((a.x + b.x) / 2 + bend, (a.y + b.y) / 2 - bend * 0.5, b.x, b.y);
          }
        }
        if (grow >= 1) for (const [a, b] of this.spurs) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        ctx.stroke();
        if (pass === 0) ctx.globalCompositeOperation = "lighter";
      }
      ctx.globalCompositeOperation = "source-over";
    }

    fillShards(ctx, alpha) {
      for (const shard of this.shards) {
        const grad = ctx.createLinearGradient(shard.x - 40, shard.y - 40, shard.x + 40, shard.y + 40);
        grad.addColorStop(0, `rgba(210,240,255,${(shard.shade * alpha).toFixed(3)})`);
        grad.addColorStop(0.5, `rgba(255,255,255,${(shard.shade * 0.3 * alpha).toFixed(3)})`);
        grad.addColorStop(1, `rgba(120,170,200,${(shard.shade * 0.6 * alpha).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        shard.poly.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, shard.x + p.x, shard.y + p.y));
        ctx.closePath();
        ctx.fill();
      }
    }

    draw(t) {
      const { ctx, w, h } = this;
      ctx.clearRect(0, 0, w, h);
      if (this.mode === "crack") {
        const grow = Math.min(1, t / 0.14);
        this.fillShards(ctx, grow);
        this.strokeWeb(ctx, grow);
        // impact bloom at the hit point
        const bloom = Math.exp(-t * 7);
        if (bloom > 0.02) {
          const g = ctx.createRadialGradient(this.center.x, this.center.y, 0, this.center.x, this.center.y, 120);
          g.addColorStop(0, `rgba(255,255,255,${bloom})`);
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
        return t > 0.6; // stays drawn (held crack)
      }
      // shatter: shards fly and fall with a thin bright edge
      let alive = 0;
      const gravity = 1400;
      for (const shard of this.shards) {
        const age = Math.max(0, t - shard.delay);
        const x = shard.x + shard.vx * age;
        const y = shard.y + shard.vy * age + gravity * age * age * 0.5;
        if (y - 80 > h || x < -120 || x > w + 120) continue;
        alive += 1;
        const fade = Math.max(0, 1 - age / 1.4);
        const flip = Math.cos(shard.tilt + age * shard.tiltSpeed);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(age * shard.spin);
        ctx.scale(Math.max(0.08, Math.abs(flip)) * (1 + age * 0.35), 1 + age * 0.35);
        ctx.beginPath();
        shard.poly.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x, p.y));
        ctx.closePath();
        const glint = Math.max(0, flip) ** 6;
        ctx.fillStyle = `rgba(${200 + glint * 55},${235 + glint * 20},255,${((0.14 + glint * 0.5) * fade).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${(0.75 * fade).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      return t > 0.4 && alive === 0 || t > 2.6;
    }
  }

  window.ShibakuLcdGlass = LcdGlass;
})();
