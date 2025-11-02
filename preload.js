const { contextBridge, ipcRenderer, shell } = require('electron');

// Simple log function for preload (sends to main process)
function log(tag, level, fn, msg, data) {
  ipcRenderer.send('log:write', {
    context: tag,
    func: fn,
    message: msg,
    details: data
  });
}

// Inline thinking pattern parser (to avoid module loading issues in preload)
function createThinkingParserState() {
  return {
    partialTag: '',
    insideThinkingBlock: false, // Track if we're inside an unclosed thinking tag
    currentBlockType: null,      // Which tag type: 'think', 'thinking', 'reasoning', etc.
    hasSeenContent: false        // Track if we've seen any non-thinking content (disables parsing)
  };
}

function parseThinkingPatterns(chunkText, state = {}) {
  if (!chunkText || typeof chunkText !== 'string') {
    return {
      thinkingText: '',
      cleanedContent: chunkText || '',
      insideThinkingBlock: state.insideThinkingBlock || false,
      currentBlockType: state.currentBlockType || null,
      hasSeenContent: state.hasSeenContent || false
    };
  }

  const fullText = (state.partialTag || '') + chunkText;
  let thinkingText = '';
  let cleanedContent = '';
  let insideThinkingBlock = state.insideThinkingBlock || false;
  let currentBlockType = state.currentBlockType || null;
  let hasSeenContent = state.hasSeenContent || false;
  let partialTag = '';

  let position = 0;

  while (position < fullText.length) {
    // If we're INSIDE a thinking block, search for closing tag ANYWHERE
    if (insideThinkingBlock) {
      // Define closing patterns based on block type
      let closeRegex;
      if (currentBlockType === 'think') {
        closeRegex = /<\/think>/i;
      } else if (currentBlockType === 'thinking') {
        closeRegex = /<\/thinking>/i;
      } else if (currentBlockType === 'reasoning') {
        closeRegex = /<\/reasoning>/i;
      } else if (currentBlockType === 'reasoning-prefix') {
        closeRegex = /\)\*/;
      } else {
        // Invalid block type - exit thinking mode
        insideThinkingBlock = false;
        currentBlockType = null;
        continue;
      }

      // Search for closing tag from current position
      const remainingText = fullText.substring(position);
      const match = remainingText.match(closeRegex);
      
      if (match && match.index !== undefined) {
        // Found closing tag - send everything before it to thinking
        thinkingText += remainingText.substring(0, match.index);
        position += match.index + match[0].length;
        insideThinkingBlock = false;
        currentBlockType = null;
        continue;
      } else {
        // No closing tag found - send ALL remaining to thinking
        thinkingText += remainingText;
        position = fullText.length;
        break;
      }
    }

    // Not inside block - check if we're starting one (ONLY if we haven't seen content yet)
    if (!hasSeenContent) {
      const remainingText = fullText.substring(position);
      const trimmed = remainingText.trimStart();
      const whitespaceLen = remainingText.length - trimmed.length;

      const openPatterns = [
        { regex: /^<thinking>/i, type: 'thinking', tagLen: 10 },
        { regex: /^<think>/i, type: 'think', tagLen: 7 },
        { regex: /^<reasoning>/i, type: 'reasoning', tagLen: 11 },
        { regex: /^\*\(reasoning:\s*/i, type: 'reasoning-prefix', tagLen: null } // variable length
      ];

      let foundOpening = false;
      for (const { regex, type, tagLen } of openPatterns) {
        if (regex.test(trimmed)) {
          // Opening tag found - enter thinking mode
          insideThinkingBlock = true;
          currentBlockType = type;
          
          // Calculate tag length if not fixed
          let actualTagLen = tagLen;
          if (tagLen === null) {
            const match = trimmed.match(regex);
            actualTagLen = match ? match[0].length : 0;
          }
          
          position += whitespaceLen + actualTagLen;
          foundOpening = true;
          break;
        }
      }

      if (foundOpening) continue;

      // Check for incomplete opening tags at the end
      const incompletePatterns = [
        /^<thinking[^>]*$/i,
        /^<think[^>]*$/i,
        /^<reasoning[^>]*$/i,
        /^\*\(reasoning:[^)]*$/i
      ];

      let foundIncomplete = false;
      for (const pattern of incompletePatterns) {
        if (pattern.test(trimmed)) {
          // Incomplete tag - save for next chunk
          partialTag = trimmed;
          position = fullText.length;
          foundIncomplete = true;
          break;
        }
      }

      if (foundIncomplete) break;
    }

    // Not a thinking tag - send remaining to cleaned content
    if (position < fullText.length) {
      hasSeenContent = true;
      cleanedContent += fullText.substring(position);
      position = fullText.length;
    }
  }

  return {
    thinkingText: thinkingText,
    cleanedContent: cleanedContent,
    insideThinkingBlock: insideThinkingBlock,
    currentBlockType: currentBlockType,
    hasSeenContent: hasSeenContent,
    partialTag: partialTag
  };
}

