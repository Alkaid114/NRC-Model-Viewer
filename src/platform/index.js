import { WebPlatform }      from './web.js'
import { ElectronPlatform } from './electron.js'

/**
 * Unified platform singleton.
 * Use `platform.name` to branch on 'web' vs 'electron' when necessary.
 */
export const platform = window.electronAPI
  ? new ElectronPlatform()
  : new WebPlatform()
