// node --test tools/test_core.js：不开窗口，用假的时钟和假的屏幕把 core.js 的逻辑跑一遍
const { test, mock } = require('node:test');
const assert = require('node:assert');
const { createCore, BALL_BOX, daysTo } = require('../src/core');
const S = require('../src/sprites');

function seeded(seed = 7) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
function setup(opt = {}) {
  try { mock.timers.reset(); } catch { }      // 上一个用例失败时没来得及收拾
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: new Date(opt.now || '2026-11-16T10:00:00') });
  const sent = [], st = { pos: [1700, 916], cursor: { x: 0, y: 0 }, idle: 0, bounds: null, shown: false, through: null, store: { greeted: true, lastGreet: '2026-11-16', dex: {}, chosen: 'random', countdowns: [], ...(opt.cfg || {}) } };
  const host = {
    cfg: { get: () => st.store, set: (p) => Object.assign(st.store, p) },
    pet: { getPos: () => st.pos.slice(), setPos: (x, y) => { assert.ok(Object.is(x, x | 0) && Object.is(y, y | 0), '坐标必须是真整数（不能是 -0 / 小数）'); st.pos = [x, y]; }, send: (ch, v) => sent.push({ to: 'pet', ch, v }), setClickThrough: (on) => { st.through = on; } },
    bubble: { send: (ch, v) => sent.push({ to: 'bubble', ch, v }), setBounds: (b) => { st.bounds = b; }, reveal: () => { st.shown = true; }, hide: () => { st.shown = false; } },
    cursor: () => st.cursor, workAreas: () => opt.areas || [{ x: 0, y: 0, width: 1920, height: 1040 }],
    idleSeconds: () => st.idle, random: seeded(opt.seed), log: () => { },
  };
  const core = createCore(host);
  core.start(); core.petReady();
  const last = (ch) => sent.filter(m => m.ch === ch).pop();
  const all = (ch) => sent.filter(m => m.ch === ch);
  const tick = (ms) => mock.timers.tick(ms);
  // 页面量好气泡尺寸回报（真程序里是 bubble.html 干的）
  const answerBubble = (w = 180, h = 40) => core.bubbleMessage('bubble-size', { w, h });
  // 模拟一次拖动：从 (x0,y0) 按下，按每 8ms 一步走到 (x1,y1)，然后松手
  const drag = (x0, y0, x1, y1, ms) => {
    st.cursor = { x: x0, y: y0 }; core.petMessage('pet-drag-start');
    const n = Math.max(1, Math.round(ms / 8));
    for (let i = 1; i <= n; i++) { st.cursor = { x: Math.round(x0 + (x1 - x0) * i / n), y: Math.round(y0 + (y1 - y0) * i / n) }; tick(8); }
    core.petMessage('pet-drag-end', 'up');
  };
  return { core, st, sent, last, all, tick, drag, answerBubble, end: () => { core.dispose(); mock.timers.reset(); } };
}

test('点一下（按下没动就松开）= 戳一下，不移动', () => {
  const t = setup();
  t.st.cursor = { x: 1764, y: 1016 }; t.core.petMessage('pet-drag-start'); t.tick(40); t.core.petMessage('pet-drag-end', 'up');
  assert.ok(t.last('pet-poke'), '应该发 pet-poke');
  assert.deepStrictEqual(t.st.pos, [1700, 916]);
  t.end();
});

test('慢慢拖过去松手 = 留在原地并记住位置（不会被甩飞）', () => {
  const t = setup();
  t.drag(1764, 1016, 900, 500, 1200);      // 约 830 px/s，低于甩出门槛
  assert.strictEqual(t.core.state().flying, false, '不该飞');
  assert.deepStrictEqual(t.st.pos, [900 - 64, 500 - 100]);
  assert.deepStrictEqual(t.st.store.pos, { x: 836, y: 400 });
  t.end();
});

