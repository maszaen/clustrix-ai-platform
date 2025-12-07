import { useRef, useEffect, useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, Text, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '../context/AppContext';
import { streamChat, generateTitle } from '../services/api';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { LinearGradient } from 'expo-linear-gradient';

const COLORS = {
  bg: '#000000ff',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  skeleton: '#232425'
};

export default function ChatScreen({ topInset = 0, bottomInset = 0 }) {
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
  const chatInputRef = useRef(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [newMessageId, setNewMessageId] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [visibleCount, setVisibleCount] = useState(12); // Start with last 12 messages
  const [loadingMore, setLoadingMore] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const lastHapticTime = useRef(0);
  const isInitialLoad = useRef(true);
  const skeletonOpacity = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for skeleton breathing effect
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Keyboard listeners
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardVisible]);

  const contentHeight = useRef(0);
  const layoutHeight = useRef(0);
  const hasScrolledInitial = useRef(false);
  const initialScrollDone = useRef(false);

  // Initial load - scroll to position where last user message is at top + 60
  useEffect(() => {
    if (messages.length > 0 && isInitialLoad.current) {
      isInitialLoad.current = false;
      hasScrolledInitial.current = false;
    }
  }, [messages]);

  // Handle scroll to index failure (for dynamic height items)
  const onScrollToIndexFailed = useCallback((info) => {
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    }, 100);
  }, []);

  // Reset on session change - show skeleton overlay
  useEffect(() => {
    isInitialLoad.current = true;
    hasScrolledInitial.current = false;
    initialScrollDone.current = false;
    setVisibleCount(12);
    // Always show skeleton when switching to session with messages
    setShowSkeleton(true);
    skeletonOpacity.setValue(1);
  }, [currentSession?.id]);

  // Scroll during streaming
  useEffect(() => {
    if (streamingContent) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [streamingContent]);

  const triggerHaptic = () => {
    const now = Date.now();
    if (now - lastHapticTime.current > 150) {
      lastHapticTime.current = now;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const sessionRef = useRef(currentSession);
  
  // Keep sessionRef in sync
  useEffect(() => {
    sessionRef.current = currentSession;
  }, [currentSession]);

  const handleSend = async (text) => {
    // Disable skeleton for new messages
    hasScrolledInitial.current = true;
    setShowSkeleton(false);
    
    let session = sessionRef.current;
    if (!session) {
      session = await createSession('New Chat');
      sessionRef.current = session;
    }

    const newMsgKey = `msg-${messages.length}`;
    setNewMessageId(newMsgKey);
    await appendMessage('user', text, {});
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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
        // Keep streaming content visible while saving
        const content = fullThinking ? `<thinking>${fullThinking}</thinking>\n\n${fullContent}` : fullContent;
        await appendMessage('assistant', content, {
          model: settings.model,
          provider: settings.provider,
          thinkContent: fullThinking || null,
        });
        // Clear streaming AFTER message is saved
        setIsStreaming(false);
        setStreamingContent('');
        setThinkingContent('');
        
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
    <ChatMessage message={item} isUser={item.role === 'user'} isNew={item._key === newMessageId} />
  );

  // Lazy load - only show last N messages
  const allMessages = messages.map((m, idx) => ({
    ...m,
    _key: m.id || `msg-${idx}-${m.message_index || idx}`,
  }));
  
  const startIndex = Math.max(0, allMessages.length - visibleCount);
  const displayMessages = allMessages.slice(startIndex);
  const hasMoreMessages = startIndex > 0;
  
  if (streamingContent || isStreaming) {
    displayMessages.push({
      _key: 'streaming-response',
      role: 'assistant',
      content: thinkingContent ? `<thinking>${thinkingContent}</thinking>\n\n${streamingContent}` : streamingContent || '...',
      isStreaming: true,
    });
  }

  // Load more messages when scroll to top
  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMoreMessages) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 12, allMessages.length));
      setLoadingMore(false);
    }, 100);
  }, [loadingMore, hasMoreMessages, allMessages.length]);

  // Header component for load more
  const ListHeader = useCallback(() => {
    if (!hasMoreMessages) return null;
    return (
      <TouchableWithoutFeedback onPress={handleLoadMore}>
        <View style={styles.loadMoreContainer}>
          {loadingMore ? (
            <ActivityIndicator size="small" color={COLORS.fgMuted} />
          ) : (
            <Text style={styles.loadMoreText}>Load earlier messages</Text>
          )}
        </View>
      </TouchableWithoutFeedback>
    );
  }, [hasMoreMessages, loadingMore, handleLoadMore]);

  // Calculate input container bottom padding
  const inputPaddingBottom = keyboardVisible 
    ? (Platform.OS === 'ios' ? 8 : 8)
    : (bottomInset > 0 ? bottomInset : 16);

  return (
    <View style={styles.container}>
      {!currentSession && displayMessages.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.emptyState, { paddingTop: topInset, paddingBottom: Platform.OS === 'android' ? keyboardHeight + 65 : 75 }]}>
            <Text style={styles.emptyTitle}>Clustrix</Text>
            <Text style={styles.emptySubtitle}>Start a conversation</Text>
          </View>
        </TouchableWithoutFeedback>
      ) : displayMessages.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.emptyState, { paddingTop: topInset, paddingBottom: Platform.OS === 'android' ? keyboardHeight + 65 : 75 }]}>
            <Text style={styles.emptySubtitle}>Send a message to begin</Text>
          </View>
        </TouchableWithoutFeedback>
      ) : (
        <>
        {showSkeleton && (
          <Animated.View style={[styles.skeletonContainer, { opacity: skeletonOpacity, paddingTop: topInset + 70 }]}>
            <Animated.View style={[styles.skeletonUser, { opacity: pulseAnim }]} />
            <Animated.View style={{ opacity: pulseAnim }}>
              <LinearGradient
                colors={[COLORS.skeleton, COLORS.skeleton, 'transparent']}
                locations={[0, 0.3, 1]}
                style={[styles.skeletonAi, { height: 400 }]}
                pointerEvents="none"
              />
            </Animated.View>
          </Animated.View>
        )}
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          keyExtractor={(item) => item._key}
          renderItem={renderMessage}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={[styles.messageList, { paddingTop: topInset + 56, paddingBottom: Platform.OS === 'android' ? keyboardHeight + 65 : 75 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          onScrollToIndexFailed={onScrollToIndexFailed}
          onLayout={(e) => { layoutHeight.current = e.nativeEvent.layout.height; }}
          onContentSizeChange={(_, h) => {
            contentHeight.current = h;
            
            // Initial scroll ONLY ONCE on session load - find last user message
            if (!hasScrolledInitial.current && !initialScrollDone.current && h > 0 && layoutHeight.current > 0 && displayMessages.length > 0 && !isStreaming) {
              initialScrollDone.current = true;
              hasScrolledInitial.current = true;
              
              // Find last user message index
              let lastUserIdx = -1;
              for (let i = displayMessages.length - 1; i >= 0; i--) {
                if (displayMessages[i].role === 'user') {
                  lastUserIdx = i;
                  break;
                }
              }
              
              if (lastUserIdx >= 0) {
                setTimeout(() => {
                  flatListRef.current?.scrollToIndex({
                    index: lastUserIdx,
                    animated: false,
                    viewPosition: 0,
                    viewOffset: 100,
                  });
                }, 50);
              }
              // Hide skeleton after minimum 800ms
              setTimeout(() => {
                Animated.timing(skeletonOpacity, {
                  toValue: 0,
                  duration: 300,
                  useNativeDriver: true,
                }).start(() => setShowSkeleton(false));
              }, 800);
              return;
            }
            
            // During streaming - scroll to end
            if (isStreaming && streamingContent) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
        />
        </>
      )}
      <View style={[styles.inputContainer, {
        marginBottom: Platform.OS === 'android' ? keyboardHeight : 10,
      }]}>
        <View style={[styles.inputContainer2
         ]}>
          <ChatInput ref={chatInputRef} onSend={handleSend} isStreaming={isStreaming} onStop={handleStop} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  messageList: {
    paddingLeft: 0,
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
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    zIndex: 5,
  },
  inputContainer2: {
    
    backgroundColor: 'transparent',
    zIndex: 5,
  },
  loadMoreContainer: {
    padding: 16,
    alignItems: 'center',
  },
  loadMoreText: {
    color: COLORS.fgMuted,
    fontSize: 14,
  },
  skeletonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.bg,
    padding: 16,
    zIndex: 10,
  },
  skeletonUser: {
    alignSelf: 'flex-end',
    width: '70%',
    height: 60,
    backgroundColor: '#282A2C',
    borderRadius: 16,
    marginBottom: 16,
  },
  skeletonAi: {
    width: '100%',
    borderRadius: 16,
    marginBottom: 12,
  },
});
