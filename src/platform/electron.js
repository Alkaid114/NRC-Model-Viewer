export class ElectronPlatform {
  get name() { return 'electron' }

  // ── Config ────────────────────────────────────────────────────────────────

  loadConfig()             { return window.electronAPI.loadConfig() }
  saveConfig(data)         { return window.electronAPI.saveConfig(data) }
  loadHiddenConfig()       { return window.electronAPI.loadHiddenConfig() }
  saveHiddenConfig(data)   { return window.electronAPI.saveHiddenConfig(data) }

  // ── File System ───────────────────────────────────────────────────────────

  readFile(filePath, encoding = 'utf-8') {
    return window.electronAPI.readFile(filePath, encoding)
  }

  readDir(dirPath) {
    return window.electronAPI.readDir(dirPath)
  }

  exists(filePath) {
    return window.electronAPI.exists(filePath)
  }

  // ── Dialog ────────────────────────────────────────────────────────────────

  openDirectory() {
    return window.electronAPI.openDirectory()
  }

  openPath(targetPath) {
    return window.electronAPI.openPath?.(targetPath)
  }

  openExternal(url) {
    return window.electronAPI.openExternal?.(url)
  }

  setDevTools(enabled) {
    return window.electronAPI.setDevTools(enabled)
  }

  // ── Path Utilities ────────────────────────────────────────────────────────
  // Normalise to backslashes for Windows paths.

  joinPath(...parts) {
    return parts.filter(Boolean).join('\\').replace(/[/\\]+/g, '\\')
  }

  fileUrl(absPath) {
    return 'nrcfile:///' + encodeURI(absPath.replace(/\\/g, '/'))
  }
}
