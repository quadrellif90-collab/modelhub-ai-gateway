const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const DIR = __dirname;
const ICON = path.join(DIR, "icon.png");
const SERVER_PORT = 8787;

// In packaged mode, read/write the user's data folder. Prefer the install
// folder that actually holds the existing config/auth/prefs (so keys and
// profiles survive), otherwise fall back to a persistent user directory
// (C:\Users\<user>\.config\opencode\modelhub) creating it if missing.
if (app.isPackaged) {
  const home = process.env.USERPROFILE || app.getPath("home");
  const userDir = path.join(home, ".config", "opencode", "modelhub");
  const candidates = [
    userDir,
    path.join(home, "AppData", "Local", "Programs", "ModelHub"),
    path.dirname(process.execPath)
  ];
  for (const d of candidates) {
    if (fs.existsSync(path.join(d, "config.json")) || fs.existsSync(path.join(d, "auth.json"))) {
      process.env.MODELHUB_DIR = d;
      break;
    }
  }
  if (!process.env.MODELHUB_DIR) {
    try { fs.mkdirSync(userDir, { recursive: true }); } catch {}
    process.env.MODELHUB_DIR = userDir;
  }
}
const PREFS_PATH = path.join(process.env.MODELHUB_DIR || DIR, "prefs.json");
let prefs = {};
try { prefs = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8")) || {}; } catch {}
let CTRL_TOKEN = process.env.MODELHUB_TOKEN || "";
if (!CTRL_TOKEN) {
  try { CTRL_TOKEN = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8")).controlToken || ""; } catch {}
}

process.on("uncaughtException", (e) => {
  try {
    fs.appendFileSync(path.join(require("node:os").tmpdir(), "modelhub.log"),
      `[${new Date().toISOString()}] uncaughtException: ${(e && e.stack) || e}\n`);
  } catch {}
});
process.on("unhandledRejection", (e) => {
  try {
    fs.appendFileSync(path.join(require("node:os").tmpdir(), "modelhub.log"),
      `[${new Date().toISOString()}] unhandledRejection: ${(e && (e.stack || e.message)) || e}\n`);
  } catch {}
});

// ensure a tray icon exists
if (!fs.existsSync(ICON)) {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  fs.writeFileSync(ICON, Buffer.from(b64, "base64"));
}

let win = null;
let tray = null;
let widget = null;

function startServer() {
  try {
    const hub = require(path.join(DIR, "server.js"));
    if (typeof hub.startHub === "function") hub.startHub();
  } catch (e) {
    console.error("hub start failed:", e);
  }
}

function createWidget() {
  widget = new BrowserWindow({
    width: 360, height: 300, show: false, frame: false,
    alwaysOnTop: true, skipTaskbar: true, resizable: false,
    icon: ICON,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  widget.loadFile(path.join(DIR, "renderer", "widget.html"), CTRL_TOKEN ? { query: { t: CTRL_TOKEN } } : undefined);
  widget.on("closed", () => { widget = null; });
}

function toggleWidget() {
  if (!widget) createWidget();
  if (widget.isVisible()) { widget.hide(); return; }
  try {
    const tb = tray.getBounds();
    const { screen } = require("electron");
    const wa = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y }).workArea;
    let x = tb.x - 370;
    let y = Math.min(tb.y + tb.height + 6, wa.y + wa.height - 310);
    if (x < wa.x) x = wa.x + 8;
    widget.setPosition(x, y, false);
  } catch {}
  widget.show();
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function quitApp() {
  app.quit();
}

function setAutoStart(on) {
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: [app.getAppPath()] });
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 760, show: false,
    icon: ICON,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadFile(path.join(DIR, "renderer", "index.html"), CTRL_TOKEN ? { query: { t: CTRL_TOKEN } } : undefined);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "modelhub://widget") { toggleWidget(); return { action: "deny" }; }
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  if (!(prefs.features && prefs.features.startMinimized)) win.show();
  else win.hide();
  win.on("close", (e) => { e.preventDefault(); win.hide(); });
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip("ModelHub - aggregator locale");
  const template = [
    { label: "Apri pannello", click: () => showWindow() },
    { label: "Widget realtime", click: () => toggleWidget() },
    {
      label: "Avvio automatico a login",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (mi) => setAutoStart(mi.checked)
    },
    { type: "separator" },
    { label: "Esci (ferma server)", click: () => quitApp() }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.on("click", () => toggleWidget());
}

// single instance: avoid two servers
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
app.on("second-instance", () => showWindow());

app.whenReady().then(() => {
  try { if (!app.getLoginItemSettings().openAtLogin) setAutoStart(true); } catch {}
  startServer();
  createWindow();
  createTray();
  createWidget();
  setupAutoUpdate();
  const launchedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
  if (!launchedAtLogin) setTimeout(showWindow, 600);
});

app.on("window-all-closed", (e) => { e.preventDefault(); });
