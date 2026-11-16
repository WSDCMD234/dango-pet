// node --test tools/test_mod.js：改装相关的自测 —— 配方、扩展包、扭蛋样式、AI 捏团子（接口用本机的假服务器顶替，不真的联网）
const { test, mock } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCore } = require('../src/core');
const { createAI } = require('../src/ai');
const { createPacks } = require('../src/packs');
const S = require('../src/sprites');
// 仓库里带的例子扩展包：用上了出场 / 变身方式、右键菜单、指示灯、不透明外壳里面的样子
const WEATHER = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'packs', '天气团子.json'), 'utf8'));

const LEMON = { name: '柠檬团子', say: '酸得眯眼，提神', lines: ['来一口？', '维 C 拉满'], colors: { outline: '#7a6410', body: '#ffe14d', belly: '#fff6b0', accent: '#6fbf3f', accent2: '#ffffff', eye: '#2b1d10' }, belly: true, ears: 'none', tail: 'none', pattern: 'none',
  topper: ['..aa..', '.aaaa.', '..n...'], marks: [], front: [{ x: 6, y: 14, w: 5, h: 3, color: '#26262e' }, { x: 17, y: 14, w: 5, h: 3, color: '#26262e' }, { x: 11, y: 15, w: 6, h: 1, color: '#26262e' }] };

function setup(opt = {}) {
  try { mock.timers.reset(); } catch { }
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: new Date('2026-11-16T10:00:00') });
  for (const k of Object.keys(S.DANGO_FORMS)) S.unregisterDango(k);
  const sent = [], files = { ...(opt.packs || {}) };
  const st = { pos: [1700, 916], store: { greeted: true, lastGreet: '2026-11-16', dex: {}, chosen: 'random', dnd: true, ...(opt.cfg || {}) }, aiCfg: { provider: 'claude', model: 'claude-opus-5-5', baseUrl: '', hasKey: true, ready: true }, aiResult: opt.aiResult || { ok: true, recipe: LEMON } };
  let seed = 5; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const host = {
    cfg: { get: () => st.store, set: (p) => Object.assign(st.store, p) },
    pet: { getPos: () => st.pos.slice(), setPos: (x, y) => { st.pos = [x, y]; }, send: (ch, v) => sent.push({ to: 'pet', ch, v }) },
    bubble: { send: (ch, v) => sent.push({ to: 'bubble', ch, v }), setBounds() { }, reveal() { }, hide() { } },
    cursor: () => ({ x: 0, y: 0 }), workAreas: () => [{ x: 0, y: 0, width: 1920, height: 1040 }], random: rnd, log: () => { },
    packs: { list: () => Object.entries(files).map(([id, p]) => ({ ...p, id })), save: (id, p) => { files[id] = p; }, remove: (id) => { delete files[id]; }, openFolder() { } },
    ai: { config: () => st.aiCfg, save: (v) => { Object.assign(st.aiCfg, v, { ready: true }); return { ok: true }; }, make: async () => st.aiResult },
  };
  const core = createCore(host); core.start(); core.petReady();
  const shows = () => sent.filter(m => m.ch === 'show').map(m => m.v);
  const last = (ch) => sent.filter(m => m.ch === ch).pop();
  return { core, host, st, sent, files, shows, last, end: () => { core.dispose(); mock.timers.reset(); } };
}

test('配方 → 团子：颜色、头顶的小东西、盖在眼睛上的墨镜', () => {
  const r = S.dangoFromRecipe(LEMON);
  assert.ok(r.ok); assert.strictEqual(r.form.rarity, 'DIY'); assert.strictEqual(r.form.pal.b, '#ffe14d');
  assert.deepStrictEqual(r.form.over[0].slice(0, 2), [11, 5], '头顶的小东西居中、贴着头顶');
  assert.strictEqual(r.form.front.length, 3);
  S.registerDango('t#0', r.form);
  assert.ok(S.dangoGrid('t#0').some(p => p.y === 5 && p.c === '#6fbf3f'), '叶子画出来了');
  assert.strictEqual(S.dangoFace('t#0').acc.length, 3, '墨镜在五官上面那层');
  S.unregisterDango('t#0');
});

