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

  // Clear current session (go to welcome page)
  const clearCurrentSession = useCallback(() => {
    setCurrentSession(null);
    setMessages([]);
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

  // Update session (accepts optional targetSession for welcome screen flow)
  const updateSession = useCallback(async (updates, targetSession = null) => {
    const session = targetSession || currentSession;
    if (!session) return;
    const updated = { ...session, ...updates, updated_at: Date.now() };
    await saveSession(updated);
    setCurrentSession(updated);
    setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
  }, [currentSession]);

  // Add message to current session (or specified session for welcome screen flow)
  const appendMessage = useCallback(async (role, content, metadata = {}, targetSession = null) => {
    const session = targetSession || currentSession;
    if (!session) return;
    
    // For new sessions, we need to get current message count from state
    const messageIndex = targetSession ? 0 : messages.length;
    await addMessage(session.id, role, content, metadata, targetSession ? metadata._messageIndex ?? messageIndex : messageIndex);
    const newMsg = { role, content, message_index: targetSession ? metadata._messageIndex ?? messageIndex : messageIndex, ...metadata };
    setMessages(prev => [...prev, newMsg]);
    
    // Update session timestamp
    await saveSession({ ...session, updated_at: Date.now() });
    setSessions(prev => {
      const updated = prev.map(s => 
        s.id === session.id ? { ...s, updated_at: Date.now() } : s
      );
      return updated.sort((a, b) => b.updated_at - a.updated_at);
    });
  }, [currentSession, messages]);

  // Toggle favorite session
  const toggleFavorite = useCallback(async (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    
    const updated = { ...session, is_favorite: !session.is_favorite, updated_at: Date.now() };
    await saveSession(updated);
    
    if (currentSession?.id === sessionId) {
      setCurrentSession(updated);
    }
    
    setSessions(prev => {
      const newSessions = prev.map(s => s.id === sessionId ? updated : s);
      return newSessions.sort((a, b) => b.updated_at - a.updated_at);
    });
  }, [sessions, currentSession]);

  // Rename session
  const renameSession = useCallback(async (sessionId, newName) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    
    const updated = { ...session, name: newName, updated_at: Date.now() };
    await saveSession(updated);
    
    if (currentSession?.id === sessionId) {
      setCurrentSession(updated);
    }
    
    setSessions(prev => {
      const newSessions = prev.map(s => s.id === sessionId ? updated : s);
      return newSessions.sort((a, b) => b.updated_at - a.updated_at);
    });
  }, [sessions, currentSession]);

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
    clearCurrentSession,
    deleteSession,
    updateSession,
    appendMessage,
    updateSettings,
    toggleFavorite,
    renameSession,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
