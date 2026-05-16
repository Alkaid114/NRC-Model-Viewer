const CONFIG_KEY        = 'nrc_mv_config'
const HIDDEN_CONFIG_KEY = 'nrc_mv_config_hidden'

// Stores FileSystemDirectoryHandle objects from showDirectoryPicker.
// Keys are arbitrary labels set by the consumer (e.g. 'configFiles').
const _dirHandles = new Map()

export class WebPlatform {
  get name() { return 'web' }

  // ── Config ────────────────────────────────────────────────────────────────

  async loadConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) } catch { return null }
  }

  async saveConfig(data) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(data))
  }

  async loadHiddenConfig() {
    try { return JSON.parse(localStorage.getItem(HIDDEN_CONFIG_KEY)) } catch { return null }
  }

  async saveHiddenConfig(data) {
    localStorage.setItem(HIDDEN_CONFIG_KEY, JSON.stringify(data))
  }

  // ── File System ───────────────────────────────────────────────────────────
  // Web file system access requires prior user directory selection.
  // These stubs return null/empty and log a warning.
  // Full implementation will use stored _dirHandles.

  async readFile(virtualPath, _encoding = 'utf-8') {
    console.warn('[WebPlatform] readFile not yet implemented:', virtualPath)
    return null
  }

  async readDir(virtualPath) {
    console.warn('[WebPlatform] readDir not yet implemented:', virtualPath)
    return []
  }

  async exists(_virtualPath) {
    return false
  }

  // ── Dialog ────────────────────────────────────────────────────────────────

  async openDirectory() {
    if (!('showDirectoryPicker' in window)) {
      console.warn('[WebPlatform] File System Access API not supported in this browser.')
      return null
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' })
      _dirHandles.set(handle.name, handle)
      // Returns the directory name; not a real path in web context.
      return handle.name
    } catch {
      return null
    }
  }

  // ── Path Utilities ────────────────────────────────────────────────────────

  joinPath(...parts) {
    return parts.filter(Boolean).join('/').replace(/\/+/g, '/')
  }
}
