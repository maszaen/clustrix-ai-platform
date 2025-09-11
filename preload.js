const { contextBridge, ipcRenderer } = require('electron');
function rid(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }

contextBridge.exposeInMainWorld('api', {
  on: (channel, callback) => {
    const validChannels = ['chat-update', 'stats:update', 'search:status']; 
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  sessions: {
    load: () => ipcRenderer.invoke('sessions:load'),
    save: (data) => ipcRenderer.invoke('sessions:save', data),
  },
  chat: {
    stream(messages, model='glm-4.5-flash', optionsOrCb, maybeCb){
      const id = rid();
      const isFn = typeof optionsOrCb === 'function';
      const onEvent = isFn ? optionsOrCb : (typeof maybeCb === 'function' ? maybeCb : () => {});
      const options = isFn ? {} : (optionsOrCb || {});

      const onChunk = (_e, t) => { try{ onEvent(t); }catch{} };
      const onDone  = (_e) => { cleanup(); try{ onEvent(null); }catch{} };
      const onErr   = (_e, m) => { cleanup(); try{ onEvent({error:m}); }catch{} };
      function cleanup(){
        ipcRenderer.removeAllListeners(`chat:chunk-${id}`);
        ipcRenderer.removeAllListeners(`chat:done-${id}`);
        ipcRenderer.removeAllListeners(`chat:error-${id}`);
      }
      ipcRenderer.on(`chat:chunk-${id}`, onChunk);
      ipcRenderer.once(`chat:done-${id}`, onDone);
      ipcRenderer.once(`chat:error-${id}`, onErr);

      ipcRenderer.send('chat:stream-start', {
        reqId: id, messages, model,
        provider: options.provider,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        thinkMode: options.thinkMode, // hapus kalo error ye
        webSearchEnabled: options.webSearchEnabled,
        serpApiKey: options.serpApiKey
      });
      return { cancel: () => { cleanup(); ipcRenderer.send('chat:stream-cancel', id); } };
    },
    titleSuggest: (text, model = 'glm-4.5-flash', opts = {}) => ipcRenderer.invoke('chat:title', { text, model, ...opts }),
  },
  models: {
    load: () => ipcRenderer.invoke('models:load'),
    save: (conf) => ipcRenderer.invoke('models:save', conf),
  },
  logging: {
    write: (logData) => ipcRenderer.send('log:write', logData),
    getPath: () => ipcRenderer.invoke('log:getPath'),
    clear: () => ipcRenderer.invoke('log:clear'),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  }
});