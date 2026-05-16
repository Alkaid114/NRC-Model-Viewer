const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs').promises

const isDev = process.argv.includes('--dev')

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function getHiddenConfigPath() {
  return path.join(app.getPath('userData'), 'config_hidden.json')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0d1117',
    show: false,
  })

  win.once('ready-to-show', () => win.show())

  if (isDev) {
    // Electron starts before Vite is fully ready; retry a few times
    const tryLoad = (retries) => {
      win.loadURL('http://localhost:5173').catch(() => {
        if (retries > 0) setTimeout(() => tryLoad(retries - 1), 500)
      })
    }
    tryLoad(10)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Config IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('config:load', async () => {
  try {
    const data = await fs.readFile(getConfigPath(), 'utf-8')
    return JSON.parse(data)
  } catch { return null }
})

ipcMain.handle('config:save', async (_, data) => {
  const p = getConfigPath()
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('config:loadHidden', async () => {
  try {
    const data = await fs.readFile(getHiddenConfigPath(), 'utf-8')
    return JSON.parse(data)
  } catch { return null }
})

ipcMain.handle('config:saveHidden', async (_, data) => {
  const p = getHiddenConfigPath()
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
})

// ── File System IPC ───────────────────────────────────────────────────────────

ipcMain.handle('fs:readFile', async (_, filePath, encoding) => {
  return encoding ? fs.readFile(filePath, encoding) : fs.readFile(filePath)
})

ipcMain.handle('fs:readDir', async (_, dirPath) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  return entries.map(e => ({ name: e.name, isDir: e.isDirectory() }))
})

ipcMain.handle('fs:exists', async (_, filePath) => {
  try { await fs.access(filePath); return true } catch { return false }
})

// ── Dialog IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openDirectory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})
