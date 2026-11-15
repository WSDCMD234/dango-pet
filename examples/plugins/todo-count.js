// 例子：桌面上有个 todo.txt，里面有几行没划掉的事，团子头顶就显示几。
// 用法：把这个文件复制到 %APPDATA%\dango-pet\plugins\ 里，重启团子。todo.txt 里以 x 开头的行算做完了。
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = (团子) => {
  const file = path.join(os.homedir(), 'Desktop', 'todo.txt');
  const check = () => {
    let n = 0;
    try { n = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim() && !/^x\s/i.test(l.trim())).length; } catch { }
    团子.setCount(n);
  };
  check();
  setInterval(check, 30e3);
  团子.on('poke', () => { if (!fs.existsSync(file)) 团子.toast('在桌面建一个 todo.txt 试试'); });
};
