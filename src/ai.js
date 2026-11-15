// AI 捏团子：把一句话变成团子「配方」（配方的格式和校验在 sprites.js 的 dangoFromRecipe）。只在主进程里用。
// 默认用 Claude（官方 SDK）；也可以填「OpenAI 兼容」的接口（各家大模型平台、本机的 Ollama 之类）。
// 只有用户点了「捏一只」才会联网；发出去的只有那一句描述和下面这段固定的说明，不带任何别的东西。

const DEFAULT_MODEL = 'claude-opus-5-5';

// 给模型看的说明：团子长什么样、配方每一项什么意思
const PROMPT = `你在给一个桌面宠物「万能团子」设计新团子。团子是一只 28×24 像素、圆滚滚坐着的小家伙，身体形状是固定的，你通过「配方」决定它的颜色、耳朵、尾巴、花纹、头顶的小东西和身上的点缀。

画布坐标：x 从左到右 0~27，y 从上到下 0~23。
- 身体占 x 3~24、y 8~23（头顶在 y=8，底在 y=23）
- 左眼 x 7~9、右眼 x 18~20，都在 y 14~16；嘴在 (13~14, 17)；腮红在 (5~6, 17) 和 (21~22, 17)
- 浅色肚皮在 y 19~22 的中间
- 头顶上方 y 0~7 是空的，留给 topper

配方的每一项：
- name：名字，2~6 个字，一般以「团子」结尾
- say：一句介绍，不超过 12 个字，带点俏皮
- lines：2~3 句它会说的话，每句不超过 12 个字
- colors：outline（描边，深色）、body（身体）、belly（肚皮，比身体浅）、accent（主点缀色）、accent2（副点缀色）、eye（眼睛，深色），全部写成 #rrggbb
- belly：要不要浅色肚皮
- ears：none / cat（猫耳）/ bunny（长兔耳）/ bear（圆耳，用 accent 色）/ horn（小角，用 accent 色）
- tail：none / cat / devil
- pattern：身体花纹，none / stripes（斜条纹）/ dots（波点）/ bands（横条）/ checker（格子），用 accent2 色
- topper：头顶的小东西。一个字符串数组，每个字符串是一行像素，从上到下；最多 8 行、每行最多 12 个字符，所有行一样长。它会水平居中，最后一行贴着头顶。字符含义：. 空白，o 描边色，b 身体色，a accent，w accent2，k 黑，r 红，y 黄，g 绿，p 粉，u 蓝，n 棕。不需要就给空数组
- marks：画在身体上、五官下面的小色块（雀斑、斑纹、领结……），每个是 {x, y, w, h, color}，color 写 #rrggbb，最多 12 个
- front：画在五官上面的小色块（眼镜、口罩、胡子……），格式同 marks，最多 8 个

要求：
- 结果永远是一只「团子」。用户提到别的角色、动物或东西时，取它的配色和一两个特征，做成那个主题的团子，名字也起成团子的名字。
- 颜色要搭：描边用身体色的深色版，不要纯黑；主要颜色别超过四五种。
- 小东西宁少勿多，左右对称、干净利落。墨镜这类要盖住眼睛的东西放在 front 里。`;

class Tip extends Error { }          // 直接说给用户听的话
const short = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 80);
const isLocal = (u) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u);
const okUrl = (u) => /^https:\/\/[^\s]+$/i.test(u) || isLocal(u);

