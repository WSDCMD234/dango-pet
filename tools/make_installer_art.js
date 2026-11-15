// electron tools/make_installer_art.js：生成安装包「完成」页左边那张图 build/installerSidebar.bmp（164×314，24 位 BMP）。
// 离屏渲染，不会弹窗口。出错直接退出，不留对话框。
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const W = 164, H = 314;
process.on('uncaughtException', (e) => { console.error(e); app.exit(1); });
app.whenReady().then(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'sprites.js'), 'utf8');
  const html = `<!doctype html><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #fff6e6; font-family: "Microsoft YaHei UI", "Microsoft YaHei", sans-serif; color: #5a3a1e; text-align: center; }
    svg { shape-rendering: crispEdges; display: block; margin: 0 auto; }
    #big { width: 112px; height: 96px; margin-top: 62px; }
    b { display: block; font-size: 22px; line-height: 30px; margin-top: 14px; letter-spacing: 2px; }
    i { display: block; font-style: normal; font-size: 12px; line-height: 18px; color: #a08a70; margin-top: 2px; }
    #row { position: absolute; left: 0; right: 0; bottom: 18px; display: flex; justify-content: center; gap: 4px; }
    #row svg { width: 28px; height: 24px; margin: 0; }
  </style><svg id="big"></svg><b>万能团子</b><i>住在扭蛋里的像素桌宠</i><div id="row"></div><script>${src}
    const clean = (s) => { for (const id of ['eyesClosed', 'mouthO', 'sweat']) { const e = s.querySelector('#' + id); if (e) e.remove(); } };
    drawDango(document.getElementById('big'), 'dango'); clean(document.getElementById('big'));
    for (const k of ['sakura', 'matcha', 'boba', 'pudding', 'ocean']) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); drawDango(s, k); clean(s); document.getElementById('row').appendChild(s);
    }
  </script>`;
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.setContentSize(W, H);
  await new Promise(r => setTimeout(r, 600));
  let img = await win.webContents.capturePage();
  const sz = img.getSize();
  if (sz.width !== W || sz.height !== H) img = img.resize({ width: W, height: H, quality: 'best' });
  const bgra = img.toBitmap();
  // 24 位 BMP：行从下往上存，每行补齐到 4 字节
  const row = Math.ceil(W * 3 / 4) * 4, data = Buffer.alloc(row * H), head = Buffer.alloc(54);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (y * W + x) * 4, d = (H - 1 - y) * row + x * 3;
    data[d] = bgra[s]; data[d + 1] = bgra[s + 1]; data[d + 2] = bgra[s + 2];
  }
  head.write('BM'); head.writeUInt32LE(54 + data.length, 2); head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14); head.writeInt32LE(W, 18); head.writeInt32LE(H, 22); head.writeUInt16LE(1, 26); head.writeUInt16LE(24, 28);
  head.writeUInt32LE(data.length, 34); head.writeInt32LE(2835, 38); head.writeInt32LE(2835, 42);
  const out = path.join(__dirname, '..', 'build');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'installerSidebar.bmp'), Buffer.concat([head, data]));
  console.log('installerSidebar.bmp', sz.width + 'x' + sz.height, '->', W + 'x' + H);
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
