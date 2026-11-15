// electron tools/make_media.js：生成 README 用的图 docs/media/family.png（全家福 + 名字 + 稀有度）
// 离屏渲染，不会弹窗口。出错直接退出，不留对话框。
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

process.on('uncaughtException', (e) => { console.error(e); app.exit(1); });
app.whenReady().then(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'sprites.js'), 'utf8');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #fff6e6; font: 15px/1.4 "Microsoft YaHei UI", "Microsoft YaHei", sans-serif; color: #5a3a1e; }
    #g { display: grid; grid-template-columns: repeat(6, 1fr); gap: 18px 8px; padding: 26px 22px 24px; width: 1040px; box-sizing: border-box; }
    .c { text-align: center; } .c svg { width: 112px; height: 96px; shape-rendering: crispEdges; display: block; margin: 0 auto 4px; }
    .c b { font-weight: 700; } .t { display: inline-block; margin-left: 5px; padding: 0 7px; border-radius: 8px; font-size: 11px; line-height: 17px; font-weight: 700; color: #fff; background: #9a9085; vertical-align: 1px; }
    .t.R { background: #5b8def; } .t.SSR { background: #e0a100; } .s { font-size: 12px; color: #a08a70; }
  </style><div id="g"></div><script>${src}
    const RN = { N: '普通', R: '稀有', SSR: '隐藏' };
    for (const [k, f] of Object.entries(DANGO_FORMS)) {
      const d = document.createElement('div'); d.className = 'c';
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); drawDango(s, k);
      for (const id of ['eyesClosed', 'mouthO', 'sweat']) s.querySelector('#' + id).remove();
      d.appendChild(s); d.insertAdjacentHTML('beforeend', '<b>' + f.name + '</b><span class="t ' + f.rarity + '">' + RN[f.rarity] + '</span><div class="s">' + f.say + '</div>');
      g.appendChild(d);
    }
    document.title = String(document.getElementById('g').offsetHeight);
  </script>`;
  const win = new BrowserWindow({ width: 1040, height: 700, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const h = Number(win.getTitle()) || 560;
  win.setContentSize(1040, h);
  await new Promise(r => setTimeout(r, 500));
  const out = path.join(__dirname, '..', 'docs', 'media');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'family.png'), (await win.webContents.capturePage()).toPNG());
  console.log('family.png', 1040 + 'x' + h);
  // 打赏图：两张收款码并排
  const b64 = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'assets', n)).toString('base64');
  const pay = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff6e6;font:700 20px 'Microsoft YaHei UI','Microsoft YaHei',sans-serif"><div style="display:flex;gap:36px;justify-content:center;padding:26px 30px 22px">` +
    [['donate_wechat.png', '微信', '#07c160'], ['donate_alipay.png', '支付宝', '#1677ff']].map(([n, t, c]) => `<div style="text-align:center;color:${c}"><img src="${b64(n)}" style="width:240px;height:240px;display:block;image-rendering:pixelated;border-radius:14px;margin-bottom:10px">${t}</div>`).join('') + '</div></body>';
  win.setContentSize(580, 330);
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pay));
  await new Promise(r => setTimeout(r, 500));
  fs.writeFileSync(path.join(out, 'donate.png'), (await win.webContents.capturePage()).toPNG());
  console.log('donate.png');
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
