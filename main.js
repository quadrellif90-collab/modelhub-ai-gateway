const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const DIR = __dirname;
const ICON = path.join(DIR, "icon.png");
const SERVER_PORT = 8787;

// Persistent data directory - use AppData on Windows
function getDataDir() {
  if (app.isPackaged) {
    const home = process.env.USERPROFILE || app.getPath("home");
    return path.join(home, "AppData", "Local", "ModelHub");
  }
  return DIR;
}
const DATA_DIR = getDataDir();
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

const PREFS_PATH = path.join(DATA_DIR, "prefs.json");
let prefs = {};
try { prefs = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8")) || {}; } catch {}
let CTRL_TOKEN = process.env.MODELHUB_TOKEN || "";
if (!CTRL_TOKEN) {
  try { CTRL_TOKEN = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8")).controlToken || ""; } catch {}
}

// Ensure config/auth/pricing use DATA_DIR
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const PRICING_FILE = path.join(DATA_DIR, "pricing.json");
process.env.MODELHUB_DIR = DATA_DIR;

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
let isQuitting = false;

function startServer() {
  try {
    // I moduli dell'app (server.js + server/*) stanno in __dirname (cartella
    // dell'app), NON in MODELHUB_DIR (che è la cartella dati utente).
    const hub = require(path.join(__dirname, "server.js"));
    if (typeof hub.startHub === "function") hub.startHub();
  } catch (e) {
    console.error("hub start failed:", e);
  }
}

function createWidget() {
  widget = new BrowserWindow({
    width: 360, height: 320, show: false, frame: false,
    alwaysOnTop: true, skipTaskbar: true, resizable: false,
    icon: ICON,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  widget.loadFile(path.join(DIR, "renderer", "widget.html"), CTRL_TOKEN ? { query: { t: CTRL_TOKEN } } : undefined);
  widget.on("closed", () => { widget = null; });
}

let settingsWin = null;
function createSettingsWindow() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 560, height: 720, show: true, frame: true,
    resizable: true, icon: ICON, title: "ModelHub — Impostazioni",
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  settingsWin.loadFile(path.join(DIR, "renderer", "settings.html"), CTRL_TOKEN ? { query: { t: CTRL_TOKEN } } : undefined);
  settingsWin.on("closed", () => { settingsWin = null; });
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
  isQuitting = true;
  if (widget) { widget.destroy(); widget = null; }
  if (tray) { tray.destroy(); tray = null; }
  app.quit();
}

function setAutoStart(on) {
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: [app.getAppPath()] });
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  // Auto-update disabilitato di default: l'utente aggiorna tramite installer
  // firmato (dist/ModelHub Setup X.Y.Z.exe). Il check automatico su GitHub
  // genera solo errori di rete/rate-limit non gestibili in background.
  // Riattivabile con MODELHUB_AUTO_UPDATE=1.
  if (process.env.MODELHUB_AUTO_UPDATE !== "1") return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 760, show: true,
    icon: ICON,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadFile(path.join(DIR, "renderer", "index.html"), CTRL_TOKEN ? { query: { t: CTRL_TOKEN } } : undefined);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "modelhub://widget") { toggleWidget(); return { action: "deny" }; }
    if (url === "modelhub://settings") { createSettingsWindow(); return { action: "deny" }; }
    if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { action: "deny" }; }
    // Apri file locali (settings.html, widget.html) come nuove finestre Electron
    if (/^[a-z-]+\.html/i.test(url) || url.startsWith("file://")) {
      const name = url.split("?")[0].split("#")[0].replace(/^.*\//, "");
      const w = new BrowserWindow({
        width: 560, height: 720, show: true, frame: true, resizable: true, icon: ICON,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });
      w.loadFile(path.join(DIR, "renderer", name), CTRL_TOKEN ? { query: { t: CTRL_TOKEN } } : undefined);
      return { action: "deny" };
    }
    return { action: "deny" };
  });
  // Avvio ridotto: se startMinimized è true, parte solo in tray
  if (prefs.features && prefs.features.startMinimized) win.hide();
  win.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    win.hide();
  });
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip("ModelHub - aggregator locale");
  const template = [
    { label: "Apri pannello", click: () => showWindow() },
    { label: "Impostazioni", click: () => createSettingsWindow() },
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
  // Su Windows il click (e doppio clic) apre il pannello principale
  tray.on("click", () => showWindow());
}

// single instance: avoid two servers
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
app.on("second-instance", () => showWindow());

app.whenReady().then(() => {
  try { if (!app.getLoginItemSettings().openAtLogin) setAutoStart(true); } catch {}
  const launchedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
  startServer();
  createWindow();
  createTray();
  createWidget();
  setupAutoUpdate();
});

app.on("window-all-closed", (e) => {
  if (isQuitting) return;
  e.preventDefault();
});
