// node tools/make_icon.js：生成 assets/icon.ico、icon.png、tray.png、tray@2x.png（纯 Node，不用装东西）
// 大图标（128 / 256）用 sprites.js 里的原味团子；小图标（16~64）用下面这张 16×16 的简化版，小尺寸下更清楚
const fs = require('fs');
const path = require('path');
const { Canvas, ico } = require('./lib/png');
const S = require('../src/sprites');

const SMALL = [
  '................',
  '..oo........oo..',
  '.oibo......obio.',
  '.obbboooooobbbo.',
  '.obbbbbbbbbbbbo.',
  'obbbbbbbbbbbbbbo',
  'obbwEEbbbbwEEbbo',
  'obbEEEbbbbEEEbbo',
  'obbEEEbbbbEEEbbo',
  'oPPbbbbMMbbbbPPo',
  'obbbbbbbbbbbbbbo',
  'obbllllllllllbbo',
  '.obllllllllllbo.',
  '..obbbbbbbbbbo..',
  '...oooooooooo...',
  '................',
];
const P = S.DANGO_FORMS.dango.pal;
const COL = { o: P.o, b: P.b, l: P.l, i: P.i, P: '#ff8fa3', E: '#2b1d10', w: '#ffffff', M: '#2b1d10' };

function small(scale) {
  const c = new Canvas(16 * scale, 16 * scale);
  SMALL.forEach((row, y) => [...row].forEach((ch, x) => { if (COL[ch]) c.rect(x * scale, y * scale, scale, scale, COL[ch]); }));
  return c;
}
function big(size) {
  const k = Math.floor(size / 32), c = new Canvas(size, size);
  const ox = Math.round((size - S.DANGO_W * k) / 2), oy = Math.round((size - S.DANGO_H * k) / 2) - k;
  for (const p of S.dangoGrid('dango')) c.rect(ox + p.x * k, oy + p.y * k, k, k, p.c);
  const f = S.dangoFace('dango');
  for (const id of ['eyesOpen', 'blush', 'mouth']) for (const [x, y, w, h, col] of f[id]) c.rect(ox + x * k, oy + y * k, w * k, h * k, col);
  return c;
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
const sizes = [16, 32, 48, 64, 128, 256];
const pngs = sizes.map(n => (n <= 64 ? small(n / 16) : big(n)).png());
fs.writeFileSync(path.join(out, 'icon.ico'), ico(pngs, sizes));
fs.writeFileSync(path.join(out, 'icon.png'), pngs[5]);
fs.writeFileSync(path.join(out, 'tray.png'), pngs[0]);
fs.writeFileSync(path.join(out, 'tray@2x.png'), pngs[1]);
console.log('图标好了：', sizes.join(' / '));