test('配方写错了：给出看得懂的原因，不会画出界', () => {
  assert.match(S.dangoFromRecipe({ name: 'x', colors: { body: 'red', outline: '#000000' } }).error, /#rrggbb/);
  assert.match(S.dangoFromRecipe({ colors: { body: '#ffffff', outline: '#000000' } }).error, /名字/);
  const r = S.dangoFromRecipe({ name: '乱写团子', colors: { body: '#ffffff', outline: '#333333' }, marks: [[99, 3, '#ff0000'], [26, 22, '#ff0000', 9, 9], { x: 1, y: 1, color: 'javascript:alert(1)' }], topper: ['<script>', 'aaaaaaaaaaaaaaaaaaaaaaaa'], ears: 'wings', lines: ['a'.repeat(99)] });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.form.marks, [[26, 22, '#ff0000', 2, 2]], '越界的裁掉，不认识的颜色丢掉');
  assert.ok(r.form.over[0][2].every(row => row.length <= 14 && /^[.a-z]*$/.test(row)));
  assert.strictEqual(r.form.half, undefined); assert.strictEqual(r.form.lines[0].length, 18);
});

test('扩展包：放进文件夹的团子进抽奖池；关掉这一包就不再抽到；带的扭蛋样式能切换', () => {
  const t = setup({ packs: { mine: { name: '我的包', capsule: { name: '红白', pal: { c: '#ffffff', k: '#dddddd', t: '#ffffff' }, glass: false }, dangos: [LEMON, { ...LEMON, name: '青柠团子' }, { name: '坏的' }] } } });
  assert.deepStrictEqual(t.core.packs().map(p => [p.id, p.keys.length]), [['mine', 2]], '坏的那只跳过，不影响别的');
  assert.ok(S.DANGO_FORMS['mine#0'] && S.DANGO_FORMS['mine#1']);
  const forms = t.last('forms').v; assert.ok(forms.forms['mine#0'] && forms.capsules['pack:mine'], '页面也得知道这些团子和样式');
  let hit = 0; for (let i = 0; i < 400; i++) { const k = t.last('pet').v.next; if (k.startsWith('mine#')) hit++; t.core.petMessage('pet-seen', k); }
  assert.ok(hit > 40, '应该常能抽到自制的：' + hit);
  t.core.bubbleMessage('bubble-action', { act: 'pack', id: 'mine' });
  assert.deepStrictEqual(t.st.store.packsOff, ['mine']);
  hit = 0; for (let i = 0; i < 300; i++) { const k = t.last('pet').v.next; if (k.startsWith('mine#')) hit++; t.core.petMessage('pet-seen', k); }
  assert.strictEqual(hit, 0, '关掉之后不再抽到');
  t.core.bubbleMessage('bubble-action', { act: 'pack', id: 'base' });
  assert.ok(S.DANGO_BUILTIN.includes(t.last('pet').v.next), '两包都关掉：还是从原版里抽，不会没得抽');
  t.core.bubbleMessage('bubble-action', { act: 'capsule', id: 'pack:mine' });
  assert.strictEqual(t.last('pet').v.capsule, 'pack:mine');
  t.core.bubbleMessage('bubble-action', { act: 'capsule', id: '不存在' });
  assert.strictEqual(t.st.store.capsule, 'pack:mine', '不认识的样式不理');
  const dex = t.shows().pop(); assert.strictEqual(dex.view, 'dex'); assert.deepStrictEqual(dex.packs.map(p => p.id), ['base', 'mine']);
  t.end();
});

test('删掉一个扩展包：文件删了、常驻和样式退回默认', () => {
  const t = setup({ packs: { mine: { name: '我的包', capsule: { name: '红白', pal: {} }, dangos: [LEMON] } }, cfg: { chosen: 'mine#0', capsule: 'pack:mine' } });
  t.core.bubbleMessage('bubble-action', { act: 'pack-del', id: 'mine' });
  assert.strictEqual(t.files.mine, undefined); assert.strictEqual(S.DANGO_FORMS['mine#0'], undefined);
  assert.strictEqual(t.st.store.chosen, 'random'); assert.strictEqual(t.st.store.capsule, 'orange');
  t.end();
});