// 从模型的回答里抠出 JSON（有的模型爱在外面包一层 \`\`\` 或者多说两句）
function looseJson(textOut) {
  const s = String(textOut || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Tip('AI 回的不是配方，再试一次');
  try { return JSON.parse(s.slice(a, b + 1)); } catch { throw new Tip('AI 回的配方格式不对，再试一次'); }
}

function createAI({ cfg, secret, log = () => { } }) {
  function config() {
    const a = cfg.get().ai || {};
    const provider = a.provider === 'openai' ? 'openai' : 'claude';
    const baseUrl = a.baseUrl || '', model = a.model || (provider === 'claude' ? DEFAULT_MODEL : '');
    const hasKey = !!secret.get();
    return { provider, baseUrl, model, hasKey, ready: !!model && (hasKey || isLocal(baseUrl)) && (provider === 'claude' || !!baseUrl) };
  }
  function save(v = {}) {
    const provider = v.provider === 'openai' ? 'openai' : 'claude';
    const baseUrl = String(v.baseUrl || '').trim().replace(/\/+$/, '');
    if (baseUrl && !okUrl(baseUrl)) return { ok: false, error: '接口地址要以 https:// 开头（本机的 http://localhost 也行）' };
    if (provider === 'openai' && !baseUrl) return { ok: false, error: '这种接口要填地址，一般以 /v1 结尾' };
    const model = String(v.model || '').trim() || (provider === 'claude' ? DEFAULT_MODEL : '');
    if (!model) return { ok: false, error: '要填模型名' };
    if (typeof v.key === 'string' && v.key.trim()) secret.set(v.key.trim());
    if (!secret.get() && !isLocal(baseUrl)) return { ok: false, error: '要填密钥' };
    cfg.set({ ai: { provider, baseUrl, model } });
    return { ok: true };
  }

  // ---- Claude：官方 SDK + 结构化输出（回来的一定是符合格式的配方）----
  async function viaClaude(c, desc) {
    const sdk = require('@anthropic-ai/sdk'), Anthropic = sdk.default || sdk;
    const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
    const { z } = require('zod');
    const Block = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), color: z.string() });
    const Recipe = z.object({
      name: z.string(), say: z.string(), lines: z.array(z.string()),
      colors: z.object({ outline: z.string(), body: z.string(), belly: z.string(), accent: z.string(), accent2: z.string(), eye: z.string() }),
      belly: z.boolean(),
      ears: z.enum(['none', 'cat', 'bunny', 'bear', 'horn']),
      tail: z.enum(['none', 'cat', 'devil']),
      pattern: z.enum(['none', 'stripes', 'dots', 'bands', 'checker']),
      topper: z.array(z.string()), marks: z.array(Block), front: z.array(Block),
    });
    const client = new Anthropic({ apiKey: secret.get(), ...(c.baseUrl ? { baseURL: c.baseUrl } : {}), timeout: 120000, maxRetries: 1 });
    // 官方地址 + 支持的模型：打开服务端兜底 —— 模型因为安全策略拒绝这次请求时，接口自动换一个模型把这次请求重跑一遍
    const fallback = !c.baseUrl && /^claude-(fable-5|opus-5|sonnet-5-5)/.test(c.model);
    const ask = (full) => client.beta.messages.parse({
      model: c.model, max_tokens: 16000,
      ...(full && fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      system: PROMPT,
      messages: [{ role: 'user', content: desc }],
      output_config: { ...(full ? { effort: 'medium' } : {}), format: betaZodOutputFormat(Recipe) },
    });
    try {
      let res;
      // 先按完整的参数发；接口说「这个请求我不认」（比如换了个不支持这些参数的模型或中转）就去掉可选的那几项再发一次
      try { res = await ask(true); } catch (e) { if (!(e instanceof Anthropic.BadRequestError)) throw e; log('ai retry plain', short(e.message)); res = await ask(false); }
      if (res.stop_reason === 'refusal') throw new Tip('这个描述 AI 不肯捏，换个说法试试');
      if (res.stop_reason === 'max_tokens' || !res.parsed_output) throw new Tip('AI 没说完，再试一次');
      return res.parsed_output;
    } catch (e) {
      if (e instanceof Tip) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new Tip('密钥不对，到接口设置里重新填一下');
      if (e instanceof Anthropic.PermissionDeniedError) throw new Tip('这个密钥没有权限用这个模型');
      if (e instanceof Anthropic.NotFoundError) throw new Tip('模型名或接口地址不对');
      if (e instanceof Anthropic.RateLimitError) throw new Tip('请求太频繁，或者额度用完了，等一会儿再试');
      if (e instanceof Anthropic.BadRequestError) throw new Tip('接口不接受这个请求：' + short(e.message));
      if (e instanceof Anthropic.APIConnectionError) throw new Tip('连不上接口，检查一下网络和接口地址');
      if (e instanceof Anthropic.APIError) throw new Tip('对方服务出错了（' + e.status + '），等一会儿再试');
      throw e;
    }
  }

  // ---- 其它家：OpenAI 兼容的 /chat/completions ----
  async function viaCompatible(c, desc) {
    let res;
    try {
      res = await fetch(c.baseUrl + '/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(120000),
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (secret.get() || 'local') },
        body: JSON.stringify({ model: c.model, messages: [{ role: 'system', content: PROMPT + '\n\n只输出一个 JSON 对象（就是配方本身），不要解释，不要代码块。' }, { role: 'user', content: desc }] }),
      });
    } catch (e) {
      throw new Tip(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? '等太久没回应，再试一次' : '连不上接口，检查一下网络和接口地址');
    }
    if (!res.ok) {
      const s = res.status;
      throw new Tip(s === 401 ? '密钥不对，到接口设置里重新填一下' : s === 403 ? '这个密钥没有权限用这个模型' : s === 404 ? '模型名或接口地址不对' : s === 429 ? '请求太频繁，或者额度用完了，等一会儿再试' : s >= 500 ? '对方服务出错了（' + s + '），等一会儿再试' : '接口不接受这个请求（' + s + '）');
    }
    const data = await res.json().catch(() => null);
    const out = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return looseJson(Array.isArray(out) ? out.map(p => p.text || '').join('') : out);
  }

  // 一句描述 → { ok, recipe } 或 { ok: false, error: 给用户看的话 }
  async function make(desc) {
    const c = config();
    if (!c.ready) return { ok: false, error: '先把接口设置填好' };
    desc = String(desc || '').trim().slice(0, 200);
    if (!desc) return { ok: false, error: '说说想要一只什么样的团子' };
    try {
      const recipe = c.provider === 'claude' ? await viaClaude(c, desc) : await viaCompatible(c, desc);
      return { ok: true, recipe };
    } catch (e) {
      if (!(e instanceof Tip)) log('ai error', e && e.name, short(e && e.message));
      return { ok: false, error: e instanceof Tip ? e.message : '出错了：' + short(e && e.message) };
    }
  }
  return { config, save, make };
}

module.exports = { createAI, PROMPT, DEFAULT_MODEL };
