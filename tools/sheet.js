// node tools/sheet.js <out.png> [倍数] [只画这些形态,逗号分隔]：把所有团子（睁眼 / 闭眼）和扭蛋画成一张预览图
const fs = require('fs');
const path = require('path');
const { Canvas } = require('./lib/png');
const S = require('../src/sprites');

const out = process.argv[2] || path.join(__dirname, '..', 'data', 'sheet.png');
const K = Number(process.argv[3]) || 6;
const only = process.argv[4] ? process.argv[4].split(',') : null;
const keys = Object.keys(S.DANGO_FORMS).filter(k => !only || only.includes(k));

function dango(key, mode) {
  const c = new Canvas(S.DANGO_W, S.DANGO_H);
  for (const p of S.dangoGrid(key)) c.rect(p.x, p.y, 1, 1, p.c);
  const f = S.dangoFace(key);
  const ids = mode === 'closed' ? ['eyesClosed', 'blush', 'mouth'] : mode === 'fly' ? ['eyesClosed', 'blush', 'mouthO', 'sweat'] : ['eyesOpen', 'blush', 'mouth'];
  for (const id of ids) for (const [x, y, w, h, col] of f[id]) c.rect(x, y, w, h, col);
  return c;
}
function capsule(key, opt) {
  const c = new Canvas(12, 12);
  for (const p of S.capsulePixels(key, opt)) c.rect(p.x, p.y, 1, 1, p.c);
  return c;
}

const cols = Math.min(keys.length, 6), cellW = (S.DANGO_W + 4) * K, cellH = (S.DANGO_H + 4) * K;
const rows = Math.ceil(keys.length / cols);
const BGS = ['#e9ecef', '#2b2f36', '#6fa8dc'];
const sheet = new Canvas(cols * cellW, rows * cellH * 3 + (12 + 6) * K * 2, '#e9ecef');
// 三种底色各画一遍：浅色 / 深色 / 壁纸蓝，看描边在不同桌面上清不清楚
BGS.forEach((bg, bi) => {
  sheet.rect(0, bi * rows * cellH, sheet.w, rows * cellH, bg);
  keys.forEach((k, i) => {
    const x = (i % cols) * cellW + 2 * K, y = bi * rows * cellH + Math.floor(i / cols) * cellH + 2 * K;
    sheet.blit(dango(k, bi === 1 ? 'closed' : bi === 2 ? 'fly' : 'open'), x, y, K);
  });
});
// 扭蛋：每种形态一个（看里面脑袋的颜色），再来一排开盖 / 眨眼
const y0 = rows * cellH * 3;
sheet.rect(0, y0, sheet.w, (12 + 6) * K, '#6fa8dc');
sheet.rect(0, y0 + (12 + 6) * K, sheet.w, (12 + 6) * K, '#2b2f36');
keys.forEach((k, i) => {
  sheet.blit(capsule(k, {}), i * 16 * K + 2 * K, y0 + 3 * K, K);
  sheet.blit(capsule(k, { eyes: false }), i * 16 * K + 2 * K, y0 + (12 + 6) * K + 3 * K, K);
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, sheet.png());
console.log('ok', out, sheet.w + 'x' + sheet.h, keys.length + ' 种');