test('扩展包整包检查：出场 / 变身方式、右键菜单、代号、指示灯、外壳里面的样子都认', () => {
  const r = S.dangoCheckPack(WEATHER);
  assert.ok(r.ok, r.error); assert.strictEqual(r.name, '天气团子'); assert.strictEqual(r.forms.length, 4); assert.deepStrictEqual(r.skipped, []);
  assert.deepStrictEqual(r.anim, { appear: 'flash', morph: 'glow' }); assert.strictEqual(r.menu, '换天气'); assert.strictEqual(r.id, 'weather');
  assert.strictEqual(r.capsule.light, 'j'); assert.strictEqual(r.capsule.lightOn, '#ffe066'); assert.deepStrictEqual(r.capsule.inside, { bg: '#141a3a', eye: '#ffe066' });
  const px = S.capsulePixels('dango', { style: r.capsule }), at = (part) => px.filter(p => p.part === part), key = (p) => p.x + ',' + p.y;
  assert.deepStrictEqual(at('light').map(key), ['4,6', '5,6', '6,6', '7,6'], '指示灯单独成一组');
  assert.ok(!at('bot').some(p => p.y === 6 && p.x >= 4 && p.x <= 7), '指示灯那几格不再算底壳');
  const top = new Set(at('top').map(key));
  assert.ok(at('in').length > 10 && at('in').every(p => top.has(key(p))), '里面的暗色和眼睛全躲在盖子后面，盖着的时候看不见');
  assert.strictEqual(at('in').filter(p => p.eye).length, 2);
  assert.strictEqual(S.capsulePixels('dango', { style: r.capsule, eyes: false }).filter(p => p.eye).length, 0);
  // 没带这些新东西的老样式：画出来和以前一样（没有指示灯、玻璃罩里是团子的脑袋）
  const old = S.capsulePixels('sakura', { style: S.DANGO_CAP_STYLES.mint });
  assert.strictEqual(old.filter(p => p.part === 'light').length, 0); assert.ok(old.some(p => p.part === 'in' && p.c === S.DANGO_FORMS.sakura.pal.b));
});

test('扩展包写错的地方：不认识的写法忽略，一样东西都用不了才算装不上，并说明原因', () => {
  const r = S.dangoCheckPack({ name: '乱写包', appear: 'explode', morph: 'spin', menu: '一二三四五六七八', id: '../evil', capsule: { name: '灯', light: 'z', inside: { bg: 'red' } }, dangos: [LEMON, { name: '坏的' }, { ...LEMON, name: '青柠团子' }] });
  assert.ok(r.ok); assert.strictEqual(r.anim, null); assert.strictEqual(r.menu, '一二三四五六'); assert.strictEqual(r.id, '', '代号只认字母数字 - _');
  assert.strictEqual(r.capsule.light, undefined, '没画出来的指示灯不算'); assert.strictEqual(r.capsule.inside, undefined, '玻璃罩的不需要「里面」');
  assert.deepStrictEqual(r.forms.map(f => f.i), [0, 2], '坏的那只跳过，别的序号不变'); assert.strictEqual(r.skipped[0].i, 1);
  assert.strictEqual(S.dangoCheckCapsule({ light: 's' }).style.light, 's', '不自己画的话，可以拿接缝当指示灯');
  assert.strictEqual(S.dangoCheckCapsule({ light: 's' }).style.lightOn, '#ff5a4e');
  assert.match(S.dangoCheckPack({ name: '空的' }).error, /没有团子/);
  assert.match(S.dangoCheckPack({ dangos: [{ name: '坏的' }] }).error, /都用不了/);
  assert.strictEqual(S.dangoCheckPack([LEMON]).ok, false); assert.strictEqual(S.dangoCheckPack(null).ok, false);
  const one = S.dangoCheckPack({ ...LEMON, appear: 'flash', menu: '变', id: 'x' });
  assert.ok(one.ok && one.forms.length === 1 && !one.anim && !one.menu && !one.id, '整个文件就是一只团子：整包的设置不生效');
  const full = S.dangoCheckForm({ name: '方块', pal: { o: '#333344', b: '#88aaff' }, fx: ['#ff0000', 'red', '#00ff00', 1, '#0000ff', '#111111', '#222222', '#333333', '#444444'] });
  assert.deepStrictEqual(full.form.fx, ['#ff0000', '#00ff00', '#0000ff', '#111111', '#222222', '#333333'], '粒子颜色：只留认识的，最多 6 个');
});

