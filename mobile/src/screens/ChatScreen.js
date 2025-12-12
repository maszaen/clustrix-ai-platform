import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, Text, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Animated, Easing, Dimensions } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import ReanimatedModule, { withTiming, Easing as ReanimatedEasing, runOnJS, useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { LegendList } from '@legendapp/list';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { streamChat, generateTitle, buildSystemPrompt } from '../services/api';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { WELCOME_MESSAGES, DIAMOND_LOGO_HTML } from '../constants/strings';


function getWelcomeMessage(username = 'friend') {
  const hour = new Date().getHours();
  let timeMessages = [];
  if (hour >= 5 && hour < 12) timeMessages = WELCOME_MESSAGES.pagi;
  else if (hour >= 12 && hour < 15) timeMessages = WELCOME_MESSAGES.siang;
  else if (hour >= 15 && hour < 19) timeMessages = WELCOME_MESSAGES.sore;
  else timeMessages = WELCOME_MESSAGES.malam;
  
  const allMessages = [...timeMessages, ...WELCOME_MESSAGES.anytime];
  const msg = allMessages[Math.floor(Math.random() * allMessages.length)];
  // Get first name only, capitalize properly (e.g. "JoHN Anderson" -> "John")
  const firstName = username.split(' ')[0];
  const formattedName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  return msg.replace(/\[USERNAME\]/g, formattedName);
}


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

const ChatScreen = memo(function ChatScreen({ topInset = 0, onShowThinking, onStreamingThinking }) {
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
  const [streamingMessageId, setStreamingMessageId] = useState(null); // Stable ID for streaming message to prevent blink
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [visibleCount, setVisibleCount] = useState(200); // Start with last 12 messages
  const [loadingMore, setLoadingMore] = useState(false);
  const lastHapticTime = useRef(0);
  const isInitialLoad = useRef(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const contentFadeAnim = useRef(new Animated.Value(1)).current;
  const contentFadeAnimTwo = useRef(new Animated.Value(0)).current;
  const skeletonTimeoutRef = useRef(null);
  const prevSessionIdRef = useRef(currentSession?.id);
  const trigger = currentSession && messages.length > 0;
  
  // Scroll to bottom button - use refs to avoid re-render interference with maintainVisibleContentPosition
  const scrollPositionRef = useRef({ showButton: false, isScrolling: false });
  const [scrollButtonVisible, setScrollButtonVisible] = useState(false);
  const scrollBtnOpacity = useRef(new Animated.Value(0)).current;
  const scrollTimeoutRef = useRef(null);
  const autoHideTimeoutRef = useRef(null);
  const programmaticScrollRef = useRef(false);
  const lastContentHeight = useRef(0);
  const lastScrollOffset = useRef(0);
  const lastLayoutHeight = useRef(0);
  
  // Spacer visibility tracking for simpler approach
  const [showSpacer, setShowSpacer] = useState(false);
  const isNearBottomRef = useRef(true); // Track if user is near bottom
  const streamEndedRef = useRef(false); // Track if stream just ended
  const SPACER_HEIGHT = Dimensions.get('window').height - 335; // Full device height - 145
  const SPACER_HIDE_BUFFER = 30; // Extra buffer before hiding spacer
  
  // Smooth keyboard animation using react-native-keyboard-controller
  const { height: keyboardAnimatedHeight } = useReanimatedKeyboardAnimation();
  const inputAnimatedStyle = useAnimatedStyle(() => {
    // Proportional offset - reduce movement by ~10% for tighter keyboard gap
    // height.value goes from 0 (closed) to negative (open, e.g. -300)
    // This smoothly scales with keyboard height
    const offset = -keyboardAnimatedHeight.value * 0.05;
    return {
      transform: [{ translateY: keyboardAnimatedHeight.value + offset }],
    };
  });
  
  // Fade in/out scroll button with auto-hide

  const scrollBottomHandler = () => {
    if (scrollButtonVisible && !keyboardVisible) {
      // Fade in
      Animated.timing(scrollBtnOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      // Auto-hide after 3 seconds
      if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
      autoHideTimeoutRef.current = setTimeout(() => {
        Animated.timing(scrollBtnOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setScrollButtonVisible(false));
      }, 3000);
    } else {
      // Fade out
      Animated.timing(scrollBtnOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    
    return () => {
      if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
    };
  }

  const scrollBottomBtnShow = () => {
    Animated.timing(scrollBtnOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }

  useEffect(() => {
    scrollBottomHandler()
  }, [scrollButtonVisible, keyboardVisible, scrollBtnOpacity]);

  // Spacer visibility management - simpler approach
  // Show spacer when streaming starts, hide when stream ends AND user scrolls up
  // Skip spacer if content is less than 90% of viewport
  useEffect(() => {
    if (isStreaming) {
      // Check if content is small enough to not need spacer
      // Content height without spacer vs 90% of layout height
      const contentWithoutSpacer = listContentHeight - (showSpacer ? SPACER_HEIGHT : 0);
      const viewportThreshold = listLayoutHeight * 0.9;
      
      if (contentWithoutSpacer < viewportThreshold && listLayoutHeight > 0) {
        // Content is small, no spacer needed
        setShowSpacer(false);
        streamEndedRef.current = false;
      } else {
        // Stream started - show spacer and scroll to bottom
        setShowSpacer(true);
        streamEndedRef.current = false;
        // Wait for layout update before scrolling
        requestAnimationFrame(() => {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 50);
        });
      }
    } else if (streamEndedRef.current === false && showSpacer) {
      // Stream just ended
      streamEndedRef.current = true;
      // If user is NOT near bottom, hide spacer immediately
      if (!isNearBottomRef.current) {
        setShowSpacer(false);
      }
      // If user IS near bottom, keep spacer - will be removed when they scroll up
    }
  }, [isStreaming, showSpacer, listContentHeight, listLayoutHeight]);

  // Pulse animation for skeleton
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

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

  const [listContentHeight, setListContentHeight] = useState(0);
  const [listLayoutHeight, setListLayoutHeight] = useState(0);
  const hasScrolledInitial = useRef(false);
  const initialScrollDone = useRef(false);

  // Initial load reset
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

  // Reset on session change + skeleton for session->session
  useEffect(() => {
    const wasWelcome = !wasSession && !currentSession?.id;
    const wasSession = prevSessionIdRef.current !== undefined && prevSessionIdRef.current !== null;
    const isSessionToSession = wasSession && currentSession?.id && prevSessionIdRef.current !== currentSession?.id;
    const isWelcomeToSession = !wasSession && currentSession?.id;
    
    
    // Clear pending timeout
    if (skeletonTimeoutRef.current) {
      clearTimeout(skeletonTimeoutRef.current);
      skeletonTimeoutRef.current = null;
    }
    
    isInitialLoad.current = true;
    hasScrolledInitial.current = false;
    initialScrollDone.current = false;
    setVisibleCount(12);
    if (isSessionToSession) {
      setShowSkeleton(true);
      skeletonOpacity.setValue(1);
      
      // Auto-hide skeleton after 1 second
      skeletonTimeoutRef.current = setTimeout(() => {
        Animated.timing(skeletonOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowSkeleton(false));
      }, 500);
    }
    
    if (wasWelcome) {
      Animated.sequence([
        Animated.timing(contentFadeAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]).start();
    }
    if (isWelcomeToSession) {
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(contentFadeAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(contentFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();
      }, 50);
    } else {
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(contentFadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
          Animated.timing(contentFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();
      }, 50);
    }
    
    // Show skeleton instantly for session->session transitions + content fade
    
    
    prevSessionIdRef.current = currentSession?.id;
    
    return () => {
      if (skeletonTimeoutRef.current) clearTimeout(skeletonTimeoutRef.current);
    };
  }, [currentSession?.id, skeletonOpacity, trigger]);

  // No auto-scroll during streaming - inverted FlatList handles it naturally
  // Content expands upward, user stays at bottom

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
    hasScrolledInitial.current = true;
    initialScrollDone.current = true;
    
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
    
    // Scroll to bottom (last item = newest message)
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
    
    // Generate stable ID for this streaming message (prevents blink on save)
    const stableStreamingId = `streaming-${Date.now()}`;
    setStreamingMessageId(stableStreamingId);

    let fullContent = '';
    let fullThinking = '';
    let thinkStartTime = null;

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
        // Track when thinking starts
        if (!thinkStartTime && think) {
          thinkStartTime = Date.now();
        }
        // Append thinking content (Gemini native streams thinking in chunks)
        fullThinking += think;
        setThinkingContent(fullThinking);
        onStreamingThinking?.(fullThinking);
      },
      onDone: async () => {
        const content = fullThinking ? `<thinking>${fullThinking}</thinking>\n\n${fullContent}` : fullContent;
        
        // Calculate thinking duration
        const thinkDuration = thinkStartTime ? Math.round((Date.now() - thinkStartTime) / 1000) : null;
        
        // SAVE FIRST before clearing streaming states (prevents blink)
        if (isNewSession) {
          await appendMessage('assistant', content, {
            model: settings.model,
            provider: settings.provider,
            thinkContent: fullThinking || null,
            thinkDuration: thinkDuration,
            _streamingId: stableStreamingId,
            _messageIndex: 1,
          }, session);
        } else {
          await appendMessage('assistant', content, {
            model: settings.model,
            provider: settings.provider,
            thinkContent: fullThinking || null,
            thinkDuration: thinkDuration,
            _streamingId: stableStreamingId,
          });
        }
        
        // THEN clear streaming states (saved message already in state)
        setIsStreaming(false);
        setStreamingContent('');
        setThinkingContent('');
        setStreamingMessageId(null);
        
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
    <ChatMessage 
      message={item} 
      isUser={item.role === 'user'} 
      isNew={item._key === newMessageId}
      onShowThinking={onShowThinking}
    />
  );

  // Lazy load - only show last N messages
  // Use _streamingId if available (for smooth transition from streaming to saved)
  const allMessages = messages.map((m, idx) => ({
    ...m,
    _key: m._streamingId || m.id || `msg-${idx}-${m.message_index || idx}`,
  }));
  
  const startIndex = Math.max(0, allMessages.length - visibleCount);
  let displayMessages = allMessages.slice(startIndex);
  const hasMoreMessages = startIndex > 0;
  
  // Check if content exceeds viewport - 30px threshold
  const shouldHaveSpacer = listContentHeight >= (listLayoutHeight - 30);
  
  // Only show streaming message if we're actually streaming AND no saved assistant message exists yet
  // This prevents duplicate display during the brief state transition
  const lastMessage = displayMessages[displayMessages.length - 1];
  const alreadyHasSavedResponse = lastMessage?.role === 'assistant' && !lastMessage?.isStreaming;
  
  if ((streamingContent || isStreaming) && !alreadyHasSavedResponse) {
    // Use stable streaming ID to prevent blink when transitioning to saved message
    displayMessages.push({
      _key: streamingMessageId || `streaming-fallback`,
      role: 'assistant',
      content: thinkingContent ? `<thinking>${thinkingContent}</thinking>\n\n${streamingContent}` : streamingContent || '...',
      isStreaming: true,
      shouldHaveSpacer,
    });
  }
  
  // NO reverse needed - FlashList with maintainVisibleContentPosition handles chat style
  // Data: [oldest, ..., newest] - newest at bottom

  // Load more messages when scroll to top
  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMoreMessages) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 12, allMessages.length));
      setLoadingMore(false);
    }, 100);
  }, [loadingMore, hasMoreMessages, allMessages.length]);

  // Find last AI message index for initial scroll
  const getLastAiIndex = useCallback(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (displayMessages[i].role === 'assistant') return i;
    }
    return displayMessages.length - 1;
  }, [displayMessages]);

  // DISABLED: useEffect scroll to last AI message - causes lag
  // Simpler approach: use inverted list or just scroll to end
  /*
  useEffect(() => {
    const lastAiIndex = getLastAiIndex();
    
    // Guard: data harus ada, index valid, belum scroll, ref exists
    if (
      displayMessages.length > 0 && 
      lastAiIndex >= 0 && 
      !hasScrolledInitial.current && 
      flatListRef.current
    ) {
      // Delay untuk pastikan layout sudah ready
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: lastAiIndex,
          animated: false,
          viewPosition: 0,  // 0 = TOP of screen
          viewOffset: -(topInset - 140),  // offset untuk header/padding
        });
        hasScrolledInitial.current = true;
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [displayMessages.length, getLastAiIndex, topInset]);
  */
  // Header component for load more (appears at TOP)
  const ListHeader = useCallback(() => {
    if (!hasMoreMessages) return null;
    return (
      <TouchableWithoutFeedback onPress={handleLoadMore}>
        <View style={styles.loadMoreContainer}>
          {loadingMore ? (
            <>
              <ActivityIndicator size="small" color={COLORS.fgMuted} />
              <Text style={styles.loadMoreText}>Load earlier messages</Text>
            </>
          ) : (
            <>
              <ActivityIndicator size="small" color={COLORS.fgMuted} />
              <Text style={styles.loadMoreText}>Load earlier messages</Text>
            </>
          )}
        </View>
      </TouchableWithoutFeedback>
    );
  }, [hasMoreMessages, loadingMore, handleLoadMore]);

  // Footer component for bottom spacing (appears at BOTTOM)
  // Simpler approach: fixed size during stream, conditional removal based on visibility
  const ListFooter = useCallback(() => {
    // Show spacer during streaming OR if stream ended but user still near bottom
    if (showSpacer) {
      return <View style={{ height: SPACER_HEIGHT }} />;
    }
    // Default minimal footer for keyboard handling
    return <View style={{ height: Platform.OS === 'android' ? keyboardHeight + 75 : 85 }} />;
  }, [showSpacer, keyboardHeight]);

  return (
    <View style={styles.container}>
      {!currentSession && displayMessages.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View style={[styles.emptyState, { paddingTop: topInset, paddingBottom: Platform.OS === 'android' ? keyboardHeight + 65 : 75, opacity: contentFadeAnim }]}>
            <WelcomeScreen username={settings.persona?.name} />
          </Animated.View>
        </TouchableWithoutFeedback>
      ) : displayMessages.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View style={[styles.emptyState, { paddingTop: topInset, paddingBottom: Platform.OS === 'android' ? keyboardHeight + 65 : 75, opacity: contentFadeAnimTwo }]}>
          </Animated.View>
        </TouchableWithoutFeedback>
      ) : (
        <>
          <Animated.View style={{ flex: 1, opacity: contentFadeAnim }}>
            
            <LegendList
              ref={flatListRef}
              data={displayMessages}
              keyExtractor={(item) => item._key}
              renderItem={renderMessage}
              estimatedItemSize={100}
              // recycleItems={true}
              // Removed initialScrollIndex - using manual scrollToIndex instead (GH #239, #240)
              maintainScrollAtEnd
              onStartReached={() => {handleLoadMore(), scrollBottomBtnShow()}}
              // Removed maintainScrollAtEndThreshold to prevent auto-scroll issues
              maintainVisibleContentPosition
              ListHeaderComponent={ListHeader}
              ListFooterComponent={ListFooter}
              contentContainerStyle={{ paddingLeft: 0, paddingTop: topInset + 66 }}
              // onScrollToIndexFailed={onScrollToIndexFailed}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onContentSizeChange={(w, h) => {
                setListContentHeight(h);
                lastContentHeight.current = h;
              }}
              onLayout={(e) => {
                setListLayoutHeight(e.nativeEvent.layout.height);
                lastLayoutHeight.current = e.nativeEvent.layout.height;
              }}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                
                // Track current scroll position for eased scroll animation
                lastScrollOffset.current = contentOffset.y;
                
                const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
                const percentFromBottom = distanceFromBottom / layoutMeasurement.height;
                
                // Track if user is near bottom (for spacer visibility)
                const nearBottom = distanceFromBottom < SPACER_HEIGHT + SPACER_HIDE_BUFFER;
                isNearBottomRef.current = nearBottom;
                
                // If stream ended and user scrolled up past spacer, hide it
                if (streamEndedRef.current && showSpacer && !nearBottom) {
                  setShowSpacer(false);
                }
                
                // Fast hide: instantly hide when user scrolls (no debounce)
                if (scrollButtonVisible && !programmaticScrollRef.current) {
                  setScrollButtonVisible(false);
                }
                
                // Track position for showing button after scroll stops
                const isScrollable = contentSize.height > layoutMeasurement.height;
                // Only show if scrollable AND scrolled up significantly (30%)
                const shouldShow = isScrollable && percentFromBottom > 0.3;
                scrollPositionRef.current.showButton = shouldShow;
                scrollPositionRef.current.isScrolling = true;
                
                // Clear previous timeout
                if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
                
                // Show button only after scroll stops
                scrollTimeoutRef.current = setTimeout(() => {
                  scrollPositionRef.current.isScrolling = false;
                  if (!programmaticScrollRef.current && scrollPositionRef.current.showButton) {
                    setScrollButtonVisible(true);
                  }
                  programmaticScrollRef.current = false;
                }, 300);
              }}
              scrollEventThrottle={100}
            />
          </Animated.View>
          {/* Skeleton Overlay - full height, zIndex below input so form stays visible */}
          {showSkeleton && (
            <Animated.View style={[styles.skeletonContainer, { opacity: skeletonOpacity, paddingTop: topInset + 70 }]}>
              <Animated.View style={[styles.skeletonUser, { opacity: pulseAnim }]} />
              <Animated.View style={{ opacity: pulseAnim }}>
                <LinearGradient
                  colors={[COLORS.skeleton, COLORS.skeleton, 'transparent']}
                  locations={[0, 0.3, 1]}
                  style={styles.skeletonAi}
                />
              </Animated.View>
            </Animated.View>
          )}
        </>
      )}
      
      {/* Scroll to bottom button - always mounted for smooth fade animation */}
      {displayMessages.length > 0 && !keyboardVisible && (
        <Animated.View
          pointerEvents={scrollButtonVisible ? 'auto' : 'none'}
          style={[styles.scrollToBottomBtn, {
            bottom: 95,
            opacity: scrollBtnOpacity,
          }]}
        >
          <Pressable
            onPress={() => {
              if (!scrollButtonVisible) return; // Guard against ghost taps
              programmaticScrollRef.current = true;
              
              // Simple scroll to end
              flatListRef.current?.scrollToEnd({ animated: true });
              
              // Fade out then update state
              Animated.timing(scrollBtnOpacity, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }).start(() => setScrollButtonVisible(false));
            }}
            style={({ pressed }) => [{
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Ionicons name="arrow-down-outline" size={21} color={COLORS.icon} />
          </Pressable>
        </Animated.View>
      )}
      
      {/* Keyboard-animated Input Container */}
      <ReanimatedModule.View style={[styles.inputContainer, inputAnimatedStyle]}>
        <View style={styles.inputContainer2}>
          <ChatInput 
            ref={chatInputRef} 
            onSend={handleSend} 
            isStreaming={isStreaming} 
            onStop={handleStop}
            placeholder={!currentSession && messages.length === 0 ? 'How can I help you today?' : 'Reply...'}
          />
        </View>
      </ReanimatedModule.View>
    </View>
  );
});

export default ChatScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  messageList: {
    paddingLeft: 0,
    paddingTop: 85,
    paddingBottom: 75,
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
    maxWidth: '80%',
    fontFamily: FONTS.display,
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
    display: 'flex',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
  },
  loadMoreText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  skeletonContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
    padding: 16,
    zIndex: 4,
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
    height: 350,
    borderRadius: 16,
  },
  scrollToBottomBtn: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 26,
    width: 45,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
});
