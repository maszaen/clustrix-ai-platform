const { contextBridge, ipcRenderer, shell } = require('electron');
function rid(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }

contextBridge.exposeInMainWorld('api', {
  on: (channel, callback) => {
    const validChannels = ['chat-update', 'stats:update', 'search:status', 'chat:think-']; 
    if (validChannels.some(valid => channel.startsWith(valid))) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  // OAuth helper
  sendEmail: (email) => {
    ipcRenderer.send('oauth:submit-email', email);
  },
  sessions: {
    load: () => ipcRenderer.invoke('sessions:load'),
    save: (data) => ipcRenderer.invoke('sessions:save', data),
  },
  artifacts: {
    load: () => ipcRenderer.invoke('artifacts:load'),
    save: (artifacts) => ipcRenderer.invoke('artifacts:save', artifacts),
  },
  projects: {
    load: () => ipcRenderer.invoke('projects:load'),
    save: (projects) => ipcRenderer.invoke('projects:save', projects),
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
        sessionId: options.sessionId,
        aiMessageIndex: options.aiMessageIndex,
        session: options.session,
        provider: options.provider,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        thinkMode: options.thinkMode,
        webSearchEnabled: options.webSearchEnabled,
        language: options.language,
        searchApiConfig: options.searchApiConfig
      });
      return { cancel: () => { cleanup(); ipcRenderer.send('chat:stream-cancel', id); } };
    },
    titleSuggest: (text, model = 'glm-4.5-flash', opts = {}) => ipcRenderer.invoke('chat:title', { text, model, ...opts }),
  },
  files: {
    openDialogAndRead: () => ipcRenderer.invoke('files:open-dialog'),
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
  },
  shell: {
    openExternal: (url) => shell.openExternal(url),
  },
  sync: {
    getConfig: () => ipcRenderer.invoke('sync:getConfig'),
    saveConfig: (config) => ipcRenderer.invoke('sync:saveConfig', config),
    switchMode: (params) => ipcRenderer.invoke('sync:switchMode', params),
    listCloudUsers: () => ipcRenderer.invoke('sync:listCloudUsers'),
    logout: (params) => ipcRenderer.invoke('sync:logout', params),
    syncNow: () => ipcRenderer.invoke('sync:syncNow'),
    backupNow: () => ipcRenderer.invoke('sync:backupNow'),
    startOAuth: () => ipcRenderer.invoke('sync:startOAuth'),
    exchangeAuthCode: (code) => ipcRenderer.invoke('sync:exchangeAuthCode', code),
  },
  app: {
    restart: () => ipcRenderer.invoke('app:restart'),
  }
});
