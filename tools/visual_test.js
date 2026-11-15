// 看得见的自测：让真程序在离屏窗口里把各种动作演一遍，逐帧截成拼图，人（或 AI）看图检查
// 用法（PowerShell）：$env:DANGO_TEST='tools/visual_test.js'; $env:DANGO_OUT='输出目录'; node_modules\electron\dist\electron.exe .
// 可选 DANGO_ONLY=start,poke,throw,...  只跑其中几段
const fs = require('fs');
const path = require('path');
const { Canvas } = require('./lib/png');

module.exports = async function ({ app, core, cfg, pet, bubble, DATA, host }) {
  const OUT = process.env.DANGO_OUT || path.join(DATA, 'shots');
  const only = process.env.DANGO_ONLY ? process.env.DANGO_ONLY.split(',') : null;
  fs.mkdirSync(OUT, { recursive: true });
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const js = (code) => pet().webContents.executeJavaScript(code);
  const note = (...a) => fs.appendFileSync(path.join(OUT, 'log.txt'), a.join(' ') + '\n');

  // 把窗口当前画面抓成 RGBA 画布（按窗口的逻辑尺寸缩回 1 倍）
  async function grab(win) {
    const img = await win.webContents.capturePage();
    const [w, h] = win.getSize();
    const b = img.resize({ width: w, height: h, quality: 'good' }).toBitmap();
    const c = new Canvas(w, h);
    // 抓到的是 BGRA 且颜色已经乘过透明度，这里换成 RGBA 并除回去，半透明的光效才不会发灰
    for (let i = 0; i < w * h; i++) { const al = b[i * 4 + 3], k = al ? 255 / al : 0; c.d[i * 4] = Math.min(255, b[i * 4 + 2] * k); c.d[i * 4 + 1] = Math.min(255, b[i * 4 + 1] * k); c.d[i * 4 + 2] = Math.min(255, b[i * 4] * k); c.d[i * 4 + 3] = al; }
    return c;
  }
  // 连拍一段，拼成一张图（每格 128×128，灰底棋盘格好看出透明）
  async function series(name, ms, every, cols = 12) {
    const frames = [], t0 = Date.now();
    while (Date.now() - t0 < ms) { const t = Date.now(); frames.push(await grab(pet())); const left = every - (Date.now() - t); if (left > 0) await wait(left); }
    const rows = Math.ceil(frames.length / cols), sheet = new Canvas(cols * 130, rows * 130, '#8a9099');
    frames.forEach((f, i) => { const x = (i % cols) * 130 + 1, y = Math.floor(i / cols) * 130 + 1; sheet.rect(x, y, 128, 128, '#aab0b8'); sheet.blit(f, x, y, 1); });
    fs.writeFileSync(path.join(OUT, name + '.png'), sheet.png());
    note(name, frames.length, 'frames');
  }
  async function shotBubble(name, bg = '#6fa8dc') {
    await wait(450);
    const c = await grab(bubble()), out = new Canvas(c.w + 16, c.h + 16, bg);
    out.blit(c, 8, 8, 1);
    fs.writeFileSync(path.join(OUT, 'bubble_' + name + '.png'), out.png());
    note('bubble', name, c.w + 'x' + c.h, JSON.stringify(bubble().getBounds()), 'pet', pet().getPosition().join(','));
  }
  const run = async (name, fn) => { if (only && !only.includes(name)) return; note('--', name); try { await fn(); } catch (e) { note('FAIL', name, e && e.stack); } };

  await new Promise(r => pet().webContents.once('did-finish-load', r));
  await run('start', () => series('01_start', 1500, 90));
  await wait(only ? 1600 : 400);

  await run('poke', async () => {
    core.force('sakura');
    pet().webContents.send('pet-poke');
    const s = series('02_poke', 9600, 160);
    await wait(2300); await shotBubble('new');
    await s;
  });
  await run('toast', async () => {
    cfg.set({ dex: { ...cfg.get().dex, matcha: 1 } }); core.force('matcha');
    pet().webContents.send('pet-poke');
    await wait(2600); core.toast('DDL 是第一生产力'); await shotBubble('toast');
    await series('03_out_idle', 600, 200, 3);
    await wait(4500);
  });
  await run('cursor', async () => {
    // 光标从右边靠近 → 往左边绕 → 停在扭蛋上（掀盖偷看）
    const sweep = async (dx, d, n) => { for (let i = 0; i < n; i++) { pet().webContents.send('pet-cursor', { dx, dy: -20, d }); await wait(80); } };
    const s = series('04_cursor', 5200, 200);
    await sweep(200, 200, 12); await sweep(-200, 200, 12); await sweep(2, 5, 34); await sweep(0, 500, 3);
    await s;
  });
  await run('throw', async () => {
    core.force('frog');
    core.throwPet(-3000, -1300);
    await series('05_throw', 2400, 60);
    await series('06_land', 6500, 220);
    await wait(1500);
  });
  await run('dizzy', async () => {
    core.force('panda');
    core.throwPet(4900, -1200);
    await wait(3000);
    await series('07_dizzy', 7000, 200);
    await wait(2500);
  });
  await run('sulk', async () => {
    await js('angryUntil = Date.now() + 6000; sulk(); api.send("pet-event", "sulk")');
    const s = series('08_sulk', 1500, 110);
    await shotBubble('sulk'); await s;
    await wait(5000);
  });
  await run('focus', async () => {
    core.force('dango');
    core.startFocus(25, 7);
    await wait(3200); await shotBubble('focus_start');
    await series('09_focus', 600, 200, 3);
    await wait(2300);
    const s = series('10_cheer', 2600, 110);
    await wait(700); await shotBubble('focus_done');
    await s;
    await wait(2500); await shotBubble('break_done');
    core.hideBubble(); await js('peekUntil = 0'); await wait(3500);
  });
  await run('morph', async () => {
    cfg.set({ dex: { ...cfg.get().dex, gold: 1, bunny: 1 } });
    core.choose('gold');
    await wait(2200);
    await series('11_morph', 3600, 110);
    await wait(4500);
    core.choose('random'); await wait(600);
  });
  await run('alert', async () => {
    core.api.setCount(3);
    await wait(2600);
    await series('12_alert', 1100, 90);
    core.api.setCount(0); await wait(3000);
  });
  await run('bubbles', async () => {
    cfg.set({ dex: { dango: 4, sakura: 2, matcha: 1, boba: 3, pudding: 1, bunny: 1, panda: 1, gold: 1 } });
    core.showBubble({ view: 'help', keep: true, version: core.api.version, first: true }); await shotBubble('help');
    core.bubbleMessage('bubble-action', { act: 'dex' }); await shotBubble('dex');
    core.bubbleMessage('bubble-action', { act: 'choose', form: 'panda' }); await shotBubble('dex_chosen');
    core.bubbleMessage('bubble-action', { act: 'choose', form: 'random' });
    core.addCountdown('考研', '2026-12-19'); core.addCountdown('期末考试', '2027-01-11');
    core.menuModel().find(m => (m.label || '').startsWith('倒计时')).click(); await shotBubble('countdown');
    core.api.say('喝水', '起来走两步，喝口水'); await shotBubble('say');
    core.showBubble({ view: 'new', form: 'gold', got: 9, total: 17 }); await shotBubble('new_ssr');
    core.toast('距离「考研」还有 33 天'); await shotBubble('toast_cd');
    core.hideBubble();
  });
  await run('mod', async () => {
    // 改装：AI 捏团子（接口用假的顶替，1.5 秒后回一份配方）、图鉴里的团子包和扭蛋样式、打赏
    const LEMON = { name: '柠檬团子', say: '酸得眯眼，提神', lines: ['来一口？', '维 C 拉满'], colors: { outline: '#7a6410', body: '#ffe14d', belly: '#fff6b0', accent: '#6fbf3f', accent2: '#ffffff', eye: '#2b1d10' }, belly: true, ears: 'none', tail: 'none', pattern: 'none',
      topper: ['..aa..', '.aaaa.', '..n...'], marks: [], front: [{ x: 6, y: 14, w: 5, h: 3, color: '#26262e' }, { x: 17, y: 14, w: 5, h: 3, color: '#26262e' }, { x: 11, y: 15, w: 6, h: 1, color: '#26262e' }] };
    let ready = false;
    host.ai.config = () => ({ provider: 'claude', baseUrl: '', model: 'claude-opus-5-5', hasKey: ready, ready });
    host.ai.save = () => { ready = true; return { ok: true }; };
    host.ai.make = () => new Promise(r => setTimeout(() => r({ ok: true, recipe: LEMON }), 1500));
    host.packs.save('demo', { name: '示例包', capsule: { name: '西瓜', pal: { c: '#58b368', k: '#3d9150', t: '#8fd39a', g: '#ff8f9c88' } }, dangos: [{ ...LEMON, name: '青柠团子', colors: { ...LEMON.colors, body: '#b8e06a', belly: '#e6f5c0', outline: '#4f6a1c' }, front: [], pattern: 'dots' }, { name: '草莓团子', say: '甜的', colors: { outline: '#7a2a3a', body: '#ff8fa3', accent: '#58a83f', accent2: '#ffe6ea' }, ears: 'bunny', pattern: 'none', marks: [[8, 11, 'accent2'], [14, 10, 'accent2'], [19, 12, 'accent2']] }] });
    core.loadPacks();
    core.openAI(); await shotBubble('ai_setup');
    core.bubbleMessage('bubble-action', { act: 'ai-save', provider: 'claude', key: 'sk-test' }); await shotBubble('ai_ask');
    core.bubbleMessage('bubble-action', { act: 'ai-make', text: '戴墨镜的柠檬团子' });
    await wait(500); await shotBubble('ai_busy'); await series('13_ai_busy', 300, 150, 2);
    await wait(1400); await shotBubble('ai_result');
    core.bubbleMessage('bubble-action', { act: 'ai-keep' });
    await wait(2600); await series('14_ai_new', 600, 200, 3); await shotBubble('ai_new_card');
    await wait(7500);
    core.bubbleMessage('bubble-action', { act: 'dex' }); await shotBubble('dex_packs');
    core.bubbleMessage('bubble-action', { act: 'capsule', id: 'pack:demo' }); await wait(1200); await series('15_capsule', 300, 150, 2);
    core.bubbleMessage('bubble-action', { act: 'capsule', id: 'mint' }); await wait(1200); await series('16_capsule_mint', 300, 150, 2);
    core.menuModel().find(m => m.label === '请团子喝杯奶茶').click(); await shotBubble('donate');
    core.hideBubble();
  });
  note('done');
  app.quit();
};
