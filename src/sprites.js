// 万能团子的像素形象：28×24 的团子（各种口味 / 动物 / 隐藏款）+ 12×12 的扭蛋
// 浏览器里：drawDango(svg, key) 把团子画进 svg；drawCapsule(svg, key) 画扭蛋（玻璃罩里能看见下一只的脑袋）
// Node 里：require('./sprites') 拿到同一份数据（做图标、预览图用）
// 想加自己的团子：在 FORMS 里照着抄一段就行，写法见 FORMS 上面的说明
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.assign(root, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 28, H = 24;
  const mirror = (h) => h + [...h].reverse().join('');

  // 身体（左半边 14 列，右半边镜像）：一颗坐着的圆团子，第 8~23 行
  const BODY = {
    8: '..........oooo',
    9: '........oobbbb',
    10: '......oobbbbbb',
    11: '.....obbbbbbbb',
    12: '....obbbbbbbbb',
    13: '....obbbbbbbbb',
    14: '...obbbbbbbbbb',
    15: '...obbbbbbbbbb',
    16: '...obbbbbbbbbb',
    17: '...obbbbbbbbbb',
    18: '...obbbbbbbbbb',
    19: '...obbbbbbbbbb',
    20: '...obbbbbbbbbb',
    21: '....obbbbbbbbb',
    22: '.....oobbbbbbb',
    23: '.......ooooooo',
  };
  // 肚皮（浅色）：盖在身体上
  const BELLY = { 19: '..........llll', 20: '.........lllll', 21: '.........lllll', 22: '..........llll' };

  // 每个形态：
  //   name 名字  rarity 稀有度（N 普通 / R 稀有 / SSR 隐藏）  say 图鉴里的一句话
  //   pal  字符 → 颜色：o 描边 b 身体 l 肚皮，其它字母自己定
  //   half 整行覆盖（只写左半边 14 列，右边自动镜像）  rows 整行覆盖（28 列，不对称时用）
  //   over 贴一小块 [x, y, [行...]]（'.' 的格子不盖）  marks 补几个点 [x, y, 颜色, 宽, 高]
  //   tail [x, y, [行...]] 只画在空白处，单独成组（会摇）  ear 行号小于它的像素算耳朵（会抖），默认 8，0 = 没耳朵
  //   belly 画不画浅色肚皮  eyes / mouth / blush 五官位置  e 眼睛颜色  base 先照抄另一个形态再改
  //   fn(x, y, ch) 按格子算颜色（花纹用）  shade:false 不要自动明暗
  const FORMS = {
    dango: {
      name: '团子', rarity: 'N', say: '原味的，最经典',
      pal: { o: '#5a3a1e', b: '#ffa94d', l: '#ffe3bf', i: '#ff8fa3' },
      half: {
        4: '......o.......',
        5: '.....obo......',
        6: '.....obbo.....',
        7: '....obibbo....',
        8: '....obiibboooo',
        9: '....obbbbbbbbb',
        10: '....obbbbbbbbb',
        11: '....obbbbbbbbb',
      },
      belly: true,
      tail: [25, 12, ['.o.', 'obo', 'obo', 'obo', 'obo', 'bbo', 'oo.']],
    },
    sakura: {
      name: '樱花团子', rarity: 'N', say: '春天限定，全年供应',
      pal: { o: '#7a3550', b: '#ffb3cc', l: '#ffe1ec', p: '#ff5f95', y: '#ffe066' },
      belly: true,
      over: [[16, 4, ['.p.p.', 'ppppp', '.pyp.', 'ppppp', '.p.p.']]],
    },
    matcha: {
      name: '抹茶团子', rarity: 'N', say: '微苦，回甘',
      pal: { o: '#3f5a2a', b: '#a9d77a', l: '#e6f4cf', g: '#58a83f' },
      belly: true,
      half: { 3: '.........oo...', 4: '........oggo..', 5: '........ogggo.', 6: '.........ooggo', 7: '...........oog', 8: '..........ooog' },
    },
    boba: {
      name: '奶茶团子', rarity: 'N', say: '三分糖，去冰',
      pal: { o: '#5e4028', b: '#ecd0a8', l: '#f7e6cc', r: '#ff5f8f', w: '#ffc2d4' },
      over: [[14, 1, ['...rr', '...ww', '..rr.', '..ww.', '.rr..', '.ww..', 'rr...']]],
      marks: [[6, 20, '#3a2618', 2, 2], [10, 21, '#3a2618', 2, 2], [16, 21, '#3a2618', 2, 2], [20, 20, '#3a2618', 2, 2],
        [6, 20, '#6b4a34'], [10, 21, '#6b4a34'], [16, 21, '#6b4a34'], [20, 20, '#6b4a34']],
    },
    sesame: {
      name: '芝麻团子', rarity: 'N', say: '黑芝麻馅，会流心',
      pal: { o: '#3d3833', b: '#ddd6c9', l: '#f1ebdf' },
      belly: true,
      marks: [[8, 10, '#3d3833'], [12, 9, '#3d3833'], [16, 10, '#3d3833'], [19, 11, '#3d3833'], [6, 12, '#3d3833'], [10, 12, '#3d3833'], [14, 11, '#3d3833'], [21, 13, '#3d3833'], [17, 12, '#3d3833'], [12, 13, '#3d3833'], [4, 15, '#3d3833'], [23, 16, '#3d3833']],
    },
    pudding: {
      name: '布丁团子', rarity: 'N', say: 'Q 弹，一碰就晃',
      pal: { o: '#6b4423', b: '#ffe08a', l: '#fff0b8', k: '#a85f24', r: '#e5484d', g: '#3f7a35' },
      half: { 9: '........ookkkk', 10: '......ookkkkkk', 11: '.....okkkkkkkk', 12: '....okkbkkkbkk', 13: '....obbbkbbbbk' },
      over: [[12, 4, ['...g', '..g.', '.rr.', '.rr.']]],
    },
    choco: {
      name: '巧克力团子', rarity: 'N', say: '撒了彩针，快乐加倍',
      pal: { o: '#3a2114', b: '#a06a46', l: '#c79872' },
      belly: true,
      marks: [[8, 11, '#ff8fb1'], [9, 10, '#ff8fb1'], [12, 9, '#ffe066'], [13, 10, '#ffe066'], [16, 9, '#7fd6ff'], [17, 10, '#7fd6ff'], [20, 11, '#ffffff'], [21, 12, '#ffffff'],
        [6, 13, '#ffe066'], [10, 12, '#7fd6ff'], [11, 13, '#7fd6ff'], [15, 12, '#ffffff'], [18, 12, '#ff8fb1'], [19, 13, '#ff8fb1'], [22, 14, '#ffe066']],
    },
    ocean: {
      name: '海盐团子', rarity: 'N', say: '咸咸甜甜，像海风',
      pal: { o: '#2d5d7a', b: '#a6e0f7', l: '#e6f8ff', w: '#5fbdea' },
      belly: true,
      half: { 2: '.............o', 3: '............ow', 4: '............ow', 5: '...........oww', 6: '...........oww', 7: '............oo' },
      marks: [[12, 5, '#e6f8ff']],
    },
    bunny: {
      name: '兔兔团子', rarity: 'R', say: '耳朵会抖',
      pal: { o: '#7a5560', b: '#fff6f2', l: '#ffffff', i: '#ffb3c7' },
      half: {
        0: '........oo....',
        1: '.......obbo...',
        2: '.......obio...',
        3: '.......obio...',
        4: '.......obio...',
        5: '.......obio...',
        6: '.......obio...',
        7: '.......obbo...',
        8: '.......obbbooo',
        9: '.......obbbbbb',
      },
    },
    panda: {
      name: '熊猫团子', rarity: 'R', say: '国宝，轻拿轻放',
      pal: { o: '#26262e', b: '#ffffff', l: '#ffffff', k: '#26262e' },
      half: { 5: '.....ooo......', 6: '....okkko.....', 7: '....okkkko....', 8: '.....okkkooooo', 9: '......oooobbbb' },
      marks: [[7, 13, '#26262e', 3, 1], [6, 14, '#26262e', 5, 3], [6, 17, '#26262e', 3, 1], [18, 13, '#26262e', 3, 1], [17, 14, '#26262e', 5, 3], [19, 17, '#26262e', 3, 1]],
      e: '#26262e', eClosed: '#a4a4b0', blush: { x: [4, 22], y: 18 },
    },
    frog: {
      name: '呱呱团子', rarity: 'R', say: '呱。',
      pal: { o: '#2f5a2a', b: '#8fd16a', l: '#eaf7c9' },
      half: { 5: '.....oooo.....', 6: '....obbbbo....', 7: '...obbbbbbo...', 8: '...obbbbbboooo', 9: '...obbbbbbbbbb', 10: '....obbbbbbbbb' },
      eyes: { x: [5, 20], y: 7 }, mouth: { x: 10, y: 15, w: 8 }, blush: { x: [5, 21], y: 13 },
      marks: [[9, 14, '#2f5a2a'], [18, 14, '#2f5a2a']],
      belly: true, ear: 0,
    },
    chick: {
      name: '小鸡团子', rarity: 'R', say: '叽。',
      pal: { o: '#8a6418', b: '#ffe46b', l: '#fff3b0' },
      half: { 5: '...........o..', 6: '............o.', 7: '.............o' },
      marks: [[12, 17, '#ff9a3c', 4, 1]],
      mouth: { x: 13, y: 18 }, m: '#e07a1f', belly: true,
    },
    ghost: {
      name: '幽灵团子', rarity: 'R', say: '半夜陪你赶 DDL',
      pal: { o: '#8f8fb8', b: 'rgba(255,255,255,.88)' },
      half: { 21: '...obbbbbbbbbb', 22: '...obbbobbbbob', 23: '....ooo.oooo.o' },
      e: '#3b3b5c', blush: { c: '#c9b8ff' }, shade: false,
    },
    devil: {
      name: '小恶魔团子', rarity: 'R', say: '今天也想摸鱼',
      pal: { o: '#33255c', b: '#a58cf0', l: '#d9ccff', h: '#ff5a6e' },
      half: { 5: '.......o......', 6: '......oho.....', 7: '......ohho....', 8: '......ohhooooo', 9: '......ooobbbbb' },
      tail: [25, 9, ['.h.', 'hhh', '.o.', '.o.', '.o.', '.o.', '.o.', 'oo.', 'o..']],
      marks: [[15, 18, '#ffffff']],
      belly: true,
    },
    tricolor: {
      name: '三色团子', rarity: 'R', say: '花见限定，一串三个',
      pal: { o: '#6b4a3a', b: '#fffaf0', k: '#d1a362' }, fx: ['#ffb3cc', '#fffaf0', '#b9de8c', '#ffffff'],
      fn: (x, y, ch) => ch === 'b' ? (y <= 12 ? '#ffb3cc' : y <= 17 ? '#fffaf0' : '#b9de8c') : null,
      half: { 2: '.............o', 3: '............ok', 4: '............ok', 5: '............ok', 6: '............ok', 7: '............ok', 8: '..........oook' },
    },
    gold: {
      name: '黄金团子', rarity: 'SSR', say: '出货了！！！',
      pal: { o: '#8a5a00', b: '#ffd54a', l: '#fff3b0', y: '#ffef9c', r: '#e5484d' }, fx: ['#ffd54a', '#fff3b0', '#ffffff', '#ffb020'],
      half: { 4: '..........o..o', 5: '..........oyoy', 6: '..........oyyy', 7: '..........oyyr' },
      marks: [[21, 5, '#fff7c2'], [20, 6, '#fff7c2', 3, 1], [21, 7, '#fff7c2'], [4, 9, '#fff7c2'], [3, 10, '#fff7c2', 3, 1], [4, 11, '#fff7c2']],
      belly: true,
    },
    glitch: {
      name: '404 团子', rarity: 'SSR', say: '贴图没加载出来',
      base: 'dango',
      pal: { o: '#17171c', b: '#ff2fd6', l: '#ff2fd6', i: '#ff2fd6' },
      fn: (x, y, ch) => ch === 'o' ? null : (((x >> 1) + (y >> 1)) % 2 ? '#ff2fd6' : '#17171c'),
      e: '#ffffff', hi: '#17171c', m: '#ffffff', blush: false, shade: false, belly: false,
    },
  };
  // base：先照抄另一个形态，再用自己的覆盖
  for (const [k, f] of Object.entries(FORMS)) if (f.base) FORMS[k] = { ...FORMS[f.base], ...f };

  const DEF = { eyes: { x: [7, 18], y: 14 }, mouth: { x: 13, y: 17, w: 2 }, blush: { x: [5, 21], y: 17, c: '#ff8fa3' }, ear: 8, e: '#2b1d10' };

  // 颜色小工具：只处理 #rrggbb，别的（rgba）原样返回
  const rgb = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => { if (a[0] !== '#' || b[0] !== '#' || a.length !== 7) return a; const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  // 团子身体的每一格：[{x, y, c, part}]，part = tail / earL / earR / body
  function grid(key) {
    const f = FORMS[key] || FORMS.dango;
    const rows = [];
    for (let y = 0; y < H; y++) rows.push(mirror(BODY[y] || '.'.repeat(14)).split(''));
    const put = (y, s) => { if (s.length !== W) throw new Error(key + ' 第 ' + y + ' 行不是 ' + W + ' 列：' + s.length); rows[y] = s.split(''); };
    for (const [y, h] of Object.entries(f.half || {})) put(+y, mirror(h));
    for (const [y, s] of Object.entries(f.rows || {})) put(+y, s);
    if (f.belly) for (const [y, h] of Object.entries(BELLY)) { const m = mirror(h); for (let x = 0; x < W; x++) if (m[x] !== '.' && rows[y][x] === 'b') rows[y][x] = 'l'; }
    for (const [x0, y0, rs] of f.over || []) rs.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') rows[y0 + j][x0 + i] = ch; }));
    const at = (x, y) => (rows[y] && rows[y][x]) || '.';
    const edge = (x, y) => { const c = at(x, y); return c === '.' || c === 'o'; };
    const ear = f.ear ?? DEF.ear, out = [], pat = f.pattern && PATTERNS[f.pattern.type];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = rows[y][x]; if (ch === '.') continue;
      let c = (f.fn && f.fn(x, y, ch)) || (pat && ch === 'b' && pat(x, y) ? f.pattern.c : f.pal[ch]); if (!c) continue;
      if (f.shade !== false && ch !== 'o' && y >= 11) {
        // 自动明暗：右下贴边的一圈压暗一点，左上角点两格高光，团子才圆
        if (edge(x, y + 1) || (x >= 14 && edge(x + 1, y))) c = mix(c, f.pal.o, .2);
        else if ((x === 6 && (y === 12 || y === 13)) || (x === 7 && y === 11)) c = mix(c, '#ffffff', .5);
      }
      out.push({ x, y, c, part: y < ear ? (x < 14 ? 'earL' : 'earR') : 'body' });
    }
    for (const [x, y, c, w = 1, h = 1] of f.marks || []) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push({ x: x + i, y: y + j, c, part: y + j < ear ? (x + i < 14 ? 'earL' : 'earR') : 'body' });
    if (f.tail) { const [x0, y0, rs] = f.tail; rs.forEach((r, j) => [...r].forEach((ch, i) => { const x = x0 + i, y = y0 + j; if (ch !== '.' && rows[y][x] === '.' && f.pal[ch]) out.push({ x, y, c: (f.fn && f.fn(x, y, ch)) || f.pal[ch], part: 'tail' }); })); }
    return out;
  }
  // 五官：每组是 [x, y, 宽, 高, 颜色] 的列表
  function face(key) {
    const f = FORMS[key] || FORMS.dango;
    const eyes = { ...DEF.eyes, ...(f.eyes || {}) }, mouth = { ...DEF.mouth, ...(f.mouth || {}) }, e = f.e || DEF.e, hi = f.hi || '#ffffff';
    const blush = f.blush === false ? null : { ...DEF.blush, ...(f.blush || {}) };
    const r = { eyesOpen: [], eyesClosed: [], blush: [], mouth: [], mouthO: [], sweat: [], acc: [] };
    for (const [x, y, c, w = 1, h = 1] of f.front || []) r.acc.push([x, y, w, h, c]);      // 盖在五官上面的小东西（眼镜、口罩……）
    for (const ex of eyes.x) {
      r.eyesOpen.push([ex, eyes.y, 3, 3, e], [ex, eyes.y, 1, 1, hi]);
      const c = f.eClosed || e;
      r.eyesClosed.push([ex, eyes.y + 2, 3, 1, c], [ex, eyes.y + 1, 1, 1, c], [ex + 2, eyes.y + 1, 1, 1, c]);
    }
    if (blush) for (const bx of blush.x) r.blush.push([bx, blush.y, 2, 1, blush.c]);
    if (!f.mouthHide) r.mouth.push([mouth.x, mouth.y, mouth.w, 1, f.m || e]);      // mouthHide：平时不画嘴，张嘴时才有
    r.mouthO.push([mouth.x + (mouth.w - 2) / 2, mouth.y, 2, 2, f.m || e]);
    r.sweat.push([23, 8, 1, 2, '#7cc4ff'], [24, 9, 1, 2, '#7cc4ff']);
    return r;
  }

  // ---------- 扭蛋（12×12）：上半玻璃罩（半透明，能看见里面那只的脑袋），下半实心 ----------
  // o 描边 g 玻璃 h 高光 s 接缝 c 底壳 k 底壳暗部 t 底壳亮部
  const CAPSULE = [
    '....oooo....',
    '..ooggggoo..',
    '.oghggggggo.',
    '.ohgggggggo.',
    'oggggggggggo',
    'oggggggggggo',
    'osssssssssso',
    'otccccccccko',
    '.otccccccko.',
    '.occcccckko.',
    '..ookkkkoo..',
    '....oooo....',
  ];
  // 玻璃罩里那只的脑袋：[行, 起始列, 宽]；眼睛在最下面一行
  const CAP_HEAD = [[3, 4, 4], [4, 3, 6], [5, 2, 8]];
  const CAP_PAL = { o: '#4a3324', g: 'rgba(255,255,255,.34)', h: 'rgba(255,255,255,.95)', s: '#4a3324', c: '#ff9d5c', k: '#e07a3a', t: '#ffc08a' };
  // 扭蛋的像素：part = bot（底壳）/ in（里面的脑袋，眼睛带 eye 标记）/ top（玻璃罩，能掀开）
  // opt.eyes=false 不画眼睛（睡着）；opt.look = -1 / 0 / 1 眼睛往左 / 中 / 右看
  // opt.style：扭蛋样式 { pal: 换掉哪些颜色, rows: 自己画的 12×12, glass: false = 上半不透明（看不见里面）}
  function capsulePixels(key, opt = {}) {
    const f = FORMS[key] || FORMS.dango, out = [], st = opt.style || {};
    const P = { ...CAP_PAL, ...(st.pal || {}) }, rows = st.rows || CAPSULE;
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && P[ch] && y >= 6) out.push({ x, y, c: P[ch], part: 'bot' }); }));
    if (st.glass !== false) {
      for (const [y, x0, w] of CAP_HEAD) for (let x = x0; x < x0 + w; x++) out.push({ x, y, c: f.head || (f.fn && f.fn(x * 2, y * 2, 'b')) || f.pal.b, part: 'in' });
      if (opt.eyes !== false) for (const ex of [4, 7]) out.push({ x: ex + (opt.look || 0), y: 5, c: f.e || DEF.e, part: 'in', eye: true });
    }
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && P[ch] && y < 6) out.push({ x, y, c: P[ch], part: 'top' }); }));
    return out;
  }

  // ---------- 浏览器里画 ----------
  const NS = 'http://www.w3.org/2000/svg';
  function px(g, x, y, c, w = 1, h = 1) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('fill', c);
    g.appendChild(r); return r;
  }
  function drawDango(svg, key) {
    svg.innerHTML = ''; svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const group = (id) => { const g = document.createElementNS(NS, 'g'); if (id) g.id = id; svg.appendChild(g); return g; };
    const parts = { tail: group('tail'), earL: group('earL'), earR: group('earR'), body: group('body') };
    for (const p of grid(key)) px(parts[p.part], p.x, p.y, p.c);
    const fc = face(key);
    for (const id of ['eyesOpen', 'eyesClosed', 'blush', 'mouth', 'mouthO', 'sweat', 'acc']) { const g = group(id); for (const [x, y, w, h, c] of fc[id]) px(g, x, y, c, w, h); }
  }

  const RARITY = { N: { name: '普通', odds: 78 }, R: { name: '稀有', odds: 20 }, SSR: { name: '隐藏', odds: 2 }, DIY: { name: '自制', odds: 0 } };

  // ====================== 改装：配方 → 团子 ======================
  // 「配方」是给人和 AI 写的简化格式（docs/改装指南.md 里有说明）：选颜色、耳朵、尾巴、花纹，再点缀几个小色块，不用自己画整只。
  // 想完全自己画，也可以直接写上面 FORMS 那种格式（带 pal 的），两种都能放进团子包。
  const EARS = { cat: FORMS.dango.half, bunny: FORMS.bunny.half, bear: FORMS.panda.half, horn: FORMS.devil.half };
  const TAILS = { cat: FORMS.dango.tail, devil: FORMS.devil.tail };
  const PATTERNS = {
    stripes: (x, y) => (x + y) % 4 < 2,
    bands: (x, y) => y % 6 >= 3,
    dots: (x, y) => x % 4 === 1 && y % 4 === 2,
    checker: (x, y) => ((x >> 1) + (y >> 1)) % 2 === 0,
  };
  const CAP_STYLES = {
    orange: { name: '橘子', pal: {} },
    mint: { name: '薄荷', pal: { c: '#6fd3b5', k: '#45b394', t: '#a6ead6' } },
    sakura: { name: '樱花', pal: { c: '#ff9ec0', k: '#e87aa3', t: '#ffc9dc' } },
    night: { name: '夜空', pal: { c: '#6b6bd6', k: '#4d4db8', t: '#9a9af0' } },
    lemon: { name: '柠檬', pal: { c: '#ffd84a', k: '#e0b62a', t: '#ffeb99' } },
  };
  const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
  const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const int = (v) => (Number.isFinite(+v) ? Math.round(+v) : NaN);
  // 一组小色块：[x, y, 颜色, 宽, 高] 或 {x, y, w, h, color}；越界的裁掉，颜色不认识的丢掉
  function rects(list, max, color) {
    const out = [];
    for (const m of (Array.isArray(list) ? list : []).slice(0, max)) {
      const o = Array.isArray(m) ? { x: m[0], y: m[1], color: m[2], w: m[3], h: m[4] } : (m || {});
      const x = int(o.x), y = int(o.y), c = color(o.color);
      if (!c || !(x >= 0 && x < W && y >= 0 && y < H)) continue;
      const w = Math.max(1, Math.min(W - x, int(o.w) || 1)), h = Math.max(1, Math.min(H - y, int(o.h) || 1));
      out.push([x, y, c, w, h]);
    }
    return out;
  }
  function fromRecipe(r) {
    if (!r || typeof r !== 'object') return { ok: false, error: '不是一个配方' };
    const c = r.colors || {};
    if (!HEX.test(c.body || '') || !HEX.test(c.outline || '')) return { ok: false, error: 'colors 里的 body 和 outline 要写成 #rrggbb' };
    const name = text(r.name, 10); if (!name) return { ok: false, error: '缺名字 name' };
    const col = { outline: c.outline, body: c.body, belly: HEX.test(c.belly || '') ? c.belly : mix(c.body, '#ffffff', .6), accent: HEX.test(c.accent || '') ? c.accent : '#ff8fa3', accent2: HEX.test(c.accent2 || '') ? c.accent2 : '#ffffff' };
    const pal = { o: col.outline, b: col.body, l: col.belly, a: col.accent, w: col.accent2, i: col.accent, h: col.accent, k: '#26262e', r: '#e5484d', y: '#ffd54a', g: '#58a83f', p: '#ff8fb1', u: '#5fbdea', n: '#8a5a3c' };
    const color = (v) => (HEX.test(v || '') ? v : col[v] || null);
    const form = { name, rarity: ['N', 'R', 'SSR'].includes(r.rarity) ? r.rarity : 'DIY', say: text(r.say, 20), custom: true, pal, belly: r.belly !== false, marks: rects(r.marks, 16, color), front: rects(r.front, 10, color) };
    const lines = (Array.isArray(r.lines) ? r.lines : []).map(l => text(l, 18)).filter(Boolean).slice(0, 4);
    if (lines.length) form.lines = lines;
    if (EARS[r.ears]) { form.half = { ...EARS[r.ears] }; if (r.ears === 'bear') pal.k = col.accent; }
    if (TAILS[r.tail]) form.tail = TAILS[r.tail];
    if (PATTERNS[r.pattern]) form.pattern = { type: r.pattern, c: col.accent2 };
    // 头顶的小东西：居中，最后一行贴着头顶
    const top = (Array.isArray(r.topper) ? r.topper : []).filter(x => typeof x === 'string').slice(0, 8).map(row => [...row.slice(0, 14)].map(ch => (pal[ch] ? ch : '.')).join(''));
    while (top.length && !/[^.]/.test(top[0])) top.shift();
    const tw = Math.max(0, ...top.map(x => x.length));
    if (tw) form.over = [[Math.floor((W - tw) / 2), 8 - top.length, top.map(x => x.padEnd(tw, '.'))]];
    if (HEX.test(c.eye || '')) form.e = c.eye;
    return { ok: true, form };
  }
  // 直接写成 FORMS 那种格式的：逐项查一遍，只留认识的字段（不接受函数，花纹用 pattern）
  function checkForm(d) {
    if (!d || typeof d !== 'object' || !d.pal || typeof d.pal !== 'object') return { ok: false, error: '缺调色板 pal' };
    const name = text(d.name, 10); if (!name) return { ok: false, error: '缺名字 name' };
    const pal = {};
    for (const [k, v] of Object.entries(d.pal)) if (k.length === 1 && k !== '.' && HEX.test(v || '')) pal[k] = v;
    if (!pal.o || !pal.b) return { ok: false, error: 'pal 里至少要有 o（描边）和 b（身体）' };
    const okRow = (row, n) => typeof row === 'string' && row.length === n && [...row].every(ch => ch === '.' || pal[ch]);
    const form = { name, rarity: ['N', 'R', 'SSR'].includes(d.rarity) ? d.rarity : 'DIY', say: text(d.say, 20), custom: true, pal, belly: !!d.belly };
    for (const [field, n] of [['half', 14], ['rows', W]]) {
      if (!d[field]) continue; form[field] = {};
      for (const [y, row] of Object.entries(d[field])) { if (!(+y >= 0 && +y < H) || !okRow(row, n)) return { ok: false, error: field + ' 第 ' + y + ' 行不对：要正好 ' + n + ' 个字符，且都在 pal 里' }; form[field][+y] = row; }
    }
    const stamp = (v) => Array.isArray(v) && v.length === 3 && int(v[0]) >= 0 && int(v[1]) >= 0 && Array.isArray(v[2]) && v[2].length > 0 && int(v[1]) + v[2].length <= H && v[2].every(row => typeof row === 'string' && int(v[0]) + row.length <= W && [...row].every(ch => ch === '.' || pal[ch]));
    if (d.over) { if (!Array.isArray(d.over) || !d.over.every(stamp)) return { ok: false, error: 'over 不对：[[x, y, [行…]], …]，不能画出 28×24' }; form.over = d.over.map(v => [int(v[0]), int(v[1]), v[2]]); }
    if (d.tail) { if (!stamp(d.tail)) return { ok: false, error: 'tail 不对：[x, y, [行…]]' }; form.tail = [int(d.tail[0]), int(d.tail[1]), d.tail[2]]; }
    const color = (v) => (HEX.test(v || '') ? v : null);
    form.marks = rects(d.marks, 40, color); form.front = rects(d.front, 20, color);
    const inW = (v) => int(v) >= 0 && int(v) < W;
    if (d.eyes && Array.isArray(d.eyes.x) && d.eyes.x.length === 2 && d.eyes.x.every(inW) && inW(d.eyes.y)) form.eyes = { x: d.eyes.x.map(int), y: int(d.eyes.y) };
    if (d.mouth && inW(d.mouth.x) && inW(d.mouth.y)) form.mouth = { x: int(d.mouth.x), y: int(d.mouth.y), w: Math.max(1, Math.min(12, int(d.mouth.w) || 2)) };
    if (d.blush === false) form.blush = false;
    else if (d.blush && Array.isArray(d.blush.x) && d.blush.x.length === 2 && d.blush.x.every(inW) && inW(d.blush.y)) form.blush = { x: d.blush.x.map(int), y: int(d.blush.y), ...(HEX.test(d.blush.c || '') ? { c: d.blush.c } : {}) };
    for (const k of ['e', 'hi', 'm', 'eClosed', 'head']) if (HEX.test(d[k] || '')) form[k] = d[k];
    if (d.shade === false) form.shade = false;
    if (d.mouthHide === true) form.mouthHide = true;
    if (int(d.ear) >= 0 && int(d.ear) <= H) form.ear = int(d.ear);
    if (d.pattern && PATTERNS[d.pattern.type] && HEX.test(d.pattern.c || '')) form.pattern = { type: d.pattern.type, c: d.pattern.c };
    const lines = (Array.isArray(d.lines) ? d.lines : []).map(l => text(l, 18)).filter(Boolean).slice(0, 4);
    if (lines.length) form.lines = lines;
    return { ok: true, form };
  }
  // 团子包里自带的扭蛋样式：{ name, pal, rows（可选，自己画的 12×12）, glass }
  function checkCapsule(d) {
    if (!d || typeof d !== 'object') return { ok: false, error: '不是扭蛋样式' };
    const pal = {};
    for (const [k, v] of Object.entries(d.pal || {})) if (k.length === 1 && k !== '.' && HEX.test(v || '')) pal[k] = v;
    const style = { name: text(d.name, 8) || '自定义', pal, glass: d.glass !== false };
    if (d.rows) {
      const all = { ...CAP_PAL, ...pal };
      if (!Array.isArray(d.rows) || d.rows.length !== 12 || !d.rows.every(row => typeof row === 'string' && row.length === 12 && [...row].every(ch => ch === '.' || all[ch]))) return { ok: false, error: 'rows 要正好 12 行、每行 12 个字符，且都在 pal 里' };
      style.rows = d.rows;
    }
    return { ok: true, style };
  }
  const BUILTIN = Object.keys(FORMS);
  function registerDango(key, def) { if (!BUILTIN.includes(key)) FORMS[key] = def; }
  function unregisterDango(key) { if (!BUILTIN.includes(key)) delete FORMS[key]; }

  return { DANGO_W: W, DANGO_H: H, DANGO_FORMS: FORMS, DANGO_BUILTIN: BUILTIN, DANGO_RARITY: RARITY, DANGO_CAP_STYLES: CAP_STYLES, dangoGrid: grid, dangoFace: face, drawDango, capsulePixels, CAP_PAL,
    dangoFromRecipe: fromRecipe, dangoCheckForm: checkForm, dangoCheckCapsule: checkCapsule, registerDango, unregisterDango };
});