test('添加扩展包（文件这一层）：查过能用才拷进文件夹；写了代号按代号存，再加一次就是更新', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dango-packs-')), dir = path.join(tmp, 'dangos'), src = path.join(tmp, 'downloads');
  fs.mkdirSync(src);
  const put = (name, v) => { const f = path.join(src, name); fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v)); return f; };
  const logs = [], P = createPacks(dir, (...a) => logs.push(a.join(' ')));
  try {
    assert.deepStrictEqual(P.list(), [], '文件夹还没有：算没有包，不报错');
    assert.deepStrictEqual(P.add(put('天气团子.json', WEATHER)), { ok: true, id: 'weather', name: '天气团子' });
    assert.deepStrictEqual(fs.readdirSync(dir), ['weather.json'], '包里写了代号：按代号存');
    assert.deepStrictEqual(P.add(put('天气团子 (1).json', { ...WEATHER, name: '天气团子二版' })), { ok: true, id: 'weather', name: '天气团子二版' });
    assert.deepStrictEqual(fs.readdirSync(dir), ['weather.json'], '同一个代号再加一次 = 更新，不会多出一份');
    assert.deepStrictEqual(P.list().map(p => [p.id, p.name]), [['weather', '天气团子二版']]);
    assert.strictEqual(P.add(put('我的 包!.json', String.fromCharCode(0xFEFF) + JSON.stringify({ name: '我的包', id: '', dangos: [LEMON] }))).id, '我的_包_', '没写代号：按文件名（带 BOM 的文件也能读）');
    assert.strictEqual(P.add(put('单只.json', LEMON)).name, '柠檬团子', '整个文件就是一只团子也行');
    assert.strictEqual(P.add(put('base.json', { name: '撞名', dangos: [LEMON] })).id, 'base-1', 'base 是自带那一包的代号，不让别的包占');
    const n = fs.readdirSync(dir).length;
    assert.match(P.add(put('坏的.json', '{ name: 没引号 }')).error, /不是合法的 JSON/);
    assert.match(P.add(put('空的.json', {})).error, /没有团子/);
    assert.match(P.add(put('太大.json', JSON.stringify({ name: 'x'.repeat(600 * 1024) }))).error, /太大/);
    assert.match(P.add(path.join(src, '不存在.json')).error, /读不了/);
    assert.strictEqual(fs.readdirSync(dir).length, n, '装不上的不会拷进文件夹');
    assert.deepStrictEqual(P.add(path.join(dir, 'weather.json')), { ok: true, id: 'weather', name: '天气团子二版' });
    assert.strictEqual(fs.readdirSync(dir).length, n, '选的就是文件夹里已有的：不重复拷');
    fs.writeFileSync(path.join(dir, '手放的.json'), 'oops'); fs.writeFileSync(path.join(dir, '说明.txt'), 'x');
    assert.strictEqual(P.list().length, n, '文件夹里读不了的文件跳过并记日志，不影响别的'); assert.ok(logs.some(l => l.includes('pack bad')));
    P.save('ai-1', { name: 'AI', dangos: [LEMON] }); assert.ok(P.list().some(p => p.id === 'ai-1'));
    P.remove('ai-1'); assert.ok(!P.list().some(p => p.id === 'ai-1'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('添加扩展包：装上就换上它的扭蛋样式，第一只出来说「装好了」；取消 / 装不上什么都不动', async () => {
  const t = setup({ cfg: { packsOff: ['weather'] } });
  t.host.packs.pick = async () => { t.files.weather = WEATHER; return { ok: true, id: 'weather', name: '天气团子' }; };
  assert.ok(t.core.menuModel().some(m => m.label === '添加扩展包…'));
  t.core.showBubble({ view: 'help', keep: true });
  await t.core.addPack();
  assert.strictEqual(t.core.state().bubble, null, '先把开着的卡片收起来，不然会挡住选文件的窗口');
  assert.deepStrictEqual(t.core.packs().map(p => [p.id, p.keys.length, p.menu]), [['weather', 4, '换天气']]);
  assert.strictEqual(t.st.store.capsule, 'pack:weather'); assert.strictEqual(t.last('pet').v.capsule, 'pack:weather');
  assert.deepStrictEqual(t.st.store.packsOff, [], '以前关掉过的同一个包：重新打开');
  assert.deepStrictEqual(t.last('forms').v.forms['weather#0'].anim, { appear: 'flash', morph: 'glow' }, '出场 / 变身方式跟着团子发给页面');
  assert.strictEqual(t.last('pet-peek').v.form, 'weather#0', '第一只马上出来给你看');
  t.core.petMessage('pet-out', true); t.core.petMessage('pet-seen', 'weather#0'); mock.timers.tick(700);
  assert.match(t.shows().pop().text, /装好了：天气团子[\s\S]*4 只[\s\S]*星空球/, '由它来说装好了（而不是弹「新团子」卡片）');
  // 它不肯出来（比如正生着气）：过一会儿照样把话说了
  t.core.petMessage('pet-out', false);
  t.host.packs.pick = async () => { t.files.mine = { name: '我的包', dangos: [LEMON] }; return { ok: true, id: 'mine', name: '我的包' }; };
  await t.core.addPack(); const before = t.shows().length; mock.timers.tick(2700);
  assert.strictEqual(t.shows().length, before + 1); assert.match(t.shows().pop().text, /装好了：我的包[\s\S]*1 只/);
  assert.strictEqual(t.st.store.capsule, 'pack:weather', '没带扭蛋样式的包：不动现在的样式');
  // 团子正好在外面：直接说装好了，并点名让它当场变成包里第一只
  t.core.petMessage('pet-out', true);
  t.host.packs.pick = async () => { t.files.fruit = { name: '水果包', dangos: [{ ...LEMON, name: '青柠团子' }] }; return { ok: true, id: 'fruit', name: '水果包' }; };
  await t.core.addPack();
  assert.match(t.shows().pop().text, /装好了：水果包/); assert.strictEqual(t.last('pet-peek').v.form, 'fruit#0');
  t.core.petMessage('pet-out', false);
  // 取消：什么都不发生
  const n = t.sent.length; t.host.packs.pick = async () => null; await t.core.addPack();
  assert.strictEqual(t.sent.filter(m => m.ch !== 'show').length, t.sent.slice(0, n).filter(m => m.ch !== 'show').length);
  // 装不上：弹一张卡片说原因
  t.host.packs.pick = async () => ({ ok: false, error: '这个文件不是合法的 JSON：xxx' }); await t.core.addPack();
  const v = t.shows().pop(); assert.strictEqual(v.view, 'say'); assert.strictEqual(v.title, '这个扩展包装不上'); assert.match(v.text, /不是合法的 JSON/);
  t.host.packs.pick = async () => { throw new Error('boom'); }; await t.core.addPack(); assert.match(t.shows().pop().text, /出错了：boom/);
  assert.deepStrictEqual(t.core.packs().map(p => p.id), ['weather', 'mine', 'fruit']);
  t.end();
});

test('扩展包自己的右键菜单：列出这一包的团子，没见过也能直接选；关掉这一包菜单就没了', () => {
  const t = setup({ packs: { weather: WEATHER, mine: { name: '我的包', dangos: [{ ...LEMON, rarity: 'N' }] } } });
  const menu = () => t.core.menuModel().find(m => m.label === '换天气');
  assert.deepStrictEqual(menu().submenu.map(m => (m.checked ? '*' : '') + m.label), ['*每次随机', '晴天团子', '多云团子', '下雨团子', '下雪团子']);
  menu().submenu[3].click();
  assert.strictEqual(t.st.store.chosen, 'weather#2'); assert.strictEqual(t.last('pet').v.chosen, 'weather#2'); assert.strictEqual(t.last('pet').v.next, 'weather#2');
  assert.deepStrictEqual(menu().submenu.filter(m => m.checked).map(m => m.label), ['下雨团子']);
  menu().submenu[0].click(); assert.strictEqual(t.st.store.chosen, 'random');
  // 图鉴里这一包标着「随时能选」；没写菜单的包里、没见过的（非自制）还是不能选
  t.core.bubbleMessage('bubble-action', { act: 'dex' });
  assert.deepStrictEqual(t.shows().pop().packs.map(p => [p.id, !!p.free]), [['base', false], ['weather', true], ['mine', false]]);
  t.core.bubbleMessage('bubble-action', { act: 'choose', form: 'weather#3' }); assert.strictEqual(t.st.store.chosen, 'weather#3');
  t.core.bubbleMessage('bubble-action', { act: 'choose', form: 'mine#0' }); assert.strictEqual(t.st.store.chosen, 'weather#3', '没见过的不能选');
  assert.strictEqual(t.core.menuModel().filter(m => m.submenu && m.label !== '专注一会儿').length, 1, '没写 menu 的包不加菜单');
  t.core.bubbleMessage('bubble-action', { act: 'pack', id: 'weather' });
  assert.strictEqual(menu(), undefined, '关掉这一包：菜单跟着没了');
  t.end();
});

test('没写介绍的团子：不会念出只有名字的半句', () => {
  const t = setup({ packs: { mine: { name: '我的包', dangos: [{ name: '没介绍', rarity: 'N', colors: { outline: '#333333', body: '#ffffff' } }] } }, cfg: { chosen: 'mine#0', dex: { 'mine#0': 1 } } });
  const said = new Set();
  for (let i = 0; i < 400; i++) { t.core.petMessage('pet-seen', 'mine#0'); mock.timers.tick(700); const v = t.shows().pop(); if (v && v.view === 'toast') said.add(v.text); }
  assert.ok(said.size > 5, '说过的话：' + said.size); assert.ok(![...said].some(s => /没介绍：/.test(s)), [...said].filter(s => /没介绍/.test(s)).join(' | '));
  t.end();
});

test('AI 捏团子：说一句 → 忙碌 → 给你看 → 收下后存成扩展包并马上蹦出来', async () => {
  const t = setup();
  t.core.openAI(); assert.strictEqual(t.shows().pop().stage, 'ask');
  const p = t.core.aiMake('戴墨镜的柠檬团子');
  assert.strictEqual(t.last('pet').v.mood, 'busy', '捏的时候团子转齿轮');
  assert.strictEqual(t.shows().pop().stage, 'busy');
  await p;
  const res = t.shows().pop(); assert.strictEqual(res.stage, 'result');
  assert.strictEqual(S.DANGO_FORMS[res.form].name, '柠檬团子'); assert.strictEqual(S.DANGO_FORMS[res.form].rarity, 'DIY');
  assert.strictEqual(Object.keys(t.files).length, 0, '还没点收下，不存');
  t.core.bubbleMessage('bubble-action', { act: 'ai-keep' });
  const id = Object.keys(t.files)[0]; assert.ok(id.startsWith('ai-')); assert.strictEqual(t.files[id].dangos[0].name, '柠檬团子');
  assert.strictEqual(t.last('pet-peek').v.form, id + '#0', '收下就让它出来');
  assert.strictEqual(t.last('pet').v.next, id + '#0');
  t.end();
});

test('AI 捏团子：接口报错 / 配方不能用 → 回到输入框并说明原因；重捏会丢掉上一只', async () => {
  const t = setup({ aiResult: { ok: false, error: '密钥不对，到接口设置里重新填一下' } });
  await t.core.aiMake('随便');
  let v = t.shows().pop(); assert.strictEqual(v.stage, 'ask'); assert.match(v.error, /密钥不对/); assert.strictEqual(v.text, '随便');
  t.st.aiResult = { ok: true, recipe: { name: '没颜色' } };
  await t.core.aiMake('随便'); v = t.shows().pop(); assert.match(v.error, /配方不能用/);
  t.st.aiResult = { ok: true, recipe: LEMON };
  await t.core.aiMake('随便'); const first = t.shows().pop().form;
  t.core.bubbleMessage('bubble-action', { act: 'ai-redo', text: '随便' });
  assert.strictEqual(S.DANGO_FORMS[first], undefined, '上一只没收下就丢掉');
  t.end();
});

test('没填接口：先让你填；菜单里有「AI 捏团子」和「请团子喝杯奶茶」', () => {
  const t = setup(); t.st.aiCfg.ready = false;
  t.core.openAI(); assert.strictEqual(t.shows().pop().stage, 'setup');
  const labels = t.core.menuModel().map(m => m.label || '-');
  assert.ok(labels.includes('AI 捏团子…') && labels.includes('请团子喝杯奶茶'));
  t.core.menuModel().find(m => m.label === '请团子喝杯奶茶').click();
  assert.strictEqual(t.shows().pop().view, 'donate');
  t.end();
});

// ---------- 接口这一层：起一个本机的假服务器，看发出去的请求对不对、回来的东西能不能用 ----------
function fakeServer(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { const body = b ? JSON.parse(b) : null; seen.push({ url: req.url, headers: req.headers, body }); const [code, out] = handler(req, body); res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); }); });
    srv.listen(0, '127.0.0.1', () => resolve({ url: 'http://127.0.0.1:' + srv.address().port, seen, close: () => new Promise(r => srv.close(r)) }));
  });
}
function aiWith(conf, key = 'sk-test-123') {
  const store = { ai: conf }; let k = key;
  return createAI({ cfg: { get: () => store, set: (p) => Object.assign(store, p) }, secret: { get: () => k, set: (v) => { k = v; } } });
}