function rid(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }

contextBridge.exposeInMainWorld('api', {
  // Expose parser for testing
  _testParser: {
    parse: parseThinkingPatterns,
    createState: createThinkingParserState
  },
  on: (channel, callback) => {
    const validChannels = ['chat-update', 'stats:update', 'search:status', 'chat:think-', 'monitoring:update', 'parser-log'];
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
  htmlPreview: {
    create: (htmlContent) => ipcRenderer.invoke('html-preview:create', htmlContent),
    delete: (previewId) => ipcRenderer.invoke('html-preview:delete', previewId),
  },
  chat: {
    stream(messages, model='glm-4.5-flash', optionsOrCb, maybeCb){
      const id = rid();
      const isFn = typeof optionsOrCb === 'function';
      const onEvent = isFn ? optionsOrCb : (typeof maybeCb === 'function' ? maybeCb : () => {});
      const options = isFn ? {} : (optionsOrCb || {});

      // Create parser state for this streaming session
      const parserState = createThinkingParserState();

      let chunkCounter = 0;
      const onChunk = (_e, t) => {
        try {
          chunkCounter++;
          log('PARSER', 0, 'onChunk', `Chunk #${chunkCounter}`, { type: typeof t, value: typeof t === 'string' ? t.substring(0, 100) : t });

          // If chunk is an object with 'think' property, it's already thinking content from backend
          if (typeof t === 'object' && t !== null && 'think' in t) {
            log('PARSER', 0, 'onChunk', 'Already thinking object, pass through');
            onEvent(t);
            return;
          }

          // Parse the chunk for thinking patterns (REALTIME)
          const parsed = parseThinkingPatterns(t, parserState);
          log('PARSER', 0, 'onChunk', 'Parsed', {
            thinkLen: parsed.thinkingText.length,
            contentLen: parsed.cleanedContent.length,
            insideBlock: parsed.insideThinkingBlock,
            blockType: parsed.currentBlockType
          });

          // Send thinking text if found (REALTIME - immediately stream to thinking section)
          if (parsed.thinkingText) {
            log('PARSER', 0, 'onChunk', 'Sending thinking REALTIME', { length: parsed.thinkingText.length });
            onEvent({ think: parsed.thinkingText });
          }

          // Send cleaned content (only sent when NOT inside thinking block)
          if (parsed.cleanedContent) {
            log('PARSER', 0, 'onChunk', 'Sending content', { length: parsed.cleanedContent.length });
            onEvent(parsed.cleanedContent);
          }

          // Update parser state for next chunk
          parserState.partialTag = parsed.partialTag || '';
          parserState.insideThinkingBlock = parsed.insideThinkingBlock;
          parserState.currentBlockType = parsed.currentBlockType;
          parserState.hasSeenContent = parsed.hasSeenContent;
        } catch (err) {
          log('PARSER', 3, 'onChunk', 'ERROR', { error: err.message });
          // Fallback: send chunk as-is
          onEvent(t);
        }
      };

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
    recordActionHistory: (type, status) => ipcRenderer.invoke('sync:recordActionHistory', { type, status }),
    getActionHistory: () => ipcRenderer.invoke('sync:getActionHistory'),
    resolveConflicts: (resolutions) => ipcRenderer.invoke('sync:resolveConflicts', resolutions),
  },
  app: {
    restart: () => ipcRenderer.invoke('app:restart'),
    getProfilePhoto: () => ipcRenderer.invoke('app:getProfilePhoto'),
    getDefaultProfilePhoto: () => ipcRenderer.invoke('app:getDefaultProfilePhoto'),
  },
  monitoring: {
    getMetrics: () => ipcRenderer.invoke('monitoring:getMetrics'),
    start: () => ipcRenderer.invoke('monitoring:start'),
    stop: () => ipcRenderer.invoke('monitoring:stop'),
    onUpdate: (callback) => {
      ipcRenderer.on('monitoring:update', (event, metrics) => callback(metrics));
    },
    removeUpdateListener: () => {
      ipcRenderer.removeAllListeners('monitoring:update');
    }
  }
});