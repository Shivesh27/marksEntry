const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

let backend;
let port;
let backendError = "";

function backendCommand() {
  if (app.isPackaged) {
    // Dynamically choose .exe for Windows and raw binary for macOS
    const exeName = process.platform === "win32" ? "marks_backend.exe" : "marks_backend";
    return [path.join(process.resourcesPath, "backend", exeName), []];
  }
  
  // In development mode, fallback to 'python' on Windows and 'python3' on macOS/Linux
  const defaultPython = process.platform === "win32" ? "python" : "python3";
  return [process.env.PYTHON || defaultPython, [path.join(__dirname, "..", "backend", "marks_backend.py")]];
}

function healthCheck() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/health`, (response) => resolve(response.statusCode === 200));
    request.on("error", () => resolve(false));
    request.setTimeout(500, () => { request.destroy(); resolve(false); });
  });
}

async function waitForBackend() {
  // PyInstaller's one-file backend extracts itself on startup. On a first run
  // this can take noticeably longer than a normal Python script.
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await healthCheck()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`The Python backend did not start.${backendError ? `\n\nDetails: ${backendError}` : ""}`);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200, height: 780, minWidth: 980, minHeight: 650,
    title: "Marks Entry",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false }
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
  if (app.isPackaged) window.loadFile(path.join(__dirname, "..", "web-dist", "index.html"), { query: { port: String(port) } });
  else window.loadURL(`${devUrl}?port=${port}`);
}

ipcMain.handle("choose-workbook", async (_event, title) => {
  const result = await dialog.showOpenDialog({ title, properties: ["openFile"], filters: [{ name: "Excel workbook", extensions: ["xlsx"] }] });
  return result.canceled ? null : result.filePaths[0];
});

app.whenReady().then(async () => {
  // A per-launch port avoids clashes with a prior app instance or another local service.
  port = Math.floor(20000 + Math.random() * 20000);
  const [command, args] = backendCommand();
  backend = spawn(command, [...args, "--port", String(port)], { stdio: ["ignore", "ignore", "pipe"] });
  backend.on("error", (error) => { backendError = error.message; });
  backend.stderr.on("data", (chunk) => { backendError = String(chunk).trim().slice(-800); });
  await waitForBackend();
  createWindow();
}).catch((error) => {
  dialog.showErrorBox("Marks Entry could not start", `${error.message}\n\nPlease reopen the application.`);
  app.quit();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { if (backend) backend.kill(); });