test('Claude 接口：请求带模型、说明、输出格式；回来的配方能直接用', async () => {
  try { mock.timers.reset(); } catch { }
  const srv = await fakeServer(() => [200, { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(LEMON) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }]);
  const ai = aiWith({ provider: 'claude', baseUrl: srv.url, model: 'claude-opus-5-5' });
  const r = await ai.make('戴墨镜的柠檬团子');
  await srv.close();
  assert.ok(r.ok, r.error); assert.strictEqual(r.recipe.name, '柠檬团子');
  const q = srv.seen[0];
  assert.match(q.url, /\/v1\/messages/); assert.ok(JSON.stringify(q.headers).includes('sk-test-123'), '密钥由 SDK 放进请求头');
  assert.strictEqual(q.body.model, 'claude-opus-5-5'); assert.strictEqual(q.body.messages[0].content, '戴墨镜的柠檬团子');
  assert.match(q.body.system, /万能团子/); assert.strictEqual(q.body.output_config.effort, 'medium'); assert.ok(q.body.output_config.format, '要带结构化输出的格式');
  assert.strictEqual(q.body.thinking, undefined, '这个模型的思考是常开的，不用传');
  assert.ok(S.dangoFromRecipe(r.recipe).ok);
});

test('Claude 接口：密钥不对 / 模型拒绝 → 说人话', async () => {
  try { mock.timers.reset(); } catch { }
  let mode = 401;
  const srv = await fakeServer(() => mode === 401 ? [401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }]
    : [200, { id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: 'refusal', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } }]);
  const ai = aiWith({ provider: 'claude', baseUrl: srv.url, model: 'claude-opus-5-5' });
  let r = await ai.make('x'); assert.strictEqual(r.ok, false); assert.match(r.error, /密钥不对/);
  mode = 200; r = await ai.make('x'); assert.strictEqual(r.ok, false); assert.match(r.error, /不肯捏/);
  await srv.close();
});

