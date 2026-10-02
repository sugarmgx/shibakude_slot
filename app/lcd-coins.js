// Coin shower on the LCD: coins burst up from the bottom, tumble, then get
// pulled into the coin counter. Cosmetic only; it never reads game state.
(() => {
  "use strict";

  class LcdCoins {
    constructor(host) {
      this.host = host;
      this.canvas = document.createElement("canvas");
      this.canvas.className = "lcd-coins";
      this.canvas.setAttribute("aria-hidden", "true");
      host?.append(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.coins = [];
      this.raf = 0;
      this.last = 0;
    }

    resize() {
      const rect = this.host.getBoundingClientRect();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      this.w = Math.max(1, rect.width);
      this.h = Math.max(1, rect.height);
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.rect = rect;
    }

    // count coins; target is a DOM node they fly into; onArrive(i) per coin.
    shower(count, target, onArrive) {
      if (!this.coins.length) this.resize();
      const t = target?.getBoundingClientRect?.();
      const tx = t && t.width ? t.left + t.width / 2 - this.rect.left : this.w * 0.5;
      const ty = t && t.height ? t.top + t.height / 2 - this.rect.top : this.h * 0.82;
      const now = performance.now();
      for (let i = 0; i < count; i += 1) {
        const size = Math.max(9, this.h * (0.045 + Math.random() * 0.025));
        this.coins.push({
          x: this.w * (0.5 + (Math.random() - 0.5) * 0.18),
          y: this.h + size,
          vx: (Math.random() - 0.5) * this.w * 0.9,
          vy: -this.h * (1.5 + Math.random() * 1.1),
          spin: 6 + Math.random() * 10,
          phase: Math.random() * Math.PI * 2,
          size,
          born: now + i * 18,
          homeAt: now + 650 + i * 22 + Math.random() * 200,
          tx, ty, onArrive, index: i,
        });
      }
      if (!this.raf) { this.last = now; this.raf = requestAnimationFrame((n) => this.tick(n)); }
    }

    clear() {
      this.coins = [];
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.ctx.clearRect(0, 0, this.w || 0, this.h || 0);
    }

    tick(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const { ctx } = this;
      ctx.clearRect(0, 0, this.w, this.h);
      const gravity = this.h * 3.4;
      this.coins = this.coins.filter((coin) => {
        if (now < coin.born) return true;
        if (now >= coin.homeAt) {
          // Pulled into the counter, accelerating.
          const k = Math.min(1, (now - coin.homeAt) / 260);
          coin.x += (coin.tx - coin.x) * (0.12 + k * 0.5);
          coin.y += (coin.ty - coin.y) * (0.12 + k * 0.5);
          coin.size *= 0.97;
          if (Math.hypot(coin.tx - coin.x, coin.ty - coin.y) < 6 || k >= 1) {
            coin.onArrive?.(coin.index);
            return false;
          }
        } else {
          coin.vy += gravity * dt;
          coin.x += coin.vx * dt;
          coin.y += coin.vy * dt;
        }
        coin.phase += coin.spin * dt;
        this.drawCoin(coin);
        return true;
      });
      if (this.coins.length) this.raf = requestAnimationFrame((n) => this.tick(n));
      else { this.raf = 0; ctx.clearRect(0, 0, this.w, this.h); }
    }

    drawCoin(coin) {
      const { ctx } = this;
      const face = Math.cos(coin.phase);
      const rx = Math.max(1.2, Math.abs(face) * coin.size);
      const ry = coin.size;
      ctx.save();
      ctx.translate(coin.x, coin.y);
      // Rim
      ctx.fillStyle = "#8a5a10";
      ctx.beginPath();
      ctx.ellipse(face < 0 ? -1.5 : 1.5, 1.5, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // Face with a moving glint
      const glint = (Math.sin(coin.phase * 2) + 1) / 2;
      const grad = ctx.createLinearGradient(-rx, -ry, rx, ry);
      grad.addColorStop(0, "#fff6c8");
      grad.addColorStop(0.35 + glint * 0.3, "#ffd23a");
      grad.addColorStop(1, "#c98a12");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      if (rx > coin.size * 0.4) {
        ctx.strokeStyle = "#a8700e";
        ctx.lineWidth = Math.max(1, coin.size * 0.12);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * 0.68, ry * 0.68, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  window.ShibakuLcdCoins = LcdCoins;
})();