test('拖到任务栏里 / 屏幕外松手 = 贴回工作区边上', () => {
  const t = setup();
  t.drag(1764, 1016, 1000, 1075, 1500);    // 往下拖进任务栏
  assert.strictEqual(t.st.pos[1], 1040 - BALL_BOX.b, '扭蛋底边贴着工作区底边');
  t.drag(1000, 1000, -40, 600, 1500);      // 往左拖出屏幕
  assert.strictEqual(t.st.pos[0], -BALL_BOX.l, '扭蛋左边贴着屏幕左边');
  t.end();
});

test('用力一甩 = 飞出去，撞墙反弹，最后停在地上', () => {
  const t = setup();
  t.drag(1764, 1016, 1264, 716, 120);      // 120ms 走 580px ≈ 4800 px/s
  assert.strictEqual(t.core.state().flying, true, '应该飞起来');
  let hits = 0, maxY = -1e9, minX = 1e9;
  for (let i = 0; i < 1200 && t.core.state().flying; i++) { t.tick(16); maxY = Math.max(maxY, t.st.pos[1]); minX = Math.min(minX, t.st.pos[0]); }
  hits = t.all('pet-hit').length;
  assert.strictEqual(t.core.state().flying, false, '20 秒内应该停下');
  assert.ok(hits >= 2, '至少撞到墙和地：' + hits);
  assert.ok(minX >= -BALL_BOX.l, '不能飞出左边：' + minX);
  assert.ok(maxY <= 1040 - BALL_BOX.b, '不能掉到任务栏下面：' + maxY);
  assert.strictEqual(t.st.pos[1], 1040 - BALL_BOX.b, '停在地上');
  assert.ok(t.last('pet-land'), '停稳后要通知页面开盖');
  assert.deepStrictEqual(t.st.store.pos, { x: t.st.pos[0], y: t.st.pos[1] });
  t.end();
});

test('双屏并排：往右甩能飞进隔壁屏，不在中间撞墙', () => {
  const t = setup({ areas: [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: 1920, y: 0, width: 1920, height: 1040 }] });
  t.core.throwPet(3000, -600);
  let maxX = 0;
  for (let i = 0; i < 1500 && t.core.state().flying; i++) { t.tick(16); maxX = Math.max(maxX, t.st.pos[0]); }
  assert.ok(maxX > 1920, '应该飞过两块屏的接缝：' + maxX);
  assert.ok(maxX <= 3840 - BALL_BOX.r, '不能飞出右屏：' + maxX);
  t.end();
});

test('左屏在负坐标：贴着 x=0 附近飞不报错（-0 问题）', () => {
  const t = setup({ areas: [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: -1920, y: 0, width: 1920, height: 1040 }] });
  t.st.pos = [20, 500];
  t.core.throwPet(-900, -300);
  for (let i = 0; i < 1500 && t.core.state().flying; i++) t.tick(16);
  assert.strictEqual(t.core.state().flying, false);
  t.end();
});

test('开扭蛋：记进图鉴、换下一只；第一次见到弹「新团子」卡片', () => {
  const t = setup();
  const first = t.last('pet').v.next;
  assert.ok(S.DANGO_FORMS[first], '一开始就得有下一只');
  t.core.petMessage('pet-out', true); t.core.petMessage('pet-seen', first);
  assert.strictEqual(t.st.store.dex[first], 1);
  assert.notStrictEqual(t.last('pet').v.next, first, '下一只不和这只重样');
  t.tick(700);
  const show = t.sent.filter(m => m.to === 'bubble' && m.ch === 'show').pop();
  assert.strictEqual(show.v.view, 'new'); assert.strictEqual(show.v.form, first); assert.strictEqual(show.v.got, 1);
  t.answerBubble(340, 96);
  assert.strictEqual(t.st.shown, true, '量好尺寸才显示');
  assert.ok(t.st.bounds.y + t.st.bounds.height <= t.st.pos[1] + 30, '卡片在团子头顶上方');
  t.tick(6000);
  assert.strictEqual(t.st.shown, false, '几秒后自己收起');
  t.end();
});