test('其它家的兼容接口：回答外面包了代码块也能读出配方；额度用完说人话', async () => {
  try { mock.timers.reset(); } catch { }
  let mode = 200;
  const srv = await fakeServer(() => mode === 200 ? [200, { choices: [{ message: { role: 'assistant', content: '好的：\n```json\n' + JSON.stringify(LEMON) + '\n```' } }] }] : [429, { error: { message: 'quota' } }]);
  const ai = aiWith({ provider: 'openai', baseUrl: srv.url + '/v1', model: 'some-model' });
  let r = await ai.make('柠檬'); assert.ok(r.ok, r.error); assert.strictEqual(r.recipe.colors.body, '#ffe14d');
  assert.strictEqual(srv.seen[0].url, '/v1/chat/completions'); assert.strictEqual(srv.seen[0].headers.authorization, 'Bearer sk-test-123'); assert.strictEqual(srv.seen[0].body.model, 'some-model');
  mode = 429; r = await ai.make('柠檬'); assert.match(r.error, /额度/);
  await srv.close();
});

test('接口设置：地址必须是 https（本机除外）、要有模型和密钥', () => {
  const ai = aiWith({}, '');
  assert.match(ai.save({ provider: 'openai', baseUrl: 'http://example.com/v1', model: 'm', key: 'k' }).error, /https/);
  assert.match(ai.save({ provider: 'openai', baseUrl: '', model: 'm', key: 'k' }).error, /地址/);
  assert.match(ai.save({ provider: 'claude', key: '' }).error, /密钥/);
  assert.deepStrictEqual(ai.save({ provider: 'claude', key: 'sk-x' }), { ok: true });
  assert.deepStrictEqual({ ...ai.config() }, { provider: 'claude', baseUrl: '', model: 'claude-opus-5-5', hasKey: true, ready: true });
  assert.deepStrictEqual(aiWith({}, '').save({ provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen' }), { ok: true }, '本机的模型不用密钥');
});
