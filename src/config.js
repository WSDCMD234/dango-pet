// 设置和存档：一个 JSON 文件（位置、图鉴、倒计时、专注次数、开关）
// 放在 %APPDATA%\dango-pet\config.json，升级 / 重装都不会丢；dir 可以换（测试用）
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  pos: null,            // 团子窗口位置
  chosen: 'random',     // 常驻形态：random = 每次随机
  dex: {},              // 图鉴：形态 → 见过几次
  greeted: false,       // 第一次运行打过招呼没
  countdowns: [],       // 倒计时 [{ name, date: 'YYYY-MM-DD' }]
  focus: { day: '', today: 0, total: 0, minutes: 0 },
  rest: true,           // 休息提醒
  night: true,          // 深夜催睡
  dnd: false,           // 勿扰
  lastGreet: '',        // 上次问早安是哪天
  lastNight: '',        // 上次催睡是哪天
};

function createConfig(dir) {
  const file = path.join(dir, 'config.json');
  let data = null;
  function get() {
    if (data) return data;
    try { data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { data = { ...DEFAULTS }; }
    return data;
  }
  function set(patch) {
    Object.assign(get(), patch);
    // 先写临时文件再改名：写到一半断电也不会把存档写坏
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, file);
    } catch {
      try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch { }
    }
  }
  return { get, set, dir, file };
}

module.exports = { createConfig, DEFAULTS };