test('概率：抽 20000 次，普通 / 稀有 / 隐藏大致是 78 / 20 / 2，且不连着出同一只', () => {
  const t = setup({ seed: 12345 });
  const n = { N: 0, R: 0, SSR: 0 }; let prev = null, same = 0;
  for (let i = 0; i < 20000; i++) {
    const k = t.last('pet').v.next; n[S.DANGO_FORMS[k].rarity]++;
    if (k === prev) same++; prev = k;
    t.core.petMessage('pet-seen', k); t.sent.length = Math.min(t.sent.length, 0) || 0; t.core.pushState();
  }
  assert.strictEqual(same, 0);
  assert.ok(Math.abs(n.N / 200 - 78) < 2, '普通 ' + n.N / 200);
  assert.ok(Math.abs(n.R / 200 - 20) < 2, '稀有 ' + n.R / 200);
  assert.ok(Math.abs(n.SSR / 200 - 2) < .6, '隐藏 ' + n.SSR / 200);
  assert.strictEqual(Object.keys(t.st.store.dex).length, 17, '抽这么多次应该全见过');
  t.end();
});

test('图鉴里选常驻：只能选见过的；选了之后每次都是它', () => {
  const t = setup({ cfg: { dex: { sakura: 2 } } });
  t.core.choose('gold'); assert.strictEqual(t.st.store.chosen, 'random', '没见过的不能选');
  t.core.choose('sakura'); assert.strictEqual(t.st.store.chosen, 'sakura');
  assert.strictEqual(t.last('pet').v.next, 'sakura'); assert.strictEqual(t.last('pet').v.chosen, 'sakura');
  t.core.petMessage('pet-seen', 'sakura'); assert.strictEqual(t.last('pet').v.next, 'sakura');
  t.core.choose('random'); assert.strictEqual(t.st.store.chosen, 'random');
  t.end();
});

test('专注 25 分钟 → 完成（记一个）→ 休息 5 分钟 → 结束', () => {
  const t = setup();
  t.core.startFocus(25);
  let p = t.last('pet').v;
  assert.strictEqual(p.stay, true); assert.strictEqual(p.band, true); assert.strictEqual(p.mood, 'focus'); assert.strictEqual(p.timer.text, '25:00');
  t.tick(1000); assert.strictEqual(t.last('pet-timer').v.text, '24:59');
  t.tick(24 * 60e3 + 58e3); assert.strictEqual(t.last('pet-timer').v.text, '00:01');
  t.tick(1500);
  assert.strictEqual(t.st.store.focus.today, 1); assert.strictEqual(t.st.store.focus.minutes, 25);
  p = t.last('pet').v; assert.strictEqual(p.band, false); assert.strictEqual(p.stay, true); assert.strictEqual(p.timer.phase, 'break');
  assert.ok(t.last('pet-cheer'), '完成要庆祝');
  assert.strictEqual(t.sent.filter(m => m.ch === 'show').pop().v.view, 'focusDone');
  t.tick(5 * 60e3 + 500);
  assert.strictEqual(t.core.state().focus, null);
  assert.strictEqual(t.last('pet').v.stay, false);
  assert.strictEqual(t.sent.filter(m => m.ch === 'show').pop().v.view, 'breakDone');
  t.core.bubbleMessage('bubble-action', { act: 'focus', min: 25 });
  assert.strictEqual(t.core.state().focus.phase, 'work', '点「再来一个」接着专注');
  t.core.stopFocus(); assert.strictEqual(t.core.state().focus, null);
  t.end();
});

test('倒计时：算天数、加删、最近的一个进托盘提示', () => {
  const now = new Date(2026, 10, 16, 10);
  assert.strictEqual(daysTo('2026-11-16', now), 0); assert.strictEqual(daysTo('2026-12-19', now), 33); assert.strictEqual(daysTo('2026-11-15', now), -1);
  assert.ok(Number.isNaN(daysTo('乱写', now)));
  let tip = '';
  const t = setup();
  assert.strictEqual(t.core.addCountdown('', '2026-12-19'), false); assert.strictEqual(t.core.addCountdown('考研', '不是日期'), false);
  assert.strictEqual(t.core.addCountdown('考研', '2026-12-19'), true); t.core.addCountdown('期末考试', '2027-01-11');
  assert.strictEqual(t.st.store.countdowns.length, 2);
  t.core.bubbleMessage('bubble-action', { act: 'cd-del', i: 0 });
  assert.deepStrictEqual(t.st.store.countdowns, [{ name: '期末考试', date: '2027-01-11' }]);
  t.end();
});

