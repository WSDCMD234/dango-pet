// 万能团子的「脑子」：拖拽 / 甩飞、抽扭蛋、图鉴、专注、倒计时、提醒、说话。
// 不直接碰 Electron，所有跟系统打交道的事都通过 host 做 —— 所以主进程能用，测试和宣传片的模拟桌面也能用同一份逻辑。
//
// host 需要提供：
//   cfg            { get(), set(patch) }                      存档
//   pet            { getPos() → [x, y], setPos(x, y), send(频道, 数据) }   团子窗口
//   bubble         { send(频道, 数据), setBounds({x,y,width,height}), reveal(要不要焦点), hide() }   气泡窗口
//   cursor()       → { x, y }                                 鼠标位置
//   workAreas()    → [{ x, y, width, height }]                所有屏幕的工作区（第一个是主屏）
//   idleSeconds()  → 多久没动鼠标键盘了（可选）
//   autoStart      { get(), set(bool) }（可选）  quit()（可选）  log(...)（可选）  random()（可选）  tray(提示文字)（可选）
//   packs          { list() → [{ id, …包文件的内容 }], save(id, 包), remove(id), openFolder()（可选）, pick() → Promise<null | { ok, id } | { ok: false, error }>（可选，让用户选一个文件加进来）}（可选）  扩展包（改装）
//   ai             { config(), save(设置), make(一句描述) → Promise<{ ok, recipe } | { ok: false, error }> }（可选）  AI 捏团子
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sprites'), require('./lines'));
  else root.DangoCore = factory(root, root.DANGO_LINES);
})(typeof self !== 'undefined' ? self : this, function (S, LINES) {
  const FORMS = S.DANGO_FORMS, RARITY = S.DANGO_RARITY, BUILTIN = S.DANGO_BUILTIN;      // BUILTIN = 自带的 17 只；FORMS 里还会有扩展包 / AI 捏的
  const PET = 128;                                     // 团子窗口边长
  const CARD_W = 340;                                  // 卡片气泡宽
  const BALL_BOX = { l: 40, r: 88, t: 76, b: 124 };    // 扭蛋在 128×128 窗口里的位置（碰撞按它算）
  const THROW_SPEED = 1800;                            // 松手瞬间比这快才算甩（px/s），不然就放在原地
  const REST_MIN = 45;                                 // 连续用电脑多久提醒休息
  const BREAK_MIN = 5;                                 // 专注完休息几分钟
  const VERSION = '2.2.0';

  // 坐标转成真整数：Math.round 会得到 -0，Electron 的 setPosition / setBounds 不认 -0（在屏幕最左边会报错）
  const ri = (v) => (Math.round(v) | 0);
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  // 到某天还有几天（按日历日算，今天 = 0，过了是负数）
  function daysTo(date, now = new Date()) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date || ''); if (!m) return NaN;
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()), b = new Date(+m[1], +m[2] - 1, +m[3]);
    return Math.round((b - a) / 86400e3);
  }

  function createCore(host) {
    const cfg = host.cfg, pet = host.pet, bub = host.bubble;
    const log = host.log || (() => { }), rnd = host.random || Math.random;
    const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];
    const timers = [];
    const every = (ms, fn) => { const t = setInterval(fn, ms); timers.push(t); return t; };
    const listeners = {};
    const emit = (ev, ...a) => { for (const fn of listeners[ev] || []) { try { fn(...a); } catch (e) { log('plugin error', ev, e && e.message); } } };

    let count = 0;            // 待办数（插件用）：>0 时团子出来蹦着叫你
    let mood = '';            // 插件指定的表情，空 = 自动
    let next = null;          // 扭蛋里下一只是谁
    let petOut = false;       // 团子现在在外面吗（页面告诉我们的）
    let focus = null;         // 专注中：{ phase: 'work' | 'break', end, min }
    let forced = [];          // 测试 / 演示：接下来几次指定抽到谁

    // ---------- 扩展包（改装）----------
    // 一个包 = 一个 JSON 文件：若干只团子（配方或者完整画法）+ 可选的扭蛋样式、出场 / 变身方式、右键菜单。自带的 17 只算一个叫 base 的包。
    let packs = [];           // [{ id, name, keys, capsule, menu }]
    let aiPending = null;     // AI 刚捏出来、还没决定收不收的那只
    let aiBusy = false;
    function loadPacks() {
      for (const k of Object.keys(FORMS)) if (!BUILTIN.includes(k) && !(aiPending && aiPending.key === k)) S.unregisterDango(k);
      packs = [];
      for (const p of (host.packs ? host.packs.list() : [])) {
        const r = S.dangoCheckPack(p);
        for (const s of r.skipped || []) log('pack skip', p.id, s.i, s.error);
        if (!r.ok) continue;
        // 出场 / 变身方式是整包定的，记在每只团子身上一起发给页面（anim）
        const keys = r.forms.map(({ i, form }) => { S.registerDango(p.id + '#' + i, { ...form, pack: p.id, ...(r.anim ? { anim: r.anim } : {}) }); return p.id + '#' + i; });
        packs.push({ id: p.id, name: r.name || String(p.id).slice(0, 14), keys, capsule: r.capsule, menu: keys.length ? r.menu : '' });
      }
      syncForms();
    }
    // 把自带以外的团子和扭蛋样式发给两个页面（它们各自有一份 sprites.js，得让它们也认识）
    const capStyles = () => { const o = {}; for (const p of packs) if (p.capsule) o['pack:' + p.id] = p.capsule; return o; };
    function syncForms() {
      const forms = {}; for (const [k, d] of Object.entries(FORMS)) if (!BUILTIN.includes(k)) forms[k] = d;
      const msg = { forms, capsules: capStyles() };
      pet.send('forms', msg); bub.send('forms', msg);
    }
    const packOff = () => new Set(cfg.get().packsOff || []);
    function pool() {
      const off = packOff(); let ks = off.has('base') ? [] : BUILTIN.slice();
      for (const p of packs) if (!off.has(p.id)) ks = ks.concat(p.keys);
      return ks.length ? ks : BUILTIN.slice();
    }

    // ---------- 抽扭蛋 ----------
    function roll(exclude) {
      const c = cfg.get().chosen;
      if (c && c !== 'random' && FORMS[c]) return c;
      while (forced.length) { const k = forced.shift(); if (FORMS[k]) return k; }
      const ks = pool();
      // 先抽稀有度，再在这一档里随机；不和上一只重样
      const r = rnd() * 100, tier = r < RARITY.SSR.odds ? 'SSR' : r < RARITY.SSR.odds + RARITY.R.odds ? 'R' : 'N';
      // 自制的（没标稀有度的）单独算：池子里有的话，四次里有一次出它们
      const diy = ks.filter(k => FORMS[k].rarity === 'DIY' && k !== exclude);
      if (diy.length && rnd() < .25) return pickOne(diy);
      let cand = ks.filter(k => FORMS[k].rarity === tier && k !== exclude);
      if (!cand.length) cand = ks.filter(k => k !== exclude);
      return pickOne(cand.length ? cand : ks);
    }
    const dexCount = () => Object.keys(cfg.get().dex || {}).filter(k => BUILTIN.includes(k)).length;

    // ---------- 状态同步给团子页面 ----------
    function timerText() {
      if (!focus) return null;
      const s = Math.max(0, Math.ceil((focus.end - Date.now()) / 1000));
      return { text: `${pad(Math.floor(s / 60))}:${pad(s % 60)}`, phase: focus.phase };
    }
    function pushState() {
      if (!next) next = roll();
      if (!FORMS[next]) next = roll();
      const m = mood || (aiBusy ? 'busy' : count ? 'alert' : focus && focus.phase === 'work' ? 'focus' : 'idle');
      const chosen = FORMS[cfg.get().chosen] ? cfg.get().chosen : 'random';
      pet.send('pet', { mood: m, count, next, chosen, capsule: cfg.get().capsule || 'orange', stay: !!focus, band: !!focus && focus.phase === 'work', timer: timerText() });
      if (host.tray) host.tray(trayTip());
    }
    function trayTip() {
      if (count) return `万能团子：${count} 件事`;
      if (focus) return `万能团子：${focus.phase === 'work' ? '专注中' : '休息中'} ${timerText().text}`;
      const cd = nearestCountdown();
      return cd ? `万能团子 · ${cdLine(cd)}` : '万能团子';
    }

    // ---------- 气泡 ----------
    // 两种：toast = 团子头顶的一句话；card = 带标题的卡片（说明 / 图鉴 / 倒计时……）
    let bubble = null, bubbleTimer = null;
    function showBubble(content, ms = 0) {
      clearTimeout(bubbleTimer);
      bubble = { content, kind: content.view === 'toast' ? 'toast' : 'card', w: 0, h: 0, shown: false };
      bub.send('show', content);                 // 页面画完会回 bubble-size，量好尺寸再定位、显示
      if (ms) bubbleTimer = setTimeout(hideBubble, ms);
    }
    function hideBubble() { clearTimeout(bubbleTimer); if (bubble) { bubble = null; bub.hide(); } }
    function onBubbleSize({ w, h }) {
      if (!bubble) return;
      bubble.w = Math.min(Math.max(w, 40), 420); bubble.h = Math.min(Math.max(h, 24), 640);
      placeBubble();
      if (!bubble.shown) { bubble.shown = true; bub.reveal(!!bubble.content.focus); }
    }
    function nearestWorkArea(p) {
      const was = host.workAreas();
      const hit = was.find(w => p.x >= w.x && p.x < w.x + w.width && p.y >= w.y && p.y < w.y + w.height);
      if (hit) return hit;
      const dist = (w) => Math.hypot(Math.max(w.x - p.x, 0, p.x - (w.x + w.width)), Math.max(w.y - p.y, 0, p.y - (w.y + w.height)));
      return was.slice().sort((a, b) => dist(a) - dist(b))[0];
    }
    function placeBubble() {
      if (!bubble || !bubble.w) return;
      const [px, py] = pet.getPos();
      const d = nearestWorkArea({ x: px + 64, y: py + 100 });
      const head = py + (petOut ? 26 : 74);       // 团子 / 扭蛋的头顶
      let x = bubble.kind === 'toast' ? px + 64 - bubble.w / 2 : px + PET - bubble.w - 8;
      let y = head - bubble.h - 2, below = false;
      if (y < d.y + 4) { y = Math.min(py + PET + 2, d.y + d.height - bubble.h - 4); below = true; }   // 上面放不下就放下面
      x = Math.max(d.x + 4, Math.min(x, d.x + d.width - bubble.w - 4));
      bub.setBounds({ x: ri(x), y: ri(y), width: ri(bubble.w), height: ri(bubble.h) });
      bub.send('tail', { x: ri(px + 64 - x), below });
    }
    // 头顶冒一句话；用户正开着卡片（图鉴之类）时不打断
    const userCard = () => bubble && bubble.kind === 'card' && bubble.content.keep;
    function toast(text, ms = 3600) { if (!text || userCard()) return; showBubble({ view: 'toast', text }, ms); }

    // ---------- 说什么 ----------
    function hourLine(h = new Date().getHours()) {
      const row = LINES.hours.find(([a, b]) => h >= a && h < b);
      return row ? pickOne(row.slice(2)) : null;
    }
    function nearestCountdown() {
      const list = (cfg.get().countdowns || []).map(c => ({ ...c, n: daysTo(c.date) })).filter(c => c.n >= 0);
      return list.sort((a, b) => a.n - b.n)[0] || null;
    }
    const cdLine = (c) => fill(c.n === 0 ? LINES.cdToday : c.n <= 7 ? LINES.cdNear : LINES.cdFar, c);
    function pokeLine(form) {
      const f = FORMS[form], cd = nearestCountdown(), r = rnd();
      if (f && f.rarity === 'SSR') return pickOne(LINES.hidden);
      if (f && f.lines && f.lines.length && r < .5) return pickOne(f.lines);      // 自制的团子有自己的台词
      if (cd && r < .25) return cdLine(cd);
      if (f && f.say && r < .45) return `${f.name}：${f.say}`;      // 没写介绍的（自制的可以不写）就不念这句
      if (f && f.rarity === 'R' && r < .6) return pickOne(LINES.rare);
      return (r < .8 && hourLine()) || pickOne(LINES.poke);
    }

    // ---------- 团子出来了（页面在放出来的那一刻告诉我们是谁）----------
    let pendingSay = null;    // 已经定好出来要说的话（提醒 / 专注开始）
    function onSeen(form) {
      if (!FORMS[form]) return;
      const dex = { ...(cfg.get().dex || {}) }; dex[form] = (dex[form] || 0) + 1;
      cfg.set({ dex });
      const isNew = dex[form] === 1;
      next = roll(form); pushState();
      emit('seen', form, isNew);
      if (FORMS[form].rarity === 'SSR') pet.send('pet-cheer', { big: true });
      if (count > 0) return;
      const say = pendingSay; pendingSay = null;
      setTimeout(() => {
        if (say) return toast(say.text, say.ms);
        if (userCard()) return;
        if (isNew) return showBubble({ view: 'new', form, got: dexCount(), total: BUILTIN.length }, 5200);
        if (!focus && rnd() < .8) toast(pokeLine(form));
      }, 650);
    }
    // 让团子自己出来说句话（提醒用）。生气 / 正忙时页面不会理，那就只冒气泡
    function nudge(text, ms = 7000) {
      if (petOut) return toast(text, ms);
      pendingSay = { text, ms };
      pet.send('pet-peek', { ms: ms + 1500 });
      setTimeout(() => { if (pendingSay && pendingSay.text === text) { pendingSay = null; toast(text, ms); } }, 2600);
    }

    // ---------- 拖动 / 甩出去 ----------
    // 按下就由这边按 8ms 读光标位置跟着走（不靠页面的 mousemove：甩得快光标会跑出窗口）；离按下点超过 4px 才算拖，没动算点
    // 松手时按最后 ~80ms 的速度：够快就甩出去（重力、撞屏幕边反弹、多屏可穿过），不够快就留在原地
    let dragOff = null, dragTrail = [], flyTimer = null, dragTimer = null, dragMoved = false, dragStart = null;
    const stopFly = () => { if (flyTimer) { clearInterval(flyTimer); flyTimer = null; } };
    const stopDrag = () => { if (dragTimer) { clearInterval(dragTimer); dragTimer = null; } };
    function trailVel(ms) {
      const now = Date.now(), rec = dragTrail.filter(p => now - p.t <= ms);
      if (rec.length < 2) return { vx: 0, vy: 0 };
      const a = rec[0], b = rec[rec.length - 1], dt = Math.max(8, b.t - a.t) / 1000;
      return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
    }
    function dragBegin() {
      stopFly(); stopDrag();
      const c = host.cursor(), [x, y] = pet.getPos();
      dragOff = { dx: c.x - x, dy: c.y - y }; dragStart = c; dragMoved = false;
      dragTrail = [{ t: Date.now(), x: c.x, y: c.y }];
      const step = () => {
        if (!dragOff) return stopDrag();
        const p = host.cursor();
        if (!dragMoved) { if (Math.abs(p.x - dragStart.x) + Math.abs(p.y - dragStart.y) <= 4) return; dragMoved = true; }
        pet.setPos(ri(p.x - dragOff.dx), ri(p.y - dragOff.dy));
        dragTrail.push({ t: Date.now(), x: p.x, y: p.y }); if (dragTrail.length > 60) dragTrail.shift();
        placeBubble();
        pet.send('pet-held', { on: true, vx: trailVel(60).vx });
      };
      step(); dragTimer = setInterval(step, 8);
    }
    function dragEnd(reason) {
      if (!dragOff) return;
      const p = host.cursor(); dragTrail.push({ t: Date.now(), x: p.x, y: p.y });
      dragOff = null; stopDrag();
      let { vx, vy } = trailVel(80);
      const sp = Math.hypot(vx, vy), MAX = 5000;
      if (sp > MAX) { vx *= MAX / sp; vy *= MAX / sp; }
      pet.send('pet-held', { on: false, vx: 0 });
      log('drag-end', reason || '', ri(sp), 'trail', dragTrail.length, 'moved', dragMoved);
      if (!dragMoved) return poke();
      if (sp > THROW_SPEED) return throwPet(vx, vy);
      settle();
    }
    // 放下：别压进任务栏、别放到屏幕外面，然后记住位置
    function settle() {
      let [x, y] = pet.getPos();
      const wa = nearestWorkArea({ x: x + 64, y: y + 100 });
      const nx = Math.max(wa.x - BALL_BOX.l, Math.min(x, wa.x + wa.width - BALL_BOX.r));
      const ny = Math.max(wa.y - BALL_BOX.t, Math.min(y, wa.y + wa.height - BALL_BOX.b));
      if (nx !== x || ny !== y) { x = nx; y = ny; pet.setPos(ri(x), ri(y)); placeBubble(); }
      cfg.set({ pos: { x: ri(x), y: ri(y) } });
    }
    function throwPet(vx, vy) {
      stopFly();
      const [sx, sy] = pet.getPos();
      // 多屏：扭蛋中心在哪块屏的工作区里就按哪块算边界，飞进相邻屏不算撞墙；出了所有屏才撞当前这块的边
      const center = (x, y) => ({ x: ri(x + (BALL_BOX.l + BALL_BOX.r) / 2), y: ri(y + (BALL_BOX.t + BALL_BOX.b) / 2) });
      const inWa = (p, w) => p.x >= w.x && p.x < w.x + w.width && p.y >= w.y && p.y < w.y + w.height;
      let wa = nearestWorkArea(center(sx, sy));
      let x = sx, y = sy, last = Date.now(), still = 0;
      const G = 2600;
      let minX, maxX, minY, maxY;
      const setBounds = () => { minX = wa.x - BALL_BOX.l; maxX = wa.x + wa.width - BALL_BOX.r; minY = wa.y - BALL_BOX.t; maxY = wa.y + wa.height - BALL_BOX.b; };
      setBounds();
      pet.send('pet-fly', { flying: true, vx, vy });
      flyTimer = setInterval(() => {
        const now = Date.now(), dt = Math.min(0.04, (now - last) / 1000); last = now;
        if (dt <= 0) return;
        vy += G * dt; vx *= 0.998;
        // 先走 x（用旧 y 判左右墙），再走 y（用新 x 判地面 / 天花板）：否则一帧扎进地面时会被误判成撞侧墙
        const was = host.workAreas();
        const inAny = (p) => was.some(w => inWa(p, w));
        const rehome = () => { const c = center(x, y), h = was.find(w => inWa(c, w)); if (h) { wa = h; setBounds(); } return c; };
        let hit = null, impact = 0;
        x += vx * dt;
        let c = rehome();
        if (vx < 0 && !inAny({ x: x + BALL_BOX.l, y: c.y })) { x = Math.max(x, minX); impact = Math.abs(vx); vx = -vx * 0.6; hit = 'left'; }
        else if (vx > 0 && !inAny({ x: x + BALL_BOX.r - 0.01, y: c.y })) { x = Math.min(x, maxX); impact = Math.abs(vx); vx = -vx * 0.6; hit = 'right'; }
        y += vy * dt;
        c = rehome();
        const T = y + BALL_BOX.t, B = y + BALL_BOX.b;
        if (vy < 0 && !inAny({ x: c.x, y: T })) { y = Math.max(y, minY); impact = Math.max(impact, Math.abs(vy)); vy = -vy * 0.55; hit = hit || 'top'; }
        // 判地面用「底边往里一丁点」：用 B - 1 的话，陷进地面不到 1px 时不算着地，下一帧又算，
        // 扭蛋就会在地上隔一帧抖 1px、永远不算停稳（计时器很准、每步正好 16ms 的机器上必现）
        else if (vy >= 0 && !inAny({ x: c.x, y: B - 0.01 })) {
          y = Math.min(y, maxY); impact = Math.max(impact, Math.abs(vy));
          // 落地弹几下（越弹越低），弹不动了就贴地滚：恒定减速，慢慢滚停，不会一下刹住
          if (Math.abs(vy) > 140) { vy = -vy * 0.5; vx *= 0.88; hit = hit || 'bottom'; }
          else { vy = 0; impact = hit ? impact : 0; const d = 700 * dt; vx = Math.abs(vx) <= d ? 0 : vx - Math.sign(vx) * d; }
        }
        if (hit && impact > 350) pet.send('pet-hit', { side: hit, impact: ri(impact) });
        pet.setPos(ri(x), ri(y));
        placeBubble();
        pet.send('pet-fly', { flying: true, vx, vy });
        still = (vy === 0 && Math.abs(vx) < 8) ? still + 1 : 0;
        if (still > 3) {
          stopFly(); pet.send('pet-fly', { flying: false, vx: 0 }); pet.send('pet-land');
          cfg.set({ pos: { x: ri(x), y: ri(y) } });
        }
      }, 16);
    }
    function poke() {
      if (bubble && bubble.kind === 'card') hideBubble();      // 点团子顺手收起卡片
      pet.send('pet-poke');
      emit('poke');
      if (focus && focus.phase === 'work' && petOut) toast(fill(pickOne(LINES.focusPoke), { left: Math.max(1, Math.ceil((focus.end - Date.now()) / 60e3)) }), 2600);
    }
    // 窗口是 128×128 的透明方块，只有扭蛋 / 团子身上接鼠标，其余地方点得穿。
    // 由这边按光标位置判断（不靠页面的鼠标事件：页面万一收不到事件，团子就再也点不着了）。
    // shape = 页面报上来的团子轮廓（每行一个矩形，窗口坐标）；没报就按扭蛋那个圆算
    let shape = null, through = null, beat = 0;
    function overPet(cx, cy) {
      if (shape) return shape.some(r => cx >= r[0] - 3 && cx < r[2] + 3 && cy >= r[1] - 3 && cy < r[3] + 3);
      return Math.hypot(cx - 64, cy - 100) <= 27;
    }
    // 光标在团子附近时把相对位置推给页面（扭蛋往光标那边歪、里面的眼睛跟着看、悬停偷看）；离开后再推一次让它回正
    let cursorNear = false;
    every(40, () => {
      const c = host.cursor(), [x, y] = pet.getPos();
      const want = !(dragOff || overPet(c.x - x, c.y - y));
      if (want !== through) { through = want; if (pet.setClickThrough) pet.setClickThrough(want); }
      if (dragOff || flyTimer || ++beat % 2) return;
      const dx = c.x - (x + 64), dy = c.y - (y + 100), d = Math.hypot(dx, dy);
      if (d < 320 || cursorNear) pet.send('pet-cursor', { dx, dy, d });
      cursorNear = d < 320;
    });

    // ---------- 位置 ----------
    function homePos() {
      const wa = host.workAreas()[0];
      return { x: wa.x + wa.width - PET - 24, y: wa.y + wa.height - BALL_BOX.b };
    }
    // 存的位置还在某块屏幕里就用它，不然回右下角（拔了外接屏之类）
    function startPos() {
      const p = cfg.get().pos;
      const ok = p && host.workAreas().some(w => p.x + 64 >= w.x - 20 && p.x + 64 < w.x + w.width + 20 && p.y + 100 >= w.y - 20 && p.y + 100 < w.y + w.height + 20);
      return ok ? { x: ri(p.x), y: ri(p.y) } : homePos();
    }
    function goHome() { stopFly(); cfg.set({ pos: null }); const p = homePos(); pet.setPos(ri(p.x), ri(p.y)); placeBubble(); }
    function checkPos() { if (dragOff || flyTimer) return; const p = startPos(), [x, y] = pet.getPos(); if (p.x !== x || p.y !== y) { pet.setPos(p.x, p.y); placeBubble(); } }

    // ---------- 专注（番茄钟）----------
    let lastTimer = '';
    function startFocus(min, secs) {          // secs：测试 / 演示时把时长换成秒
      min = Math.max(1, Math.min(180, Math.round(min) || 25));
      focus = { phase: 'work', end: Date.now() + (secs ? secs * 1000 : min * 60e3), min, secs };
      lastTimer = ''; hideBubble();
      const text = fill(pickOne(LINES.focusStart), { min });
      if (petOut) toast(text, 3600); else pendingSay = { text, ms: 3600 };
      pushState();
      setTimeout(() => { if (pendingSay && pendingSay.text === text) { pendingSay = null; toast(text, 3600); } }, 3000);
      log('focus start', min);
    }
    function stopFocus() {
      if (!focus) return;
      const was = focus.phase; focus = null; pet.send('pet-timer', null); pushState();
      if (was === 'work') toast(pickOne(LINES.focusStop), 3000);
      log('focus stop', was);
    }
    function finishWork() {
      const day = dayKey(), f = { ...(cfg.get().focus || {}) };
      if (f.day !== day) { f.day = day; f.today = 0; }
      f.today = (f.today || 0) + 1; f.total = (f.total || 0) + 1; f.minutes = (f.minutes || 0) + focus.min;
      cfg.set({ focus: f });
      const min = focus.min;
      focus = { phase: 'break', end: Date.now() + (focus.secs ? focus.secs * 500 : BREAK_MIN * 60e3), min, secs: focus.secs };
      lastTimer = ''; pushState();
      pet.send('pet-cheer', { big: true });
      showBubble({ view: 'focusDone', n: f.today, min, brk: BREAK_MIN, total: f.total }, 9000);
      emit('focus-done', min);
      log('focus done', min, 'today', f.today);
    }
    function finishBreak() {
      const min = focus.min;
      focus = null; pet.send('pet-timer', null);
      pet.send('pet-peek', { ms: 14000 });           // 先别回扭蛋，等你决定要不要再来一个
      pushState();
      showBubble({ view: 'breakDone', min, text: pickOne(LINES.breakDone) }, 13000);
    }
    every(250, () => {
      if (!focus) return;
      if (Date.now() >= focus.end) return focus.phase === 'work' ? finishWork() : finishBreak();
      const t = timerText();
      if (t.text !== lastTimer) { lastTimer = t.text; pet.send('pet-timer', t); if (host.tray) host.tray(trayTip()); }
    });

    // ---------- 提醒：休息 / 深夜 / 每天第一次见面 ----------
    let activeSince = Date.now(), lastIdle = 0;
    function quiet() { return !!cfg.get().dnd || !!focus || count > 0 || !!dragOff || !!flyTimer; }
    function checkReminders() {
      const c = cfg.get(), now = new Date(), idle = host.idleSeconds ? host.idleSeconds() : 0;
      // 离开超过 5 分钟再回来：重新计久坐，顺便说声欢迎回来
      if (idle > 300) { activeSince = Date.now(); lastIdle = idle; return; }
      if (lastIdle > 300) { lastIdle = 0; activeSince = Date.now(); if (!quiet() && idle < 30) return nudge(pickOne(LINES.back), 4500); }
      lastIdle = idle;
      if (quiet() || idle > 60) return;
      // 每天第一次：问个好，有倒计时就报一下
      const day = dayKey(now);
      if (c.lastGreet !== day && now.getHours() >= 5) {
        cfg.set({ lastGreet: day });
        const cd = nearestCountdown();
        return nudge(cd ? cdLine(cd) : (hourLine() || pickOne(LINES.greet)), 6500);
      }
      // 深夜（23:30 ~ 5:00）催一次睡
      const h = now.getHours(), late = h < 5 || (h === 23 && now.getMinutes() >= 30);
      const nightKey = dayKey(new Date(now.getTime() - 5 * 3600e3));     // 凌晨算前一天晚上
      if (c.night !== false && late && c.lastNight !== nightKey) {
        cfg.set({ lastNight: nightKey });
        return nudge(fill(pickOne(LINES.night), { time: `${pad(h)}:${pad(now.getMinutes())}` }), 7000);
      }
      // 连续用了 45 分钟：起来动动
      if (c.rest !== false && Date.now() - activeSince >= REST_MIN * 60e3) {
        activeSince = Date.now();
        return nudge(fill(pickOne(LINES.rest), { min: REST_MIN }), 7000);
      }
    }
    every(20e3, checkReminders);

    // ---------- 倒计时 ----------
    const cdView = () => ({ view: 'countdown', keep: true, focus: true, items: (cfg.get().countdowns || []).map(c => ({ ...c, n: daysTo(c.date) })), today: dayKey() });
    function addCountdown(name, date) {
      name = String(name || '').trim().slice(0, 12);
      if (!name || !Number.isFinite(daysTo(date))) return false;
      const list = [...(cfg.get().countdowns || []), { name, date }].slice(-5);
      cfg.set({ countdowns: list }); pushState(); return true;
    }
    function delCountdown(i) { const list = [...(cfg.get().countdowns || [])]; list.splice(i, 1); cfg.set({ countdowns: list }); pushState(); }

    // ---------- 图鉴（也是改装的地方：开关扩展包、换扭蛋样式）----------
    function dexView() {
      const off = packOff();
      const list = [{ id: 'base', name: '原版团子', keys: BUILTIN, on: !off.has('base') }, ...packs.filter(p => p.keys.length).map(p => ({ id: p.id, name: p.name, keys: p.keys, on: !off.has(p.id), del: true, free: !!p.menu }))];
      const caps = [...Object.entries(S.DANGO_CAP_STYLES), ...Object.entries(capStyles())].map(([id, st]) => ({ id, name: st.name }));
      return { view: 'dex', keep: true, dex: cfg.get().dex || {}, chosen: FORMS[cfg.get().chosen] ? cfg.get().chosen : 'random', packs: list, capsule: cfg.get().capsule || 'orange', capsules: caps, canAI: !!host.ai, canOpen: !!(host.packs && host.packs.openFolder), canAdd: !!(host.packs && host.packs.pick), odds: { N: RARITY.N.odds, R: RARITY.R.odds, SSR: RARITY.SSR.odds } };
    }
    // 能不能直接选它常驻：见过的、自制的随时能选；带右键菜单的扩展包（同一只的几种样子）里的也随时能选
    function canChoose(form) {
      const f = FORMS[form]; if (!f) return false;
      return !!(cfg.get().dex || {})[form] || f.rarity === 'DIY' || packs.some(p => p.menu && p.id === f.pack);
    }
    function choose(form) {
      if (form !== 'random' && !canChoose(form)) return;
      cfg.set({ chosen: form }); next = null; pushState();
    }
    function togglePack(id) {
      const off = packOff(); if (off.has(id)) off.delete(id); else off.add(id);
      cfg.set({ packsOff: [...off] }); next = null; pushState();
    }
    function setCapsule(id) { if (S.DANGO_CAP_STYLES[id] || capStyles()[id]) { cfg.set({ capsule: id }); pushState(); } }

    // ---------- AI 捏团子 ----------
    function openAI(extra = {}) {
      if (!host.ai) return;
      const c = host.ai.config();
      showBubble({ view: 'ai', keep: true, focus: true, stage: c.ready ? 'ask' : 'setup', cfg: c, ...extra });
    }
    async function aiMake(desc) {
      desc = String(desc || '').trim().slice(0, 200);
      if (!desc || !host.ai || aiBusy) return;
      aiBusy = true; pushState();
      showBubble({ view: 'ai', keep: true, stage: 'busy', text: desc });
      let res;
      try { res = await host.ai.make(desc); } catch (e) { res = { ok: false, error: '出错了：' + String(e && e.message || e).slice(0, 80) }; }
      aiBusy = false; pushState();
      if (!res.ok) return openAI({ stage: 'ask', text: desc, error: res.error });
      const recipe = { ...res.recipe, rarity: 'DIY' }, r = S.dangoFromRecipe(recipe);
      if (!r.ok) return openAI({ stage: 'ask', text: desc, error: 'AI 给的配方不能用（' + r.error + '），再试一次' });
      if (aiPending) S.unregisterDango(aiPending.key);
      const id = 'ai-' + Date.now().toString(36);
      aiPending = { id, key: id + '#0', recipe, text: desc };
      S.registerDango(aiPending.key, { ...r.form, pack: id }); syncForms();
      showBubble({ view: 'ai', keep: true, focus: true, stage: 'result', form: aiPending.key, text: desc });
    }
    function aiAccept() {
      if (!aiPending || !host.packs) return;
      const p = aiPending; aiPending = null;
      host.packs.save(p.id, { name: p.recipe.name, made: 'AI：' + p.text, dangos: [p.recipe] });
      loadPacks(); hideBubble();
      forced.unshift(p.key); next = null; pushState();
      pet.send('pet-peek', { ms: 9000, form: p.key });       // 马上蹦出来给你看
      log('ai keep', p.id);
    }
    function aiDrop() { if (aiPending) { S.unregisterDango(aiPending.key); aiPending = null; syncForms(); } }
    function removePack(id) {
      if (!host.packs || id === 'base') return;
      const p = packs.find(x => x.id === id); if (!p) return;
      host.packs.remove(id);
      if (p.keys.includes(cfg.get().chosen)) cfg.set({ chosen: 'random' });
      if (cfg.get().capsule === 'pack:' + id) cfg.set({ capsule: 'orange' });
      loadPacks(); next = null; pushState();
    }
    // 添加扩展包：让你选一个 .json → 查过能用就装上 → 带扭蛋样式的直接换上、包里第一只马上出来给你看
    let adding = false;
    async function addPack() {
      if (!host.packs || !host.packs.pick || adding) return;
      adding = true; hideBubble();                 // 卡片是置顶的，会挡住选文件的窗口，先收起来
      let r;
      try { r = await host.packs.pick(); } catch (e) { r = { ok: false, error: '出错了：' + String(e && e.message || e).slice(0, 80) }; }
      adding = false;
      if (!r) return;                              // 点了取消
      if (!r.ok) return showBubble({ view: 'say', title: '这个扩展包装不上', text: r.error }, 12000);
      loadPacks();
      const p = packs.find(x => x.id === r.id); if (!p) return;
      const off = packOff(); if (off.delete(p.id)) cfg.set({ packsOff: [...off] });      // 以前关掉过的同一个包：重新打开
      if (p.capsule) cfg.set({ capsule: 'pack:' + p.id });
      const text = '装好了：' + p.name + '\n' + [p.keys.length ? p.keys.length + ' 只团子' : '', p.capsule ? '扭蛋「' + p.capsule.name + '」' : ''].filter(Boolean).join(' · ');
      log('pack added', p.id, p.keys.length);
      if (!p.keys.length || count > 0) { next = null; pushState(); return toast(text, 6000); }
      forced.unshift(p.keys[0]); next = null; pushState();
      pet.send('pet-peek', { ms: 9000, form: p.keys[0] });
      // 团子正好在外面：直接说，它会当场变成包里第一只给你看
      if (petOut) return toast(text, 6000);
      // 在扭蛋里：让第一只出来，由它来说「装好了」；它要是不肯出来（正生着气），过一会儿照样把话说了
      pendingSay = { text, ms: 6000 };
      setTimeout(() => { if (pendingSay && pendingSay.text === text) { pendingSay = null; toast(text, 6000); } }, 2600);
    }

    // ---------- 气泡里点了按钮 ----------
    function bubbleAction(a) {
      if (!a) return;
      if (a.act === 'close') { aiDrop(); return hideBubble(); }
      if (a.act === 'choose') { choose(a.form); return showBubble(dexView()); }
      if (a.act === 'pack') { togglePack(a.id); return showBubble(dexView()); }
      if (a.act === 'pack-del') { removePack(a.id); return showBubble(dexView()); }
      if (a.act === 'pack-add') return addPack();
      if (a.act === 'capsule') { setCapsule(a.id); return showBubble(dexView()); }
      if (a.act === 'folder') return host.packs && host.packs.openFolder && host.packs.openFolder();
      if (a.act === 'ai') return openAI();
      if (a.act === 'ai-setup') return openAI({ stage: 'setup' });
      if (a.act === 'ai-save') { const r = host.ai ? host.ai.save(a) : { ok: false, error: '这个版本没有 AI 功能' }; return openAI(r.ok ? { stage: 'ask' } : { stage: 'setup', error: r.error, draft: { provider: a.provider, baseUrl: a.baseUrl, model: a.model } }); }
      if (a.act === 'ai-make') return aiMake(a.text);
      if (a.act === 'ai-keep') return aiAccept();
      if (a.act === 'ai-redo') { aiDrop(); return aiMake(a.text); }
      if (a.act === 'ai-back') { aiDrop(); return openAI({ stage: 'ask', text: a.text }); }
      if (a.act === 'cd-add') { addCountdown(a.name, a.date); return showBubble(cdView()); }
      if (a.act === 'cd-del') { delCountdown(a.i); return showBubble(cdView()); }
      if (a.act === 'focus') return startFocus(a.min);
      if (a.act === 'dex') return showBubble(dexView());
    }

    // ---------- 右键菜单（主进程拿去建原生菜单，宣传片里照着画）----------
    function menuModel() {
      const c = cfg.get(), flip = (k, def) => () => { const cur = c[k] === undefined ? def : c[k]; cfg.set({ [k]: !cur }); };
      const t = timerText(), off = packOff(), chosen = FORMS[c.chosen] ? c.chosen : 'random';
      // 扩展包自己要的菜单项（包里写了 menu）：列出这一包的团子，点哪只就让哪只常驻
      const packMenus = packs.filter(p => p.menu && !off.has(p.id)).map(p => ({ label: p.menu, submenu: [
        { label: '每次随机', type: 'checkbox', checked: chosen === 'random', click: () => choose('random') },
        ...p.keys.map(k => ({ label: FORMS[k].name, type: 'checkbox', checked: chosen === k, click: () => choose(k) })),
      ] }));
      return [
        focus ? { label: `${focus.phase === 'work' ? '结束专注' : '结束休息'}（还剩 ${t.text}）`, click: stopFocus }
          : { label: '专注一会儿', submenu: [25, 45, 60].map(m => ({ label: `${m} 分钟`, click: () => startFocus(m) })) },
        { label: '倒计时…', click: () => showBubble(cdView()) },
        { label: `图鉴（${dexCount()}/${BUILTIN.length}）`, click: () => { loadPacks(); showBubble(dexView()); } },
        ...packMenus,
        ...(host.ai ? [{ label: 'AI 捏团子…', click: () => openAI() }] : []),
        ...(host.packs && host.packs.pick ? [{ label: '添加扩展包…', click: () => addPack() }] : []),
        { type: 'separator' },
        { label: `休息提醒（每 ${REST_MIN} 分钟）`, type: 'checkbox', checked: c.rest !== false, click: flip('rest', true) },
        { label: '深夜催睡', type: 'checkbox', checked: c.night !== false, click: flip('night', true) },
        { label: '勿扰（不主动出来）', type: 'checkbox', checked: !!c.dnd, click: flip('dnd', false) },
        { type: 'separator' },
        ...(host.autoStart ? [{ label: '开机自启', type: 'checkbox', checked: !!host.autoStart.get(), click: () => host.autoStart.set(!host.autoStart.get()) }] : []),
        { label: '回到右下角', click: goHome },
        { label: '玩法说明', click: () => showBubble({ view: 'help', keep: true, version: VERSION }) },
        { label: '请团子喝杯奶茶', click: () => showBubble({ view: 'donate', keep: true }) },
        { type: 'separator' },
        { label: '退出', click: () => host.quit && host.quit() },
      ];
    }

    // ---------- 团子页面发来的消息 ----------
    function petMessage(ch, v) {
      if (ch === 'pet-drag-start') return dragBegin();
      if (ch === 'pet-drag-end') return dragEnd(v);
      if (ch === 'pet-seen') return onSeen(v);
      if (ch === 'pet-out') { petOut = !!v; return placeBubble(); }
      if (ch === 'pet-shape') { shape = Array.isArray(v) && v.length ? v : null; return; }
      if (ch === 'pet-log') return log('pet', v);
      if (ch === 'pet-event') {
        if (v === 'dizzy' && !quietToast()) return toast(pickOne(LINES.dizzy), 2600);
        if (v === 'sulk' && !quietToast()) return toast(pickOne(LINES.sulk), 2400);
      }
    }
    const quietToast = () => count > 0 || userCard();
    function bubbleMessage(ch, v) {
      if (ch === 'bubble-size') return onBubbleSize(v || {});
      if (ch === 'bubble-action') return bubbleAction(v);
      if (ch === 'close-bubble') return hideBubble();
    }

    // ---------- 启动 ----------
    // 团子页面加载好了（第一次，或者窗口重建之后）就把状态推过去
    function petReady() { syncForms(); pushState(); if (focus) pet.send('pet-timer', timerText()); }
    function start() {
      loadPacks();
      next = roll();
      if (!cfg.get().greeted) { cfg.set({ greeted: true, lastGreet: dayKey() }); setTimeout(() => showBubble({ view: 'help', keep: true, version: VERSION, first: true }), 1800); }
      else setTimeout(checkReminders, 5000);
    }
    function dispose() { timers.forEach(clearInterval); stopFly(); stopDrag(); clearTimeout(bubbleTimer); }

    // ---------- 给插件用的 ----------
    const api = {
      version: VERSION,
      say(title, text, ms = 4000) { showBubble({ view: 'say', title, text }, ms); },     // 冒一张卡片
      toast(text, ms) { toast(text, ms); },                                              // 头顶说一句
      nudge(text, ms) { nudge(text, ms); },                                              // 团子出来说一句
      setCount(n) { count = Math.max(0, n | 0); pushState(); },                          // 有 n 件事：团子出来蹦着叫你
      setMood(m) { mood = m || ''; pushState(); },                                       // busy / happy / sad / sleep，'' 恢复自动
      on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },                    // poke / seen / focus-done
    };

    return {
      api, start, dispose, petReady, petMessage, bubbleMessage, menuModel, startPos, checkPos, goHome, syncForms, loadPacks, addPack, openAI, aiMake,
      showBubble, hideBubble, toast, nudge, startFocus, stopFocus, throwPet, addCountdown, choose, pushState,
      force: (...ks) => { forced.push(...ks); if (ks.length) { next = null; pushState(); } },
      packs: () => packs,   // 演示 / 测试：指定接下来抽到谁
      state: () => ({ count, mood, next, petOut, focus, bubble: bubble && { kind: bubble.kind, view: bubble.content.view, stage: bubble.content.stage, shown: bubble.shown }, flying: !!flyTimer, dragging: !!dragOff }),
    };
  }

  return { createCore, daysTo, dayKey, PET, CARD_W, BALL_BOX, THROW_SPEED, REST_MIN, BREAK_MIN, VERSION };
});
