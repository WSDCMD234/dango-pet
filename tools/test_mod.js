// node --test tools/test_mod.js：改装相关的自测 —— 配方、团子包、扭蛋样式、AI 捏团子（接口用本机的假服务器顶替，不真的联网）
const { test, mock } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createCore } = require('../src/core');
const { createAI } = require('../src/ai');
const S = require('../src/sprites');

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
    packs: { list: () => Object.entries(files).map(([id, p]) => ({ id, ...p })), save: (id, p) => { files[id] = p; }, remove: (id) => { delete files[id]; }, openFolder() { } },
    ai: { config: () => st.aiCfg, save: (v) => { Object.assign(st.aiCfg, v, { ready: true }); return { ok: true }; }, make: async () => st.aiResult },
  };
  const core = createCore(host); core.start(); core.petReady();
  const shows = () => sent.filter(m => m.ch === 'show').map(m => m.v);
  const last = (ch) => sent.filter(m => m.ch === ch).pop();
  return { core, st, sent, files, shows, last, end: () => { core.dispose(); mock.timers.reset(); } };
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

test('团子包：放进文件夹的团子进抽奖池；关掉这一包就不再抽到；带的扭蛋样式能切换', () => {
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

test('删掉一个团子包：文件删了、常驻和样式退回默认', () => {
  const t = setup({ packs: { mine: { name: '我的包', capsule: { name: '红白', pal: {} }, dangos: [LEMON] } }, cfg: { chosen: 'mine#0', capsule: 'pack:mine' } });
  t.core.bubbleMessage('bubble-action', { act: 'pack-del', id: 'mine' });
  assert.strictEqual(t.files.mine, undefined); assert.strictEqual(S.DANGO_FORMS['mine#0'], undefined);
  assert.strictEqual(t.st.store.chosen, 'random'); assert.strictEqual(t.st.store.capsule, 'orange');
  t.end();
});

test('AI 捏团子：说一句 → 忙碌 → 给你看 → 收下后存成团子包并马上蹦出来', async () => {
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
