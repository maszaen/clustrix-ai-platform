import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { initDatabase, getAllSessions, saveSession, deleteSession as dbDeleteSession, getMessages, addMessage, getSetting, saveSetting, getAllCustomModels, saveCustomModel, deleteCustomModel as dbDeleteCustomModel, getAllCustomProviders, saveCustomProvider, deleteCustomProvider as dbDeleteCustomProvider, getAllProviderApiKeys, saveProviderApiKey, exportAllData, importAllData } from '../database/db';
import { generateSessionId } from '../utils/ids';
import { loginWithGoogle, logout as authLogout, getStoredAuth, getLastBackupTime } from '../services/auth';
import { backupToCloud, restoreFromCloud } from '../services/backup';

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
  const [customModels, setCustomModels] = useState([]);
  const [customProviders, setCustomProviders] = useState([]);
  const [providerApiKeys, setProviderApiKeys] = useState({});
  
  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [authProvider, setAuthProvider] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [lastBackupTime, setLastBackupTime] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  
  // Ref to track latest session ID for async operations
  const latestSessionIdRef = useRef(null);

  // Initialize database and load data
  useEffect(() => {
    async function init() {
      await initDatabase();
      const [loadedSessions, loadedSettings, loadedModels, loadedProviders, loadedApiKeys] = await Promise.all([
        getAllSessions(),
        getSetting('app_settings'),
        getAllCustomModels(),
        getAllCustomProviders(),
        getAllProviderApiKeys(),
      ]);
      setSessions(loadedSessions || []);
      if (loadedSettings) setSettings({ ...DEFAULT_SETTINGS, ...loadedSettings });
      setCustomModels(loadedModels || []);
      setCustomProviders(loadedProviders || []);
      setProviderApiKeys(loadedApiKeys || {});
      
      // Load stored auth
      const storedAuth = await getStoredAuth();
      if (storedAuth) {
        setCurrentUser(storedAuth.user);
        setAuthProvider(storedAuth.provider);
        setAccessToken(storedAuth.accessToken);
      }
      
      // Load last backup time
      const backupTime = await getLastBackupTime();
      setLastBackupTime(backupTime);
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      setIsReady(true);
    }
    init();
  }, []);

  // Load messages when session changes
  useEffect(() => {
    const targetSessionId = currentSession?.id || null;
    latestSessionIdRef.current = targetSessionId; // Update ref immediately
    
    async function loadMessages() {
      if (targetSessionId) {
        const msgs = await getMessages(targetSessionId);
        // Only set messages if this is still the current session
        if (latestSessionIdRef.current === targetSessionId) {
          setMessages(msgs || []);
        }
      } else {
        if (latestSessionIdRef.current === null) {
          setMessages([]);
        }
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

  // Add custom model
  const addCustomModel = useCallback(async (model) => {
    const newModel = {
      id: `model-${Date.now()}`,
      ...model,
      is_default: false,
      created_at: Date.now(),
    };
    await saveCustomModel(newModel);
    setCustomModels(prev => [newModel, ...prev]);
    return newModel;
  }, []);

  // Update custom model
  const updateCustomModel = useCallback(async (id, updates) => {
    const model = customModels.find(m => m.id === id);
    if (!model || model.is_default) return;
    const updated = { ...model, ...updates };
    await saveCustomModel(updated);
    setCustomModels(prev => prev.map(m => m.id === id ? updated : m));
  }, [customModels]);

  // Delete custom model
  const deleteCustomModel = useCallback(async (id) => {
    const model = customModels.find(m => m.id === id);
    if (!model || model.is_default) return;
    await dbDeleteCustomModel(id);
    setCustomModels(prev => prev.filter(m => m.id !== id));
  }, [customModels]);

  // Add custom provider
  const addCustomProvider = useCallback(async (provider) => {
    const newProvider = {
      id: `provider-${Date.now()}`,
      ...provider,
      is_default: false,
      created_at: Date.now(),
    };
    await saveCustomProvider(newProvider);
    setCustomProviders(prev => [newProvider, ...prev]);
    return newProvider;
  }, []);

  // Update custom provider
  const updateCustomProvider = useCallback(async (id, updates) => {
    const provider = customProviders.find(p => p.id === id);
    if (!provider || provider.is_default) return;
    const updated = { ...provider, ...updates };
    await saveCustomProvider(updated);
    setCustomProviders(prev => prev.map(p => p.id === id ? updated : p));
  }, [customProviders]);

  // Delete custom provider
  const deleteCustomProvider = useCallback(async (id) => {
    const provider = customProviders.find(p => p.id === id);
    if (!provider || provider.is_default) return;
    await dbDeleteCustomProvider(id);
    setCustomProviders(prev => prev.filter(p => p.id !== id));
  }, [customProviders]);

  // Update provider API key
  const updateProviderApiKey = useCallback(async (providerId, apiKey) => {
    await saveProviderApiKey(providerId, apiKey);
    setProviderApiKeys(prev => ({ ...prev, [providerId]: apiKey }));
  }, []);

  // ========================================
  // Auth Functions
  // ========================================
  
  // Login with Google
  const handleLoginGoogle = useCallback(async () => {
    const result = await loginWithGoogle();
    if (result.success) {
      setCurrentUser(result.user);
      setAuthProvider('google');
      setAccessToken(result.accessToken);
    }
    return result;
  }, []);
  
  // Logout
  const handleLogout = useCallback(async () => {
    const result = await authLogout();
    if (result.success) {
      setCurrentUser(null);
      setAuthProvider(null);
      setAccessToken(null);
    }
    return result;
  }, []);
  
  // Backup to cloud (auto-refreshes token)
  const handleBackupNow = useCallback(async () => {
    if (!currentUser) {
      return { success: false, error: 'Not logged in' };
    }
    
    setIsBackingUp(true);
    try {
      // Export all data
      const backupData = await exportAllData();
      
      // Backup to cloud (token refresh handled automatically)
      const result = await backupToCloud(backupData);
      
      if (result.success) {
        setLastBackupTime(Date.now());
      } else if (result.needsReauth) {
        // Token refresh failed, user needs to login again
        setCurrentUser(null);
        setAuthProvider(null);
        setAccessToken(null);
      }
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsBackingUp(false);
    }
  }, [currentUser]);
  
  // Restore from cloud (auto-refreshes token)
  const handleRestoreBackup = useCallback(async () => {
    if (!currentUser) {
      return { success: false, error: 'Not logged in' };
    }
    
    try {
      const result = await restoreFromCloud();
      
      if (result.needsReauth) {
        // Token refresh failed, user needs to login again
        setCurrentUser(null);
        setAuthProvider(null);
        setAccessToken(null);
        return result;
      }
      
      if (result.success && result.data) {
        // Import data
        await importAllData(result.data);
        
        // Reload all data
        const [loadedSessions, loadedSettings, loadedModels] = await Promise.all([
          getAllSessions(),
          getSetting('app_settings'),
          getAllCustomModels(),
        ]);
        setSessions(loadedSessions || []);
        if (loadedSettings) setSettings({ ...DEFAULT_SETTINGS, ...loadedSettings });
        setCustomModels(loadedModels || []);
      }
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [currentUser]);

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
    customModels,
    addCustomModel,
    updateCustomModel,
    deleteCustomModel,
    customProviders,
    addCustomProvider,
    updateCustomProvider,
    deleteCustomProvider,
    providerApiKeys,
    updateProviderApiKey,
    // Auth
    currentUser,
    authProvider,
    isLoggedIn: !!currentUser,
    lastBackupTime,
    isBackingUp,
    loginWithGoogle: handleLoginGoogle,
    logout: handleLogout,
    backupNow: handleBackupNow,
    restoreBackup: handleRestoreBackup,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