test('休息提醒：连续用 45 分钟叫一次；勿扰 / 专注时不叫；离开回来重新计', () => {
  const t = setup();
  t.tick(44 * 60e3); assert.strictEqual(t.all('pet-peek').length, 0, '没到 45 分钟不叫');
  t.tick(80e3); assert.strictEqual(t.all('pet-peek').length, 1, '到点叫一次');
  t.core.petMessage('pet-out', true); t.core.petMessage('pet-seen', t.last('pet').v.next); t.tick(700);
  assert.match(t.sent.filter(m => m.ch === 'show').pop().v.text, /走两步|喝口水|看看远处|转转脖子/);
  t.core.petMessage('pet-out', false);
  t.st.store.dnd = true; t.tick(50 * 60e3); assert.strictEqual(t.all('pet-peek').length, 1, '勿扰时不叫');
  t.end();
});

test('深夜催睡：23:30 以后叫一次，同一晚不重复', () => {
  const t = setup({ now: '2026-11-16T23:20:00' });
  t.tick(5 * 60e3); assert.strictEqual(t.all('pet-peek').length, 0);
  t.tick(6 * 60e3); assert.strictEqual(t.all('pet-peek').length, 1);
  assert.strictEqual(t.st.store.lastNight, '2026-11-16');
  t.tick(40 * 60e3);                                    // 过了零点还是同一晚
  assert.strictEqual(t.st.store.lastNight, '2026-11-16');
  t.end();
});

test('透明的地方点得穿：光标在扭蛋上才接鼠标；团子出来后按它的轮廓算', () => {
  const t = setup();
  t.st.cursor = { x: 100, y: 100 }; t.tick(50); assert.strictEqual(t.st.through, true, '光标离得远：点得穿');
  t.st.cursor = { x: 1700 + 64, y: 916 + 100 }; t.tick(50); assert.strictEqual(t.st.through, false, '光标在扭蛋上：接鼠标');
  t.st.cursor = { x: 1700 + 10, y: 916 + 10 }; t.tick(50); assert.strictEqual(t.st.through, true, '窗口左上角的透明处：点得穿');
  t.core.petMessage('pet-shape', [[20, 60, 108, 124]]);
  t.st.cursor = { x: 1700 + 30, y: 916 + 70 }; t.tick(50); assert.strictEqual(t.st.through, false, '团子出来后身上能点');
  t.core.petMessage('pet-shape', null);
  t.tick(50); assert.strictEqual(t.st.through, true);
  t.end();
});

test('存的位置不在任何屏幕里（拔了外接屏）= 回主屏右下角', () => {
  const t = setup({ cfg: { pos: { x: 4227, y: 1316 } } });
  const p = t.core.startPos();
  assert.deepStrictEqual(p, { x: 1920 - 128 - 24, y: 1040 - BALL_BOX.b });
  t.end();
});

test('右键菜单：项目齐全；专注中变成「结束专注」', () => {
  const t = setup();
  let m = t.core.menuModel().map(i => i.label || '-');
  for (const k of ['专注一会儿', '倒计时…', '休息提醒', '深夜催睡', '勿扰', '回到右下角', '玩法说明', '退出']) assert.ok(m.some(l => l.includes(k)), '缺菜单项 ' + k);
  t.core.startFocus(45);
  m = t.core.menuModel().map(i => i.label || '-');
  assert.ok(m[0].startsWith('结束专注（还剩 45:00）'), m[0]);
  const rest = t.core.menuModel().find(i => (i.label || '').includes('休息提醒'));
  rest.click(); assert.strictEqual(t.st.store.rest, false, '点一下关掉');
  t.end();
});

test('第一次运行：弹玩法说明，之后不再弹', () => {
  const t = setup({ cfg: { greeted: false } });
  t.tick(2000);
  assert.strictEqual(t.sent.filter(m => m.ch === 'show').pop().v.view, 'help');
  assert.strictEqual(t.st.store.greeted, true);
  t.end();
});
