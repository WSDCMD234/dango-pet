// 极简 PNG 读写 + 画布（纯 Node，不装依赖）：做图标、预览图用
const zlib = require('zlib');

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

// '#rrggbb' / '#rgb' / 'rgba(r,g,b,a)' → [r, g, b, a(0~255)]
function parseColor(c) {
  if (Array.isArray(c)) return c.length === 3 ? [...c, 255] : c;
  if (c[0] === '#') {
    const h = c.length === 4 ? [...c.slice(1)].map(x => x + x).join('') : c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3] * 255) : 255]; }
  throw new Error('不认识的颜色 ' + c);
}

class Canvas {
  constructor(w, h, bg) {
    this.w = w; this.h = h; this.d = Buffer.alloc(w * h * 4);
    if (bg) this.rect(0, 0, w, h, bg);
  }
  // 画一个实心矩形（带透明度的会和底下混合）
  rect(x, y, w, h, color) {
    const [r, g, b, a] = parseColor(color);
    if (a === 0) return;
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0), x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * this.w + xx) * 4;
      if (a === 255) { this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = 255; continue; }
      const sa = a / 255, da = this.d[i + 3] / 255, oa = sa + da * (1 - sa);
      this.d[i] = Math.round((r * sa + this.d[i] * da * (1 - sa)) / oa);
      this.d[i + 1] = Math.round((g * sa + this.d[i + 1] * da * (1 - sa)) / oa);
      this.d[i + 2] = Math.round((b * sa + this.d[i + 2] * da * (1 - sa)) / oa);
      this.d[i + 3] = Math.round(oa * 255);
    }
  }
  // 把另一张画布贴上来（整数倍放大，最近邻）
  blit(src, dx, dy, scale = 1) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4; if (!src.d[i + 3]) continue;
      this.rect(dx + x * scale, dy + y * scale, scale, scale, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
    }
  }
  png() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) this.d.copy(raw, y * (this.w * 4 + 1) + 1, y * this.w * 4, (y + 1) * this.w * 4);
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  }
}

// 多张 PNG 打成一个 .ico（PNG-in-ICO）
function ico(pngs, sizes) {
  const head = Buffer.alloc(6 + 16 * pngs.length); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach((b, i) => {
    const e = 6 + 16 * i, n = sizes[i];
    head[e] = n >= 256 ? 0 : n; head[e + 1] = n >= 256 ? 0 : n;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length;
  });
  return Buffer.concat([head, ...pngs]);
}

module.exports = { Canvas, parseColor, ico };
