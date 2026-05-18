const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  loadConfig:       ()              => ipcRenderer.invoke('config:load'),
  saveConfig:       (data)          => ipcRenderer.invoke('config:save', data),
  loadHiddenConfig: ()              => ipcRenderer.invoke('config:loadHidden'),
  saveHiddenConfig: (data)          => ipcRenderer.invoke('config:saveHidden', data),
  readFile:         (p, enc)        => ipcRenderer.invoke('fs:readFile', p, enc),
  readDir:          (p)             => ipcRenderer.invoke('fs:readDir', p),
  exists:           (p)             => ipcRenderer.invoke('fs:exists', p),
  openDirectory:    ()              => ipcRenderer.invoke('dialog:openDirectory'),
  openPath:         (p)             => ipcRenderer.invoke('shell:openPath', p),
  openExternal:     (url)           => ipcRenderer.invoke('shell:openExternal', url),
  setDevTools:      (enabled)       => ipcRenderer.invoke('devtools:set', enabled),
})
