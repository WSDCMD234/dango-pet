// 万能团子（主进程）：开窗口、托盘、右键菜单，把系统的事接给 core.js（真正的逻辑都在那边）
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor, safeStorage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createConfig } = require('./config');
const { createCore, PET } = require('./core');
const { createAI } = require('./ai');
const { createPacks } = require('./packs');

const TEST = process.env.DANGO_TEST || '';      // 自动测试脚本的路径：窗口离屏渲染，不会出现在桌面上
// 存档放 %APPDATA%\dango-pet（固定英文目录名）；测试时换到临时目录，不碰真存档
const DATA = process.env.DANGO_DATA || (TEST ? path.join(os.tmpdir(), 'dango-test-' + process.pid) : path.join(app.getPath('appData'), 'dango-pet'));
app.setPath('userData', DATA);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.dango.pet');
// 「扭蛋抓不起来」的根因：Chromium 的窗口遮挡判定（锁屏 / 被全屏窗口盖过之后）会把团子页面标成 hidden 且不恢复，
// 这时按下马上跟一个松开，表现为抓不起来、拖不动。关掉遮挡判定，下面还有一个 5 秒一次的自愈兜底。
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const cfg = createConfig(DATA);
const LOG = path.join(DATA, 'pet.log');
function log(...a) {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${a.join(' ')}\n`;
  try { fs.appendFileSync(LOG, line); } catch { }
}
// 出错只记日志，不弹 Electron 那个吓人的报错框
process.on('uncaughtException', (e) => log('uncaught', e && e.stack || e));
process.on('unhandledRejection', (e) => log('unhandled', e && e.stack || e));

let pet, bubble, tray, core, quitting = false, clickThrough = false;
const alive = (w) => w && !w.isDestroyed();

// ---------- 窗口 ----------
function createWindows() {
  const common = {
    frame: false, transparent: true, resizable: false, skipTaskbar: true, hasShadow: false,
    fullscreenable: false, maximizable: false, minimizable: false, alwaysOnTop: true, show: false,
    backgroundColor: '#00000000', icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: !!TEST },
  };
  // 窗口不许被关掉（Alt+F4 之类只藏起来）；真没了（渲染进程崩 / 被系统销毁）就重建，不然之后每次用到它都报 Object has been destroyed
  const guard = (name, w, make) => {
    w.on('close', (e) => { if (quitting) return; e.preventDefault(); log(name, 'close blocked'); if (name === 'bubble') core.hideBubble(); });
    w.on('closed', () => { if (quitting) return; log(name, 'closed -> recreate'); setTimeout(make, 300); });
    w.webContents.on('render-process-gone', (_, d) => { if (quitting) return; log(name, 'render gone', d && d.reason); try { w.destroy(); } catch { } });
    w.webContents.on('console-message', (e) => { const m = e.message || ''; if (e.level === 'error' || /Error/.test(m)) log(name, 'console', m, e.lineNumber || ''); });
  };
  const makePet = () => {
    const p = core.startPos();
    const w = pet = new BrowserWindow({ ...common, width: PET, height: PET, x: p.x, y: p.y, focusable: false });
    w.setAlwaysOnTop(true, 'pop-up-menu');
    w.loadFile(path.join(__dirname, 'pet.html'));
    w.once('ready-to-show', () => { if (alive(w) && !TEST) w.showInactive(); });
    w.webContents.on('did-finish-load', () => { if (!TEST) w.setIgnoreMouseEvents(clickThrough); core.petReady(); });
    guard('pet', w, makePet);
  };
  const makeBubble = () => {
    const w = bubble = new BrowserWindow({ ...common, width: 340, height: 120 });
    w.setAlwaysOnTop(true, 'pop-up-menu');
    w.loadFile(path.join(__dirname, 'bubble.html'));
    w.webContents.on('did-finish-load', () => core.syncForms());
    guard('bubble', w, makeBubble);
  };
  makePet();
  makeBubble();

  // 置顶偶尔被全屏程序挤掉，定时拉回来
  setInterval(() => { if (alive(pet)) pet.setAlwaysOnTop(true, 'pop-up-menu'); }, 15000);
  // 自愈：窗口明明显示着、页面却自认为 hidden（见文件头遮挡判定的说明）→ 藏一下再显示，把页面叫醒
  if (!TEST) setInterval(async () => {
    for (const [name, w] of [['pet', pet], ['bubble', bubble]]) {
      if (!alive(w) || !w.isVisible()) continue;
      const st = core.state();
      if (name === 'pet' && (st.dragging || st.flying)) continue;
      try {
        const v = await w.webContents.executeJavaScript('document.visibilityState');
        if (v !== 'visible' && alive(w) && w.isVisible()) { log(name, 'page', v, '-> wake'); w.hide(); w.showInactive(); if (name === 'pet') { w.setAlwaysOnTop(true, 'pop-up-menu'); core.petReady(); } }
      } catch (e) { log(name, 'wake check fail', e.message); }
    }
  }, 5000);
}
app.on('before-quit', () => { quitting = true; });

// ---------- 扩展包：%APPDATA%/dango-pet/dangos/*.json（改装用，AI 捏的也存在这儿；读写在 packs.js）----------
const packs = createPacks(path.join(DATA, 'dangos'), log);
packs.openFolder = () => { try { fs.mkdirSync(packs.dir, { recursive: true }); shell.openPath(packs.dir); } catch { } };
// 「添加扩展包…」：弹系统的选文件窗口；取消了回 null
packs.pick = async () => {
  const r = await dialog.showOpenDialog({ title: '选一个扩展包', buttonLabel: '添加', filters: [{ name: '扩展包', extensions: ['json'] }], properties: ['openFile'] });
  return r.canceled || !r.filePaths[0] ? null : packs.add(r.filePaths[0]);
};
// AI 接口的密钥：用系统的加密存（Windows 上是 DPAPI，只有这台电脑的这个用户能解开），不进日志
const secret = {
  get() {
    const v = cfg.get().aiKey || '';
    try { return v.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')) : v.startsWith('raw:') ? v.slice(4) : ''; } catch { return ''; }
  },
  set(k) { cfg.set({ aiKey: safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(k).toString('base64') : 'raw:' + k }); },
};

// ---------- 把系统能力接给 core ----------
// 开机自启：从源码跑（没打包）时要带上工程目录，不然开机起的是个空 Electron
const loginOpts = app.isPackaged ? {} : { path: process.execPath, args: [path.resolve(__dirname, '..')] };
const host = {
  cfg, log,
  pet: {
    getPos: () => (alive(pet) ? pet.getPosition() : [0, 0]),
    setPos: (x, y) => { if (alive(pet)) pet.setPosition(x, y); },
    send: (ch, v) => { if (alive(pet)) pet.webContents.send(ch, v); },
    // 透明的地方点得穿：光标不在扭蛋 / 团子身上时，整个窗口不接鼠标
    setClickThrough: (on) => { clickThrough = on; if (alive(pet) && !TEST) pet.setIgnoreMouseEvents(on); },
  },
  bubble: {
    send: (ch, v) => { if (alive(bubble)) bubble.webContents.send(ch, v); },
    setBounds: (b) => { if (alive(bubble)) bubble.setBounds(b); },
    reveal: (focus) => { if (!alive(bubble) || TEST) return; if (focus) { bubble.show(); bubble.focus(); } else bubble.showInactive(); bubble.setAlwaysOnTop(true, 'pop-up-menu'); },
    hide: () => { if (alive(bubble) && bubble.isVisible()) bubble.hide(); },
  },
  cursor: () => screen.getCursorScreenPoint(),
  workAreas: () => { const p = screen.getPrimaryDisplay(); return [p, ...screen.getAllDisplays().filter(d => d.id !== p.id)].map(d => d.workArea); },
  idleSeconds: () => powerMonitor.getSystemIdleTime(),
  autoStart: { get: () => app.getLoginItemSettings(loginOpts).openAtLogin, set: (on) => app.setLoginItemSettings({ ...loginOpts, openAtLogin: !!on }) },
  tray: (tip) => { if (tray && !tray.isDestroyed()) tray.setToolTip(tip); },
  packs,
  ai: createAI({ cfg, secret, log }),
  quit: () => app.quit(),
};

// ---------- 页面发来的消息 ----------
for (const ch of ['pet-drag-start', 'pet-drag-end', 'pet-seen', 'pet-out', 'pet-log', 'pet-event', 'pet-shape']) ipcMain.on(ch, (_, v) => core.petMessage(ch, v));
for (const ch of ['bubble-size', 'bubble-action', 'close-bubble']) ipcMain.on(ch, (_, v) => core.bubbleMessage(ch, v));
const menu = () => Menu.buildFromTemplate(core.menuModel());
ipcMain.on('pet-menu', () => { if (alive(pet)) menu().popup({ window: pet }); });

// ---------- 插件：%APPDATA%\dango-pet\plugins\*.js，每个文件导出 function (团子) { ... } ----------
function loadPlugins() {
  const dir = path.join(DATA, 'plugins');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.js')); } catch { return; }
  for (const f of files) {
    try { const fn = require(path.join(dir, f)); if (typeof fn === 'function') fn(core.api); log('plugin loaded', f); }
    catch (e) { log('plugin fail', f, e && e.message); }
  }
}

app.whenReady().then(() => {
  fs.mkdirSync(DATA, { recursive: true });
  try { if (fs.statSync(LOG).size > 512 * 1024) fs.renameSync(LOG, LOG.replace(/\.log$/, '.old.log')); } catch { }   // 日志别无限长
  // 从 1.x 升上来：把原来放在程序目录 data/ 里的位置带过来
  try { if (!fs.existsSync(cfg.file)) { const old = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config.json'), 'utf8')); cfg.set({ pos: old.pos || null, greeted: !!old.greeted }); } } catch { }
  core = createCore(host);
  createWindows();
  if (!TEST) {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')));
    tray.setToolTip('万能团子');
    tray.on('click', () => core.showBubble({ view: 'help', keep: true, version: core.api.version }));
    tray.on('right-click', () => tray.popUpContextMenu(menu()));
  }
  // 屏幕变了（拔外接屏、改分辨率、睡醒）：位置不在任何屏幕里了就回右下角
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => setTimeout(() => core.checkPos(), 600));
  powerMonitor.on('resume', () => setTimeout(() => core.checkPos(), 1500));
  core.start();
  loadPlugins();
  log('start', core.api.version, TEST ? '(test)' : '');
  if (TEST) require(path.resolve(TEST))({ app, core, cfg, log, host, DATA, pet: () => pet, bubble: () => bubble });
});
app.on('second-instance', () => { if (core) core.showBubble({ view: 'help', keep: true, version: core.api.version }); });
app.on('window-all-closed', (e) => e.preventDefault());
