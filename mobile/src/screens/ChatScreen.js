import { useRef, useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, Platform, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '../context/AppContext';
import { streamChat, generateTitle } from '../services/api';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';

const COLORS = {
  bg: '#1b1c1d',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
};

export default function ChatScreen() {
  const { 
    currentSession, 
    messages, 
    settings, 
    isStreaming, 
    setIsStreaming,
    createSession, 
    appendMessage,
    updateSession,
  } = useApp();
  
  const flatListRef = useRef(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [newMessageId, setNewMessageId] = useState(null);
  const lastHapticTime = useRef(0);
  const isInitialLoad = useRef(true);

  // Initial load - scroll to end without animation
  useEffect(() => {
    if (messages.length > 0 && isInitialLoad.current) {
      isInitialLoad.current = false;
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 50);
    }
  }, [messages]);

  // Reset initial load flag when session changes
  useEffect(() => {
    isInitialLoad.current = true;
  }, [currentSession?.id]);

  // Auto-scroll during streaming - animated, to actual end
  useEffect(() => {
    if (streamingContent && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [streamingContent]);

  const triggerHaptic = () => {
    const now = Date.now();
    if (now - lastHapticTime.current > 150) {
      lastHapticTime.current = now;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const handleSend = async (text) => {
    let session = currentSession;
    
    if (!session) {
      session = await createSession('New Chat');
    }

    const newMsgKey = `msg-${messages.length}`;
    setNewMessageId(newMsgKey);
    
    await appendMessage('user', text, {});
    
    // Scroll after user message
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
    
    setTimeout(() => setNewMessageId(null), 500);
    
    const apiMessages = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text }
    ];

    setIsStreaming(true);
    setStreamingContent('');
    setThinkingContent('');

    let fullContent = '';
    let fullThinking = '';

    await streamChat({
      messages: apiMessages,
      model: settings.model,
      provider: settings.provider,
      baseUrl: settings.baseUrl || undefined,
      apiKey: settings.apiKey,
      onChunk: (chunk) => {
        fullContent += chunk;
        setStreamingContent(fullContent);
        triggerHaptic();
      },
      onThink: (think) => {
        fullThinking = think;
        setThinkingContent(think);
      },
      onDone: async () => {
        setIsStreaming(false);
        setStreamingContent('');
        
        const content = fullThinking 
          ? `<thinking>${fullThinking}</thinking>\n\n${fullContent}`
          : fullContent;
        
        await appendMessage('assistant', content, {
          model: settings.model,
          provider: settings.provider,
          thinkContent: fullThinking || null,
        });

        if (messages.length === 0) {
          const title = await generateTitle(text, settings.model, settings.provider, settings.baseUrl, settings.apiKey);
          await updateSession({ name: title });
        }
      },
      onError: async (error) => {
        setIsStreaming(false);
        setStreamingContent('');
        await appendMessage('assistant', `Error: ${error}`, { error: true });
      },
    });
  };

  const handleStop = () => {
    setIsStreaming(false);
    setStreamingContent('');
  };

  const renderMessage = ({ item }) => (
    <ChatMessage 
      message={item} 
      isUser={item.role === 'user'} 
      isNew={item._key === newMessageId}
    />
  );

  const displayMessages = messages.map((m, idx) => ({
    ...m,
    _key: m.id || `msg-${idx}-${m.message_index || idx}`,
  }));
  
  if (streamingContent || isStreaming) {
    displayMessages.push({
      _key: 'streaming-response',
      role: 'assistant',
      content: thinkingContent 
        ? `<thinking>${thinkingContent}</thinking>\n\n${streamingContent}`
        : streamingContent || '...',
      isStreaming: true,
    });
  }

  return (
    <View style={styles.container}>
      {!currentSession && displayMessages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Clustrix</Text>
          <Text style={styles.emptySubtitle}>Start a conversation</Text>
        </View>
      ) : displayMessages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptySubtitle}>Send a message to begin</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          keyExtractor={(item) => item._key}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          onContentSizeChange={() => {
            if (isStreaming) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
        />
      )}
      
      <ChatInput onSend={handleSend} isStreaming={isStreaming} onStop={handleStop} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  messageList: {
    paddingVertical: 12,
    paddingBottom: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    color: COLORS.fg,
    fontSize: 32,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: COLORS.fgMuted,
    fontSize: 16,
    marginTop: 8,
  },
});
