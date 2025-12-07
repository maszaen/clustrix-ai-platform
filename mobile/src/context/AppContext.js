import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { initDatabase, getAllSessions, saveSession, deleteSession as dbDeleteSession, getMessages, addMessage, getSetting, saveSetting } from '../database/db';
import { generateSessionId } from '../utils/ids';

const AppContext = createContext(null);

const DEFAULT_SETTINGS = {
  provider: 'openrouter',
  model: 'openai/gpt-4o-mini',
  baseUrl: '',
  apiKey: '',
  thinkMode: false,
};

export function AppProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isStreaming, setIsStreaming] = useState(false);

  // Initialize database and load data
  useEffect(() => {
    async function init() {
      await initDatabase();
      const [loadedSessions, loadedSettings] = await Promise.all([
        getAllSessions(),
        getSetting('app_settings'),
      ]);
      setSessions(loadedSessions || []);
      if (loadedSettings) setSettings({ ...DEFAULT_SETTINGS, ...loadedSettings });
      setIsReady(true);
    }
    init();
  }, []);

  // Load messages when session changes
  useEffect(() => {
    async function loadMessages() {
      if (currentSession) {
        const msgs = await getMessages(currentSession.id);
        setMessages(msgs || []);
      } else {
        setMessages([]);
      }
    }
    loadMessages();
  }, [currentSession?.id]);

  // Create new session
  const createSession = useCallback(async (name = 'New Chat') => {
    const session = {
      id: generateSessionId(),
      name,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await saveSession(session);
    setSessions(prev => [session, ...prev]);
    setCurrentSession(session);
    setMessages([]);
    return session;
  }, []);

  // Select session
  const selectSession = useCallback((session) => {
    setCurrentSession(session);
  }, []);

  // Delete session
  const deleteSession = useCallback(async (id) => {
    await dbDeleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSession?.id === id) {
      setCurrentSession(null);
      setMessages([]);
    }
  }, [currentSession]);

  // Update session
  const updateSession = useCallback(async (updates) => {
    if (!currentSession) return;
    const updated = { ...currentSession, ...updates, updated_at: Date.now() };
    await saveSession(updated);
    setCurrentSession(updated);
    setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
  }, [currentSession]);

  // Add message to current session
  const appendMessage = useCallback(async (role, content, metadata = {}) => {
    if (!currentSession) return;
    const messageIndex = messages.length;
    await addMessage(currentSession.id, role, content, metadata, messageIndex);
    const newMsg = { role, content, message_index: messageIndex, ...metadata };
    setMessages(prev => [...prev, newMsg]);
    
    // Update session timestamp
    await saveSession({ ...currentSession, updated_at: Date.now() });
    setSessions(prev => {
      const updated = prev.map(s => 
        s.id === currentSession.id ? { ...s, updated_at: Date.now() } : s
      );
      return updated.sort((a, b) => b.updated_at - a.updated_at);
    });
  }, [currentSession, messages]);

  // Update settings
  const updateSettings = useCallback(async (newSettings) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    await saveSetting('app_settings', merged);
  }, [settings]);

  const value = {
    isReady,
    sessions,
    currentSession,
    messages,
    settings,
    isStreaming,
    setIsStreaming,
    setMessages,
    createSession,
    selectSession,
    deleteSession,
    updateSession,
    appendMessage,
    updateSettings,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
