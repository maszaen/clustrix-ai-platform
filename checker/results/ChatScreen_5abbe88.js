import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { View, StyleSheet, Text, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Animated, Dimensions, Modal, Pressable } from 'react-native';
import ReanimatedModule, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { LegendList } from '@legendapp/list';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { streamChat, generateTitle, buildSystemPrompt } from '../services/api';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import ContextMenuFixed from '../components/ContextMenuFixed';
import InputModal from '../components/InputModal';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { DIAMOND_LOGO_HTML } from '../constants/strings';


// Welcome Screen with diamond logo and typewriter effect
function DiamondLogo({ accentColor, shouldAnimate }) {
  const [showLogo, setShowLogo] = useState(false);
  
  useEffect(() => {
    if (shouldAnimate) {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => setShowLogo(true), 0);
      return () => clearTimeout(timer);
    }
  }, [shouldAnimate]);
  
  if (!showLogo) return <View style={styles.logoContainer} />;
  
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

// Welcome Screen with diamond logo and typewriter effect (uses message from context)
function WelcomeScreen({ message, shouldAnimate }) {
  const [displayText, setDisplayText] = useState('');
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!message) return;
    
    isMountedRef.current = true;
    let i = 0;
    const timers = [];
    
    const typeChar = () => {
      if (!isMountedRef.current) return;
      if (i < message.length) {
        setDisplayText(message.slice(0, i + 1));
        i++;
        const char = message[i - 1];
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
  }, [message]);

  return (
    <View style={styles.welcomeContainer}>
      <DiamondLogo shouldAnimate={shouldAnimate} />
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
    setMessageMetadata,
    removeMessage,
    welcomeMessage,
    splashComplete,
    loadDraft,
    persistDraft,
    clearDraft,
    loadWelcomeDraft,
    saveWelcomeDraft,
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
  const [inputText, setInputText] = useState('');
  const [retryTarget, setRetryTarget] = useState(null);
  const [retryOptionsVisible, setRetryOptionsVisible] = useState(false);
  const [retryReasonVisible, setRetryReasonVisible] = useState(false);
  const [retryReason, setRetryReason] = useState('');
  const [metadataMenu, setMetadataMenu] = useState({ visible: false, message: null, position: null });
  const lastHapticTime = useRef(0);
  const isInitialLoad = useRef(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const contentFadeAnim = useRef(new Animated.Value(1)).current;
  const contentFadeAnimTwo = useRef(new Animated.Value(0)).current;
  const skeletonTimeoutRef = useRef(null);
  const prevSessionIdRef = useRef(currentSession?.id);
  const isSendingFromWelcome = useRef(false);
  const lastCreatedSessionId = useRef(null);
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
  
  // Animated paddingBottom for content area (welcome screen, messages)
  const contentPaddingAnimatedStyle = useAnimatedStyle(() => {
    // Convert negative keyboard height to positive padding
    const paddingValue = -keyboardAnimatedHeight.value;
    return {
      paddingBottom: paddingValue > 0 ? paddingValue + 75 : 85,
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
      // Fade outz
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
  // const onScrollToIndexFailed = useCallback((info) => {
  //   setTimeout(() => {
  //     flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
  //   }, 100);
  // }, []);

  // Reset on session change + skeleton for session->session
  useEffect(() => {
    const wasSession = prevSessionIdRef.current !== undefined && prevSessionIdRef.current !== null;
    const wasWelcome = !wasSession && !currentSession?.id;
    const isSessionToSession = wasSession && currentSession?.id && prevSessionIdRef.current !== currentSession?.id;
    const isWelcomeToSession = !wasSession && currentSession?.id;
    const isSessionToWelcome = wasSession && (currentSession?.id === undefined || currentSession?.id === null);

    
    // Robust check for sending from welcome: flag OR matching ID of just-created session
    const sendingFromWelcome = isSendingFromWelcome.current || (currentSession?.id && lastCreatedSessionId.current === currentSession.id);
    
    // Clear pending timeout ONLY if we are starting a NEW skeleton sequence
    // This prevents clearing the cleanup timer if just messages update
    if (isSessionToSession || (isWelcomeToSession && !sendingFromWelcome)) {
      if (skeletonTimeoutRef.current) {
        clearTimeout(skeletonTimeoutRef.current);
        skeletonTimeoutRef.current = null;
      }
    }
    
    isInitialLoad.current = true;
    hasScrolledInitial.current = false;
    initialScrollDone.current = false;
    setVisibleCount(12);

    if (isSessionToSession && !sendingFromWelcome) {
      setShowSkeleton(true);
      skeletonOpacity.setValue(1);
      
      // Auto-hide skeleton after 1 second
      skeletonTimeoutRef.current = setTimeout(() => {
        Animated.timing(skeletonOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowSkeleton(false));
      }, 700);
    }

    if (isWelcomeToSession && !sendingFromWelcome) {
      // Rule 1: Welcome -> Session via Sidebar (WITH Skeleton)
      setShowSkeleton(true);
      skeletonOpacity.setValue(1);
      
      skeletonTimeoutRef.current = setTimeout(() => {
        Animated.timing(skeletonOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowSkeleton(false));
      }, 700);
    }
    
    // Reset flag if it was set
    if (sendingFromWelcome && isWelcomeToSession && !isSessionToWelcome) {
      isSendingFromWelcome.current = false;


      // Force hide skeleton just in case
      setShowSkeleton(false);
      // Ensure content is visible immediately without blink
      contentFadeAnim.setValue(1);
      contentFadeAnimTwo.setValue(1);
    }
    
    if (wasWelcome) {
      Animated.sequence([
        Animated.timing(contentFadeAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]).start();
    }
    
    if (isWelcomeToSession && !sendingFromWelcome) {
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(contentFadeAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(contentFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();
      }, 50);
    } else if (!isWelcomeToSession) {

      setTimeout(() => {
        Animated.sequence([
          Animated.timing(contentFadeAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(contentFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();
      }, 50);
    } 
    
    
    prevSessionIdRef.current = currentSession?.id;
    
    return () => {
      if (skeletonTimeoutRef.current) clearTimeout(skeletonTimeoutRef.current);
    };
  }, [currentSession?.id, skeletonOpacity]);

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

  // Hydrate draft for active session or welcome screen
  useEffect(() => {
    let mounted = true;
    const hydrateDraft = async () => {
      const draftValue = currentSession
        ? await loadDraft(currentSession.id)
        : await loadWelcomeDraft();
      if (mounted) {
        setInputText(draftValue || '');
      }
    };
    hydrateDraft();
    return () => { mounted = false; };
  }, [currentSession?.id, loadDraft, loadWelcomeDraft]);

  // Debounced draft persistence (500ms) to prevent DB spam
  useEffect(() => {
    const handle = setTimeout(() => {
      if (currentSession) {
        if (inputText?.trim()) {
          persistDraft(currentSession.id, inputText);
        } else {
          clearDraft(currentSession.id);
        }
      } else {
        // Welcome screen draft stored in user_persona table
        saveWelcomeDraft(inputText || '');
      }
    }, 500);

    return () => clearTimeout(handle);
  }, [inputText, currentSession, persistDraft, clearDraft, saveWelcomeDraft]);

  const handleSend = useCallback(async (text) => {
    hasScrolledInitial.current = true;
    initialScrollDone.current = true;

    // Clear persisted draft immediately on send (spec requirement)
    if (currentSession) {
      await clearDraft(currentSession.id);
    } else {
      await saveWelcomeDraft('');
    }

    // Reset composer visual state
    setInputText('');

    let session = sessionRef.current;
    let isNewSession = false;
    
    // WELCOME SCREEN FLOW: Create session first, then append messages
    if (!session) {
      isSendingFromWelcome.current = true;
      session = await createSession('New Chat');
      sessionRef.current = session;
      lastCreatedSessionId.current = session.id; // Store ID for effect check
      isNewSession = true;
    }

    // Store index for potential rollback when stream returns empty
    const userMessageIndex = isNewSession ? 0 : messages.length;
    
    // Set newMessageId with the EXACT format that _key uses in allMessages mapping
    // Format: saved-<sessionId last 6 chars>-<message_index>-<array idx>
    // For new user message: message_index = userMessageIndex, array idx = messages.length (position after append)
    const sessionIdPart = isNewSession ? session.id.slice(-6) : (currentSession?.id?.slice(-6) || 'x');
    const newMsgKey = `saved-${sessionIdPart}-${userMessageIndex}-${userMessageIndex}`;
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
      onDone: async (summary = {}) => {
        // If AI response empty (even with thinking), roll back messages and restore prompt
        if (!fullContent.trim()) {
          await removeMessage(session.id, userMessageIndex);
          setIsStreaming(false);
          setStreamingContent('');
          setThinkingContent('');
          setStreamingMessageId(null);
          setInputText(text);
          return;
        }

        const content = fullThinking ? `<thinking>${fullThinking}</thinking>\n\n${fullContent}` : fullContent;

        // Calculate thinking duration
        const thinkDuration = thinkStartTime ? Math.round((Date.now() - thinkStartTime) / 1000) : null;

        const metadata = {
          model: settings.model,
          provider: settings.provider,
          thinkContent: fullThinking || null,
          thinkDuration: thinkDuration,
          _streamingId: stableStreamingId,
          usage: summary?.usage || null,
          cost: summary?.usage?.cost ?? null,
        };

        // SAVE FIRST before clearing streaming states (prevents blink)
        if (isNewSession) {
          await appendMessage('assistant', content, { ...metadata, _messageIndex: 1 }, session);
        } else {
          await appendMessage('assistant', content, metadata);
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
  }, [currentSession, clearDraft, saveWelcomeDraft, messages, createSession, appendMessage, settings, removeMessage, updateSession, setIsStreaming, setStreamingContent, setThinkingContent, setStreamingMessageId, setInputText, setNewMessageId, onStreamingThinking, triggerHaptic]);

  const handleStop = () => {
    setIsStreaming(false);
    setStreamingContent('');
  };

  // Retrieve preceding user prompt for retry injection
  // Searches by ARRAY POSITION (backwards from AI message), not message_index
  // This handles cases where message_index might be duplicate due to race conditions
  const getUserPromptForMessage = useCallback((aiMessage) => {
    if (!aiMessage) {
      console.log('[getUserPromptForMessage] No message provided');
      return '';
    }
    
    console.log('[getUserPromptForMessage] Looking for user message before AI:', aiMessage.content?.substring(0, 30));
    
    // Find this AI message's position in the array
    const aiPos = messages.findIndex(m => 
      m.role === 'assistant' && 
      m.content === aiMessage.content
    );
    
    console.log('[getUserPromptForMessage] AI message found at array position:', aiPos);
    
    if (aiPos <= 0) {
      console.log('[getUserPromptForMessage] AI at position 0 or not found, no user message before');
      return '';
    }
    
    // Look backwards from AI position to find the first user message
    for (let i = aiPos - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        console.log('[getUserPromptForMessage] Found user message at position:', i, 'content:', messages[i].content?.substring(0, 50));
        return messages[i].content || '';
      }
    }
    
    console.log('[getUserPromptForMessage] No user message found before AI');
    return '';
  }, [messages]);

  // Retry modal trigger
  const handleRetryModal = useCallback((message) => {
    setRetryTarget(message);
    setRetryOptionsVisible(true);
  }, []);

  // Retry submission with prompt injection rules
  // SAMA PERSIS seperti handleSend: kirim history, thinking toggle, streaming
  // Bedanya: inject instruction ke user prompt yang dikirim ke API (UI tidak berubah)
  // PENTING: Gunakan POSISI ARRAY bukan message_index (karena bisa duplicate)
  const handleRetrySubmit = useCallback(async (mode, reasonText = '') => {
    if (!retryTarget || !currentSession) {
      console.log('[Retry] Aborted: no retryTarget or currentSession');
      return;
    }
    
    const pickedResponse = retryTarget.content || '';
    
    // Find AI message position in array (NOT message_index!)
    const aiArrayPos = messages.findIndex(m => 
      m.role === 'assistant' && m.content === retryTarget.content
    );
    
    console.log('[Retry] AI message array position:', aiArrayPos);
    console.log('[Retry] Mode:', mode);
    console.log('[Retry] Messages count before:', messages.length);
    console.log('[Retry] Messages:', messages.map((m, i) => ({ pos: i, role: m.role, index: m.message_index, content: m.content?.substring(0, 30) })));
    
    if (aiArrayPos < 0) {
      console.log('[Retry] AI message not found in array!');
      return;
    }
    
    // Find the user message that triggered this AI (search backwards from AI position)
    let userArrayPos = -1;
    let userPrompt = '';
    for (let i = aiArrayPos - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userArrayPos = i;
        userPrompt = messages[i].content || '';
        break;
      }
    }
    
    console.log('[Retry] User message array position:', userArrayPos);
    console.log('[Retry] Found userPrompt:', userPrompt?.substring(0, 100));
    
    // Build injected user prompt based on retry mode
    let injectedUserPrompt = '';
    if (mode === 'concise') {
      injectedUserPrompt = `The user requested a short, concise, but clear response.\nUser prompt: ${userPrompt}`;
    } else if (mode === 'detailed') {
      injectedUserPrompt = `The user requested a detailed, comprehensive response.\nUser prompt: ${userPrompt}`;
    } else {
      // Other mode - include reason, previous response, and original user prompt
      injectedUserPrompt = `Your previous response was inappropriate, and the user would like you to repeat it for ${reasonText}. Your previous response was ${pickedResponse}, and the associated user prompt was ${userPrompt}.`;
    }
    console.log('[Retry] Injected prompt:', injectedUserPrompt.substring(0, 150));

    // Close modals and clear state
    setRetryOptionsVisible(false);
    setRetryReasonVisible(false);
    setRetryReason('');
    setRetryTarget(null);

    // SNAPSHOT messages BEFORE any state changes
    const messagesSnapshot = [...messages];
    console.log('[Retry] Snapshot count:', messagesSnapshot.length);

    // Get the message_index of the AI we want to delete (for DB deletion)
    // Pass role and content for precise state filtering (handles duplicate indexes)
    const aiMessageIndex = retryTarget.message_index;
    const aiContent = retryTarget.content;
    
    // Delete from DB and state (with precise matching using role + content)
    console.log('[Retry] Deleting AI message with message_index:', aiMessageIndex, 'role: assistant');
    await removeMessage(currentSession.id, aiMessageIndex, 'assistant', aiContent);
    
    // Scroll to bottom
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    // Build system prompt (sama seperti handleSend)
    const systemPrompt = buildSystemPrompt(settings);
    
    // Build API messages dari snapshot using ARRAY POSITION:
    // - Include all messages BEFORE the AI (by array position)
    // - Replace the user message (by array position) with injected prompt
    const filteredMessages = messagesSnapshot.slice(0, aiArrayPos); // Everything before AI
    console.log('[Retry] Filtered messages for API (before AI at pos', aiArrayPos, '):', 
      filteredMessages.map((m, i) => ({ pos: i, role: m.role })));
    
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...filteredMessages.map((m, idx) => {
        // Replace the user message that triggered the response with injected version
        if (idx === userArrayPos) {
          console.log('[Retry] Replacing user message at array pos', idx, 'with injected prompt');
          return { role: 'user', content: injectedUserPrompt };
        }
        return { role: m.role, content: m.content };
      })
    ];

    console.log('[Retry] Final API messages count:', apiMessages.length);
    console.log('[Retry] API messages summary:', apiMessages.map(m => ({ role: m.role, contentLen: m.content?.length })));

    // Start streaming - SAMA PERSIS seperti handleSend
    setIsStreaming(true);
    setStreamingContent('');
    setThinkingContent('');
    
    const stableStreamingId = `streaming-retry-${Date.now()}`;
    setStreamingMessageId(stableStreamingId);
    console.log('[Retry] Streaming started with ID:', stableStreamingId);

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
        // Track when thinking starts (sama seperti handleSend)
        if (!thinkStartTime && think) {
          thinkStartTime = Date.now();
          console.log('[Retry] Thinking started');
        }
        // Append thinking content
        fullThinking += think;
        setThinkingContent(fullThinking);
        onStreamingThinking?.(fullThinking);
      },
      onDone: async (summary = {}) => {
        console.log('[Retry] Stream done, fullContent length:', fullContent.length, 'fullThinking length:', fullThinking.length);
        
        // Format content dengan thinking jika ada (sama seperti handleSend)
        const content = fullThinking ? `<thinking>${fullThinking}</thinking>\n\n${fullContent}` : fullContent;

        // Calculate thinking duration
        const thinkDuration = thinkStartTime ? Math.round((Date.now() - thinkStartTime) / 1000) : null;

        const metadata = {
          model: settings.model,
          provider: settings.provider,
          thinkContent: fullThinking || null,
          thinkDuration: thinkDuration,
          _streamingId: stableStreamingId,
          usage: summary?.usage || null,
          cost: summary?.usage?.cost ?? null,
        };

        // Append new AI response
        console.log('[Retry] Appending new AI response');
        await appendMessage('assistant', content, metadata);

        // Clear streaming states
        setIsStreaming(false);
        setStreamingContent('');
        setThinkingContent('');
        setStreamingMessageId(null);
        console.log('[Retry] Complete!');
      },
      onError: async (error) => {
        console.log('[Retry] Error:', error);
        setIsStreaming(false);
        setStreamingContent('');
        setThinkingContent('');
        setStreamingMessageId(null);
        await appendMessage('assistant', `Error: ${error}`, { error: true });
      },
    });
  }, [retryTarget, currentSession, removeMessage, messages, settings, appendMessage, setIsStreaming, setStreamingContent, setThinkingContent, setStreamingMessageId, onStreamingThinking, triggerHaptic]);

  // Handle like/dislike toggle
  const handleReaction = useCallback((message, liked) => {
    if (!currentSession || message?.message_index === undefined) return;
    const newState = message.isLiked === liked ? null : liked;
    setMessageMetadata(currentSession.id, message.message_index, { isLiked: newState });
  }, [currentSession, setMessageMetadata]);

  // Open metadata context menu with position
  const handleMetadataOpen = useCallback((message, buttonPosition) => {
    setMetadataMenu({ visible: true, message, position: buttonPosition });
  }, []);

  const renderMessage = ({ item }) => (
    <ChatMessage
      message={item}
      isUser={item.role === 'user'}
      isNew={item._key === newMessageId}
      onShowThinking={onShowThinking}
      onRetry={item.isLastAiMessage ? () => handleRetryModal(item) : null}
      onReact={(liked) => handleReaction(item, liked)}
      onShowMetadata={(msg, pos) => handleMetadataOpen(msg || item, pos)}
    />
  );

  // Lazy load - only show last N messages
  // Use TRULY unique key: session + index + array position
  const allMessages = messages.map((m, idx) => ({
    ...m,
    _key: `saved-${currentSession?.id?.slice(-6) || 'x'}-${m.message_index ?? idx}-${idx}`,
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
    // Prefix with 'live-' to avoid conflict with saved message that has same _streamingId
    displayMessages.push({
      _key: `live-${streamingMessageId || 'fallback'}`,
      role: 'assistant',
      content: thinkingContent ? `<thinking>${thinkingContent}</thinking>\n\n${streamingContent}` : streamingContent || '...',
      isStreaming: true,
      shouldHaveSpacer,
    });
  }
  
  // Mark the last non-streaming AI message for retry button visibility
  // Retry is ONLY allowed on the last AI message (not messages in the middle)
  const lastAiIndex = displayMessages.reduce((lastIdx, msg, idx) => 
    (msg.role === 'assistant' && !msg.isStreaming) ? idx : lastIdx, -1);
  if (lastAiIndex >= 0) {
    displayMessages[lastAiIndex] = { ...displayMessages[lastAiIndex], isLastAiMessage: true };
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
          <ReanimatedModule.View style={[styles.emptyState, { paddingTop: topInset }, contentPaddingAnimatedStyle]}>
            <Animated.View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', opacity: contentFadeAnim }}>
              <WelcomeScreen message={welcomeMessage} shouldAnimate={splashComplete} />
            </Animated.View>
          </ReanimatedModule.View>
        </TouchableWithoutFeedback>
      ) : displayMessages.length === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ReanimatedModule.View style={[styles.emptyState, { paddingTop: topInset, opacity: contentFadeAnimTwo.value !== undefined ? contentFadeAnimTwo.value : 1 }, contentPaddingAnimatedStyle]}>
          </ReanimatedModule.View>
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
              initialScrollIndex={Math.max(0, displayMessages.length - 1)}
              maintainScrollAtEnd
              onStartReached={() => {handleLoadMore()}}
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
            value={inputText}
            onChangeText={setInputText}
          />
        </View>
      </ReanimatedModule.View>

      {/* Retry options modal */}
      <Modal
        visible={retryOptionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRetryOptionsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setRetryOptionsVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.retryCard}>
                <Text style={styles.retryTitle}>Retry response</Text>
                <Pressable style={styles.retryOption} onPress={() => handleRetrySubmit('concise')} android_ripple={{ color: 'rgba(255,255,255,0.1)' }}>
                  <Text style={styles.retryOptionText}>Concise response</Text>
                </Pressable>
                <Pressable style={styles.retryOption} onPress={() => handleRetrySubmit('detailed')} android_ripple={{ color: 'rgba(255,255,255,0.1)' }}>
                  <Text style={styles.retryOptionText}>Detailed response</Text>
                </Pressable>
                <Pressable
                  style={[styles.retryOption, styles.retryOptionLast]}
                  onPress={() => {
                    setRetryOptionsVisible(false);
                    setRetryReasonVisible(true);
                  }}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                >
                  <Text style={styles.retryOptionText}>Other (give reason)</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Retry reason modal */}
      <InputModal
        visible={retryReasonVisible}
        title="Why retry?"
        fields={[{ key: 'reason', label: 'Reason', placeholder: 'Explain what to fix', value: retryReason, multiline: true, required: true }]}
        submitText="Send"
        onSubmit={(values) => handleRetrySubmit('other', values.reason)}
        onCancel={() => {
          setRetryReasonVisible(false);
          setRetryReason('');
        }}
      />

      {/* Metadata context menu */}
      <ContextMenuFixed
        visible={metadataMenu.visible}
        onClose={() => setMetadataMenu({ visible: false, message: null, position: null })}
        sessionName="Response metadata"
        position={metadataMenu.position ? {
          // Position near the button - if button is in lower half of screen, show above it
          top: metadataMenu.position.y > 400 ? undefined : metadataMenu.position.y + 80,
          bottom: metadataMenu.position.y > 400 ? (Dimensions.get('window').height - metadataMenu.position.y + -38) : undefined,
          left: 16,
        } : { top: 100, left: 16 }}
        options={[
          { 
            label: `Model: ${metadataMenu.message?.model || metadataMenu.message?.model_id || 'Unknown'}`, 
            icon: 'information-circle-outline', 
            onPress: () => {} 
          },
          { 
            label: `Provider: ${metadataMenu.message?.provider || 'Unknown'}`, 
            icon: 'server-outline', 
            onPress: () => {} 
          },
          { 
            label: `Input tokens: ${metadataMenu.message?.usage?.inputTokens ?? metadataMenu.message?.usage?.prompt_tokens ?? 'N/A'}`, 
            icon: 'arrow-down-circle-outline', 
            onPress: () => {} 
          },
          { 
            label: `Output tokens: ${metadataMenu.message?.usage?.outputTokens ?? metadataMenu.message?.usage?.completion_tokens ?? 'N/A'}`, 
            icon: 'arrow-up-circle-outline', 
            onPress: () => {} 
          },
          { 
            label: `Total tokens: ${metadataMenu.message?.usage?.totalTokens ?? metadataMenu.message?.usage?.total_tokens ?? 'N/A'}`, 
            icon: 'analytics-outline', 
            onPress: () => {} 
          },
          { 
            label: `Cost: ${metadataMenu.message?.usage?.cost || metadataMenu.message?.cost ? `$${(metadataMenu.message?.usage?.cost || metadataMenu.message?.cost).toFixed(6)}` : 'N/A'}`, 
            icon: 'cash-outline', 
            onPress: () => {} 
          },
        ]}
      />
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  retryCard: {
    width: '100%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  retryTitle: {
    color: COLORS.fg,
    fontSize: 17,
    fontFamily: FONTS.display,
    marginBottom: 8,
  },
  retryOption: {
    paddingVertical: 12,
  },
  retryOptionLast: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  retryOptionText: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
});
