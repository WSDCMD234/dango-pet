// 扩展包在硬盘上的那一层：一个文件夹，里面每个 .json 是一包（团子 + 可选的扭蛋样式、出场 / 变身方式、右键菜单）。
// 默认是 %APPDATA%\dango-pet\dangos\；AI 捏的团子也存在这儿。
// 只管读写文件，不碰 Electron —— 主进程拿去接上「选文件」的窗口，测试直接用临时文件夹。
const fs = require('fs');
const path = require('path');
const { dangoCheckPack } = require('./sprites');

const MAX = 512 * 1024;      // 一个包最大 512 KB
// 文件名 → 包的代号：只留字母数字、汉字、- 和 _，别的换成 _（代号会用在存档里）
const packId = (name) => String(name).replace(/\.json$/i, '').replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 40) || 'pack';

function createPacks(dir, log = () => { }) {
  const fileOf = (id) => path.join(dir, packId(id) + '.json');
  const read = (file) => {
    if (fs.statSync(file).size > MAX) throw Object.assign(new Error('文件太大了（一个扩展包最多 512 KB）'), { plain: true });
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  };
  return {
    dir,
    // 文件夹里所有的包：[{ id, …文件内容 }]，内容对不对由 core 那边查（sprites.js 的 dangoCheckPack）
    list() {
      let files = [];
      try { files = fs.readdirSync(dir).filter(n => /\.json$/i.test(n)).sort(); } catch { return []; }
      const out = [];
      for (const n of files.slice(0, 200)) {
        if (packId(n) === 'base') { log('pack bad', n, 'base 是自带那一包的代号，换个文件名'); continue; }
        try { const d = read(path.join(dir, n)); if (d && typeof d === 'object' && !Array.isArray(d)) out.push({ ...d, id: packId(n) }); }
        catch (e) { log('pack bad', n, e.message); }
      }
      return out;
    },
    save(id, pack) { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fileOf(id), JSON.stringify(pack, null, 2)); } catch (e) { log('pack save fail', e.message); } },
    remove(id) { try { fs.unlinkSync(fileOf(id)); } catch (e) { log('pack remove fail', e.message); } },
    // 添加一个扩展包：先查能不能用，能用才拷进文件夹。
    // 包里写了 id（代号）就按代号存，再添加同一个代号的包 = 更新原来那个；没写就按文件名
    // 返回 { ok: true, id, name } 或 { ok: false, error: 给人看的原因 }
    add(file) {
      let d;
      try { d = read(file); }
      catch (e) { return { ok: false, error: e.plain ? e.message : e instanceof SyntaxError ? '这个文件不是合法的 JSON：' + String(e.message).slice(0, 60) : '读不了这个文件：' + String(e.message).slice(0, 60) }; }
      const r = dangoCheckPack(d);
      if (!r.ok) return { ok: false, error: r.error };
      const inside = path.resolve(path.dirname(file)).toLowerCase() === path.resolve(dir).toLowerCase();      // 选的就是文件夹里已有的
      let id = packId(inside ? path.basename(file) : r.id || path.basename(file));
      if (id === 'base') { if (inside) return { ok: false, error: '文件名不能叫 base（这是自带那一包的代号），换个名字' }; id = 'base-1'; }
      try { if (!inside) { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(file, fileOf(id)); } }
      catch (e) { log('pack add fail', e.message); return { ok: false, error: '存不进扩展包文件夹：' + String(e.message).slice(0, 60) }; }
      log('pack add', id, r.forms.length, r.capsule ? '+capsule' : '');
      return { ok: true, id, name: r.name || id };
    },
  };
}

module.exports = { createPacks, packId };
