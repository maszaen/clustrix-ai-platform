import { useRef, useEffect, useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, Text, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { streamChat, generateTitle, buildSystemPrompt } from '../services/api';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { LinearGradient } from 'expo-linear-gradient';

const COLORS = {
  bg: '#000000ff',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  skeleton: '#232425',
  accent: '#6366f1',
};

// Welcome messages by time of day - matching Electron exactly
const WELCOME_MESSAGES = {
  pagi: [
    "Morning, [USERNAME]! What's up?",
    "Rise and grind, [USERNAME]!",
    "Good morning, [USERNAME]!",
    "Morning check-in, [USERNAME]!",
  ],
  siang: [
    "Good afternoon, [USERNAME]!",
    "Hey [USERNAME], what's good?",
    "Midday check-in, [USERNAME]!",
    "Afternoon vibes, [USERNAME]!",
  ],
  sore: [
    "Evening vibes, [USERNAME]!",
    "Good evening, [USERNAME]!",
    "Evening check-in, [USERNAME]!",
    "Hey [USERNAME], what's up?",
  ],
  malam: [
    "Night session, [USERNAME]!",
    "Evening, [USERNAME]!",
    "Late night work, [USERNAME]?",
    "Night check-in, [USERNAME]!",
  ],
  anytime: [
    "What's new, [USERNAME]?",
    "Hey there, [USERNAME]!",
    "Yo [USERNAME], what's the mission?",
    "What's poppin', [USERNAME]?",
    "Back again, [USERNAME]?",
    "Let's get it, [USERNAME]!",
    "Another day, another slay, [USERNAME]!",
    "Ready to get things done, [USERNAME]?",
  ],
};

function getWelcomeMessage(username = 'friend') {
  const hour = new Date().getHours();
  let timeMessages = [];
  if (hour >= 5 && hour < 12) timeMessages = WELCOME_MESSAGES.pagi;
  else if (hour >= 12 && hour < 15) timeMessages = WELCOME_MESSAGES.siang;
  else if (hour >= 15 && hour < 19) timeMessages = WELCOME_MESSAGES.sore;
  else timeMessages = WELCOME_MESSAGES.malam;
  
  const allMessages = [...timeMessages, ...WELCOME_MESSAGES.anytime];
  const msg = allMessages[Math.floor(Math.random() * allMessages.length)];
  return msg.replace(/\[USERNAME\]/g, username);
}

// Diamond Logo using WebView with exact CSS from Electron
const DIAMOND_LOGO_HTML = (accentColor) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      background: transparent; 
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    figure {
      --size: 110px;
      --duration: 5s;
      --pull: -0.15;
      perspective: 30rem;
      display: grid;
      grid-template-areas: "figure";
      place-items: center;
      width: var(--size);
      height: var(--size);
      animation: spin-logo var(--duration) ease-in-out infinite;
    }
    
    figure > div {
      --radius: calc(var(--size) / 4);
      --deg: calc(var(--i) * (360deg / 10));
      --transform-start: translate3d(
          calc(cos(var(--deg)) * var(--radius)),
          calc(sin(var(--deg)) * var(--radius)),
          0
        )
        rotate(calc(var(--deg)));
      grid-area: figure;
      background-color: ${accentColor || 'hsl(225, 100%, 60%)'};
      width: calc(var(--size) / 4);
      height: calc(var(--size) / 4);
      clip-path: polygon(25% 25%, 100% 50%, 25% 75%, 0% 50%);
      transform: var(--transform-start);
      transform-style: preserve-3d;
      animation: diamonds var(--duration) cubic-bezier(0.87, 0, 0.13, 1) infinite;
    }
    
    @keyframes diamonds {
      0%, 20% {
        transform: var(--transform-start);
      }
      50% {
        clip-path: polygon(75% 25%, 100% 50%, 75% 75%, 0% 50%);
        transform: translate3d(
            calc(cos(var(--deg)) * var(--radius) * var(--pull)),
            calc(sin(var(--deg)) * var(--radius) * var(--pull)),
            5rem
          )
          rotate(calc(var(--deg) + 90deg));
      }
    }
    
    @keyframes spin-logo {
      0%, 20% { transform: translateY(0); }
      50% { transform: translateY(20px); }
      80%, 100% { transform: translateY(0); }
    }
  </style>
</head>
<body>
  <figure>
    <div style="--i: 1"></div>
    <div style="--i: 2"></div>
    <div style="--i: 3"></div>
    <div style="--i: 4"></div>
    <div style="--i: 5"></div>
    <div style="--i: 6"></div>
    <div style="--i: 7"></div>
    <div style="--i: 8"></div>
    <div style="--i: 9"></div>
    <div style="--i: 10"></div>
    <div style="--i: 11"></div>
    <div style="--i: 12"></div>
  </figure>
</body>
</html>
`;

// Diamond Logo component using WebView for exact CSS animation
function DiamondLogo({ accentColor }) {
  return (
    <View style={styles.logoContainer}>
      <WebView
        source={{ html: DIAMOND_LOGO_HTML(accentColor) }}
        style={styles.logoWebView}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        originWhitelist={['*']}
        javaScriptEnabled={true}
      />
    </View>
  );
}

// Welcome Screen with diamond logo and typewriter effect
function WelcomeScreen({ username, accentColor }) {
  const [displayText, setDisplayText] = useState('');
  const isMountedRef = useRef(true);
  const welcomeMessage = useRef(getWelcomeMessage(username || 'friend')).current;

  useEffect(() => {
    isMountedRef.current = true;
    let i = 0;
    const timers = [];
    
    const typeChar = () => {
      if (!isMountedRef.current) return;
      if (i < welcomeMessage.length) {
        setDisplayText(welcomeMessage.slice(0, i + 1));
        i++;
        const char = welcomeMessage[i - 1];
        // Match Electron: punctuation = 350ms delay, normal = 30 + random(40)
        const delay = /[.,?!;:\-–]/.test(char) ? 350 : 30 + Math.random() * 40;
        const t = setTimeout(typeChar, delay);
        timers.push(t);
      }
    };
    
    // Initial delay before typing starts
    const starter = setTimeout(typeChar, 100);
    timers.push(starter);
    
    return () => { 
      isMountedRef.current = false;
      timers.forEach(t => clearTimeout(t));
    };
  }, [welcomeMessage]);

  return (
    <View style={styles.welcomeContainer}>
      <DiamondLogo accentColor={accentColor} />
      <Text style={styles.welcomeText}>{displayText}</Text>
    </View>
  );
}

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

  // Reset on session change - show skeleton overlay ONLY if session has messages
  useEffect(() => {
    isInitialLoad.current = true;
    hasScrolledInitial.current = false;
    initialScrollDone.current = false;
    setVisibleCount(12);
    // Only show skeleton when switching to existing session with messages
    // Don't show skeleton for new sessions or when streaming
    if (currentSession && messages.length > 0 && !isStreaming) {
      setShowSkeleton(true);
      skeletonOpacity.setValue(1);
    } else {
      setShowSkeleton(false);
    }
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
    // Disable skeleton for new messages - IMPORTANT: do this first
    hasScrolledInitial.current = true;
    initialScrollDone.current = true;
    setShowSkeleton(false);
    skeletonOpacity.setValue(0);
    
    let session = sessionRef.current;
    let isNewSession = false;
    
    // WELCOME SCREEN FLOW: Create session first, then append messages
    if (!session) {
      session = await createSession('New Chat');
      sessionRef.current = session;
      isNewSession = true;
    }

    const newMsgKey = `msg-${messages.length}`;
    setNewMessageId(newMsgKey);
    
    // For new session from welcome screen, pass session directly to appendMessage
    if (isNewSession) {
      await appendMessage('user', text, { _messageIndex: 0 }, session);
    } else {
      await appendMessage('user', text, {});
    }
    
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    setTimeout(() => setNewMessageId(null), 500);
    
    // Build system prompt with persona settings
    const systemPrompt = buildSystemPrompt(settings);
    
    // For new session, messages state is empty, so just use the user message
    const apiMessages = isNewSession 
      ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }]
      : [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: text }];

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
        // Append thinking content (Gemini native streams thinking in chunks)
        fullThinking += think;
        setThinkingContent(fullThinking);
      },
      onDone: async () => {
        // Keep streaming content visible while saving
        const content = fullThinking ? `<thinking>${fullThinking}</thinking>\n\n${fullContent}` : fullContent;
        
        // For new session, pass session and correct message index
        if (isNewSession) {
          await appendMessage('assistant', content, {
            model: settings.model,
            provider: settings.provider,
            thinkContent: fullThinking || null,
            _messageIndex: 1,
          }, session);
        } else {
          await appendMessage('assistant', content, {
            model: settings.model,
            provider: settings.provider,
            thinkContent: fullThinking || null,
          });
        }
        
        // Clear streaming AFTER message is saved
        setIsStreaming(false);
        setStreamingContent('');
        setThinkingContent('');
        
        // Generate title for new session
        if (isNewSession) {
          const title = await generateTitle(text, settings.model, settings.provider, settings.baseUrl, settings.apiKey);
          await updateSession({ name: title }, session);
        }
      },
      onError: async (error) => {
        setIsStreaming(false);
        setStreamingContent('');
        if (isNewSession) {
          await appendMessage('assistant', `Error: ${error}`, { error: true, _messageIndex: 1 }, session);
        } else {
          await appendMessage('assistant', `Error: ${error}`, { error: true });
        }
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

  return (
    <View style={styles.container}>
      {!currentSession && displayMessages.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.emptyState, { paddingTop: topInset, paddingBottom: Platform.OS === 'android' ? keyboardHeight + 65 : 75 }]}>
            <WelcomeScreen username={settings.persona?.name} />
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
          contentContainerStyle={[styles.messageList, { paddingTop: topInset + 66, paddingBottom: Platform.OS === 'android' ? keyboardHeight + 75 : 85 }]}
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
  emptySubtitle: {
    color: COLORS.fgMuted,
    fontSize: 16,
    marginTop: 8,
  },
  welcomeContainer: {
    alignItems: 'center',
    gap: 0,
  },
  logoContainer: {
    width: 150,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWebView: {
    width: 150,
    height: 150,
    backgroundColor: 'transparent',
  },
  welcomeText: {
    color: COLORS.fg,
    fontSize: 24,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  cursor: {
    color: COLORS.fgMuted,
    fontWeight: '300',
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
