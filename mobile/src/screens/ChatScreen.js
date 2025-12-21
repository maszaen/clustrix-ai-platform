import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, Text, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Animated, Dimensions, Modal, Pressable, ScrollView, InteractionManager } from 'react-native';
import ReanimatedModule, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { LegendList } from '@legendapp/list';
import { Ionicons } from '@expo/vector-icons';
import { Info, Server, ArrowDownCircle, ArrowUpCircle, BarChart3, DollarSign } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { streamChat, generateTitle, buildSystemPrompt } from '../services/api';
import { streamAgenticChat, streamImageGenChat } from '../services/agenticTools';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import ContextMenuFixed from '../components/ContextMenuFixed';
import InputModal from '../components/InputModal';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors'; 
import { FONTS } from '../constants/fonts';
import { DIAMOND_LOGO_HTML } from '../constants/strings';

// PERF: Debug flag - set to false in production to disable all debug logs
// This prevents console.log overhead during streaming
const __DEV_DEBUG__ = false;
const log = __DEV_DEBUG__ ? console.log : () => {};


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

const ChatScreen = memo(function ChatScreen({ topInset = 0, sidebarOpen = false, onShowThinking, onStreamingThinking, onSelectText, onOpenAttachmentModal, onImagePress, chatInputRef }) {
  const { 
    currentSession, 
    messages, 
    settings, 
    isStreaming,
    setIsStreaming,
    createSession,
    appendMessage,
    updateSession,
    updateSettings,
    setMessageMetadata,
    removeMessage,
    deleteSession,
    welcomeMessage,
    splashComplete,
    loadDraft,
    persistDraft,
    clearDraft,
    loadWelcomeDraft,
    saveWelcomeDraft,
    isLoadingSession,
    expectedMessageCount,
    providerApiKeys,
    // Pagination from context
    hasMoreMessages,
    loadMoreMessages,
    isLoadingMore,
  } = useApp();
  const flatListRef = useRef(null);
  // Use passed chatInputRef if available, otherwise create local ref
  const localChatInputRef = useRef(null);
  const inputRef = chatInputRef || localChatInputRef;
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [newMessageId, setNewMessageId] = useState(null);
  const [streamingMessageId, setStreamingMessageId] = useState(null); // Stable ID for streaming message to prevent blink
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [attachmentCount, setAttachmentCount] = useState(0); // Track attachment count for layout adjustments
  const [inputExtraHeight, setInputExtraHeight] = useState(0); // Track multiline input expansion
  const [pillCount, setPillCount] = useState(0); // Track pills count for layout adjustments
  // Pagination is now handled by context (hasMoreMessages, loadMoreMessages, isLoadingMore)
  const loadingTimeoutRef = useRef(null);
  const [inputText, setInputText] = useState('');
  const [retryTarget, setRetryTarget] = useState(null);
  const [retryOptionsVisible, setRetryOptionsVisible] = useState(false);
  const [retryReasonVisible, setRetryReasonVisible] = useState(false);
  const [retryReason, setRetryReason] = useState('');
  const [metadataMenu, setMetadataMenu] = useState({ visible: false, message: null, position: null });
  const [toolStatus, setToolStatus] = useState(null); // { name, commentary } - for tool execution indicator
  const [isWaitingForIteration, setIsWaitingForIteration] = useState(false); // True when waiting for next agentic iteration
  const lastHapticTime = useRef(0);

  // Memoized toggle handler for ChatInput
  const handleToggleAgentic = useCallback(() => {
    updateSettings({ agenticMode: !settings.agenticMode });
  }, [updateSettings, settings.agenticMode]);

  const handleToggleGenerateImage = useCallback(() => {
    updateSettings({ generateImage: !settings.generateImage });
  }, [updateSettings, settings.generateImage]);

  // Sync Pills imperatively to prevent re-render glitches
  useEffect(() => {
    inputRef.current?.setPillState('agentic', settings.agenticMode);
    inputRef.current?.setPillState('generate_image', settings.generateImage);
  }, [settings.agenticMode, settings.generateImage]);

  const isInitialLoad = useRef(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const contentFadeAnim = useRef(new Animated.Value(1)).current;
  const contentFadeAnimTwo = useRef(new Animated.Value(0)).current;
  const skeletonTimeoutRef = useRef(null);
  const prevSessionIdRef = useRef(currentSession?.id);
  const isSendingFromWelcome = useRef(false);
  const abortControllerRef = useRef(null);
  const lastCreatedSessionId = useRef(null);
  const shouldScrollOnSizeChange = useRef(false); // Flag: scroll to bottom on every content size change
  const itemHeights = useRef({});
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
  
  // Dismiss chat input keyboard when sidebar opens (to avoid conflict with search bar)
  useEffect(() => {
    if (sidebarOpen) {
      Keyboard.dismiss();
    }
  }, [sidebarOpen]);
  
  // Smooth keyboard animation for INPUT ONLY using react-native-keyboard-controller
  const { height: keyboardAnimatedHeight } = useReanimatedKeyboardAnimation();
  const inputAnimatedStyle = useAnimatedStyle(() => {
    // Skip animation when sidebar is open (search bar focused - don't move chat input)
    if (sidebarOpen) {
      return { transform: [{ translateY: 0 }] };
    }
    // Proportional offset - reduce movement by ~10% for tighter keyboard gap
    // height.value goes from 0 (closed) to negative (open, e.g. -300)
    // This smoothly scales with keyboard height
    const offset = -keyboardAnimatedHeight.value * 0.05;
    return {
      transform: [{ translateY: keyboardAnimatedHeight.value + offset }],
    };
  });
  
  // Animated paddingBottom for content area (welcome screen only)
  const contentPaddingAnimatedStyle = useAnimatedStyle(() => {
    // Skip keyboard padding when sidebar is open or animating open
    if (sidebarOpen) {
      return { paddingBottom: 85 };
    }
    // Convert negative keyboard height to positive padding
    const paddingValue = -keyboardAnimatedHeight.value;
    return {
      paddingBottom: paddingValue > 0 ? paddingValue + 75 : 85,
    };
  });
  
  // Fade in/out scroll button with auto-hide

  // Fade in/out scroll button with auto-hide
  // NOTE: Moved state update OUTSIDE of this effect to prevent infinite loop
  useEffect(() => {
    if (scrollButtonVisible && !keyboardVisible) {
      // Fade in
      Animated.timing(scrollBtnOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      // Auto-hide after 3 seconds - use ref to track visibility instead of setState
      if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
      autoHideTimeoutRef.current = setTimeout(() => {
        Animated.timing(scrollBtnOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
        // Use InteractionManager to batch state update after animation
        InteractionManager.runAfterInteractions(() => {
          setScrollButtonVisible(false);
        });
      }, 3000);
    } else if (!scrollButtonVisible) {
      // Only fade out if button is not visible (prevents re-triggering)
      Animated.timing(scrollBtnOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    
    return () => {
      if (autoHideTimeoutRef.current) clearTimeout(autoHideTimeoutRef.current);
    };
  }, [scrollButtonVisible, keyboardVisible]); // Removed scrollBtnOpacity from deps - it's a ref

  // Spacer visibility management - simpler approach
  // Show spacer when streaming starts, hide when stream ends AND user scrolls up
  // Skip spacer if content is less than 90% of viewport
  // NOTE: Removed showSpacer from deps to prevent infinite loop - use functional setState instead
  useEffect(() => {
    if (isStreaming) {
      // Check if content is small enough to not need spacer
      // Content height without spacer vs 90% of layout height
      // Use ref to get current spacer state without adding to deps
      setShowSpacer(currentShowSpacer => {
        const contentWithoutSpacer = listContentHeight - (currentShowSpacer ? SPACER_HEIGHT : 0);
        const viewportThreshold = listLayoutHeight * 0.9;
        
        if (contentWithoutSpacer < viewportThreshold && listLayoutHeight > 0) {
          // Content is small, no spacer needed
          streamEndedRef.current = false;
          return false;
        } else {
          // Stream started - show spacer
          streamEndedRef.current = false;
          return true;
        }
      });
    } else {
      // Stream ended - check if we should hide spacer
      setShowSpacer(currentShowSpacer => {
        if (streamEndedRef.current === false && currentShowSpacer) {
          // Stream just ended
          streamEndedRef.current = true;
          // If user is NOT near bottom, hide spacer immediately
          if (!isNearBottomRef.current) {
            return false;
          }
        }
        // Keep current state
        return currentShowSpacer;
      });
    }
  }, [isStreaming, listContentHeight, listLayoutHeight]); // Removed showSpacer from deps

  // React to isLoadingSession - show skeleton and enable scroll-on-size-change
  useEffect(() => {
    if (isLoadingSession) {
      // Show skeleton immediately
      setShowSkeleton(true);
      skeletonOpacity.setValue(1);
      // Enable scroll on every content size change while loading
      shouldScrollOnSizeChange.current = true;
    }
  }, [isLoadingSession, skeletonOpacity]);

  // When all messages loaded AND at bottom, disable scroll flag and hide skeleton
  // NOTE: Added proper cleanup for interval/timeout to prevent memory leaks and potential loops
  useEffect(() => {
    let intervalId = null;
    let timeoutId = null;
    let isMounted = true;
    
    // Helper to hide skeleton with animation - prevents setState on unmounted component
    const hideSkeleton = () => {
      if (!isMounted) return;
      shouldScrollOnSizeChange.current = false;
      Animated.timing(skeletonOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        if (isMounted) setShowSkeleton(false);
      });
    };
    
    // Guard: only run when we have expected data and it matches loaded data
    if (
      showSkeleton && 
      !isLoadingSession && 
      expectedMessageCount > 0 && 
      messages.length === expectedMessageCount
    ) {
      // All data loaded!
      
      // Case 1: List already rendered (session->session) - listContentHeight > 0
      // Check immediately and poll if needed
      if (listContentHeight > 0) {
        const checkAndHide = () => {
          if (!isMounted) return true;
          flatListRef.current?.scrollToEnd({ animated: false });
          if (isNearBottomRef.current) {
            hideSkeleton();
            return true;
          }
          return false;
        };
        
        if (!checkAndHide()) {
          intervalId = setInterval(() => {
            if (checkAndHide()) {
              if (intervalId) clearInterval(intervalId);
              intervalId = null;
            }
          }, 50);
          
          timeoutId = setTimeout(() => {
            if (intervalId) clearInterval(intervalId);
            hideSkeleton();
          }, 2000);
        }
      } else {
        // Case 2: List NOT rendered yet (welcome->session) - listContentHeight === 0
        // Don't wait for list, hide after short delay to let it mount and render
        timeoutId = setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
          hideSkeleton();
        }, 300);
      }
    }
    
    // Handle going back to welcome (no messages expected)
    if (showSkeleton && !isLoadingSession && expectedMessageCount === 0 && !currentSession) {
      hideSkeleton();
    }
    
    // Handle navigating to existing session with 0 messages (empty session)
    // This catches welcome->session sidebar navigation where session exists but is empty
    if (showSkeleton && !isLoadingSession && expectedMessageCount === 0 && currentSession && messages.length === 0) {
      hideSkeleton();
    }
    
    // Cleanup function - CRITICAL to prevent infinite loops on fast re-renders
    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [showSkeleton, isLoadingSession, expectedMessageCount, messages.length, listContentHeight, currentSession, skeletonOpacity]);

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
      
      // Reset flags for sidebar transitions (pagination is handled by context)
      isInitialLoad.current = true;
      hasScrolledInitial.current = false;
      initialScrollDone.current = false;
    }

    if (isSessionToSession && !sendingFromWelcome) {
      // NOTE: Skeleton hide is controlled by separate useEffect that waits for all messages to load
      setShowSkeleton(true);
      skeletonOpacity.setValue(1);
      shouldScrollOnSizeChange.current = true;
    }

    if (isWelcomeToSession && !sendingFromWelcome) {
      // Rule 1: Welcome -> Session via Sidebar (WITH Skeleton)
      // NOTE: Skeleton hide is controlled by separate useEffect that waits for all messages to load
      setShowSkeleton(true);
      skeletonOpacity.setValue(1);
      shouldScrollOnSizeChange.current = true;
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
    } else if (!isWelcomeToSession && !sendingFromWelcome) {
      // Session to session transition (via sidebar) - fade animation
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(contentFadeAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(contentFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(contentFadeAnimTwo, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();
      }, 50);
    } 
    // sendingFromWelcome = true: skip all fade animations
    
    
    prevSessionIdRef.current = currentSession?.id;
    
    return () => {
      if (skeletonTimeoutRef.current) clearTimeout(skeletonTimeoutRef.current);
    };
  }, [currentSession?.id, skeletonOpacity]);

  // No auto-scroll during streaming - inverted FlatList handles it naturally
  // Content expands upward, user stays at bottom

  // Haptic feedback disabled - user preference
  const triggerHaptic = useCallback(() => {
    // Disabled: Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

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

  const handleSend = useCallback(async (text, attachments = []) => {
    // DEBUG: Log attachments received
    log('[handleSend] text:', text.substring(0, 50), 'attachments:', attachments.length);
    log('[handleSend] attachments detail:', attachments.map(a => ({ type: a.type, name: a.name, hasBase64: !!a.base64, hasTextContent: !!a.textContent })));
    
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
    
    // Set newMessageId with the EXACT format that _key uses
    // Format: msg-<full sessionId>-<message_index>-<role>
    const sessionIdPart = isNewSession ? session.id : (currentSession?.id || 'x');
    const newMsgKey = `msg-${sessionIdPart}-${userMessageIndex}-user`;
    setNewMessageId(newMsgKey);
    
    // Prepare attachment metadata for storage (exclude large base64 for DB storage)
    const attachmentMeta = attachments.map(a => ({
      type: a.type,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      width: a.width,
      height: a.height,
      // Store URI for display, but not base64 (too large for DB)
      uri: a.uri,
      // Include textContent for text files so AI can read them
      textContent: a.textContent,
    }));
    
    // DEBUG: Log attachmentMeta
    log('[handleSend] attachmentMeta:', attachmentMeta.length, attachmentMeta.map(a => ({ type: a.type, name: a.name })));
    // For new session from welcome screen, pass session directly to appendMessage
    if (isNewSession) {
      await appendMessage('user', text, { 
        _messageIndex: 0,
        attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
      }, session);
    } else {
      await appendMessage('user', text, {
        attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
      });
    }
    
    // Scroll to bottom
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    setTimeout(() => setNewMessageId(null), 500);
    
    // Build system prompt with persona settings
    const systemPrompt = buildSystemPrompt(settings);
    
    // Build user message with attachments for API (include base64 for vision)
    const userMessageWithAttachments = {
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
    
    // For new session, messages state is empty, so just use the user message
    const apiMessages = isNewSession 
      ? [{ role: 'system', content: systemPrompt }, userMessageWithAttachments]
      : [
          { role: 'system', content: systemPrompt }, 
          ...messages.map(m => ({ role: m.role, content: m.content, attachments: m.attachments })), 
          userMessageWithAttachments
        ];

    setIsStreaming(true);
    setStreamingContent('');
    setThinkingContent('');
    
    // Generate stable ID for this streaming message (prevents blink on save)
    const stableStreamingId = `streaming-${Date.now()}`;
    setStreamingMessageId(stableStreamingId);

    let fullContent = '';
    let fullThinking = '';
    let thinkStartTime = null;

    // Abort previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;

    // Store tool results for this message
    let toolResults = [];
    
    // Store Perplexity search results (built-in web search)
    let perplexitySearchResults = null;
    
    // Handler for Perplexity search results
    const handleSearchResults = (results) => {
      perplexitySearchResults = results;
    };

    // Common callbacks
    const handleChunk = (chunk) => {
      // Reset waiting state when new content arrives
      setIsWaitingForIteration(false);
      fullContent += chunk;
      setStreamingContent(fullContent);
      triggerHaptic();
    };

    const handleThink = (think) => {
      if (!thinkStartTime && think) {
        thinkStartTime = Date.now();
      }
      fullThinking += think;
      setThinkingContent(fullThinking);
      onStreamingThinking?.(fullThinking);
    };

    const handleDone = async (summary = {}) => {
      setToolStatus(null);
      setIsWaitingForIteration(false);
      
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
      const thinkDuration = thinkStartTime ? Math.round((Date.now() - thinkStartTime) / 1000) : null;

      const metadata = {
        model: settings.model,
        provider: settings.provider,
        thinkContent: fullThinking || null,
        thinkDuration: thinkDuration,
        _streamingId: stableStreamingId,
        usage: summary?.usage || null,
        cost: summary?.usage?.cost ?? null,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        // Perplexity search results (built-in web search)
        perplexityResults: summary?.searchResults || perplexitySearchResults || null,
      };

      if (isNewSession) {
        await appendMessage('assistant', content, { ...metadata, _messageIndex: 1 }, session);
      } else {
        await appendMessage('assistant', content, metadata);
      }

      setIsStreaming(false);
      setStreamingContent('');
      setThinkingContent('');
      setStreamingMessageId(null);

      if (isNewSession) {
        const title = await generateTitle(text, settings.model, settings.provider, settings.baseUrl, settings.apiKey);
        await updateSession({ name: title }, session);
      }
    };

    const handleError = async (error) => {
      setToolStatus(null);
      setIsStreaming(false);
      
      const errorMessage = `\n\n**Error:** ${error.message || error}`;
      const finalContent = fullThinking 
         ? `<thinking>${fullThinking}</thinking>\n\n${fullContent}${errorMessage}`
         : `${fullContent}${errorMessage}`;

      const metadata = {
        error: true,
        thinkContent: fullThinking || null,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
      };

      if (isNewSession) {
        await appendMessage('assistant', finalContent, { ...metadata, _messageIndex: 1 }, session);
      } else {
        await appendMessage('assistant', finalContent, metadata);
      }

      setStreamingContent('');
      setThinkingContent('');
      setStreamingMessageId(null);
    };

    const handleToolCall = (toolCall) => {
      setToolStatus({ name: toolCall.name, commentary: toolCall.commentary });
    };

    const handleToolResult = (result) => {
      toolResults.push({
        id: result.id,
        name: result.name,
        success: result.success,
        data: result.data,
        input: result.input,
        output: result.output,
      });
      setToolStatus(null);
      // Show loader while waiting for next iteration
      setIsWaitingForIteration(true);
    };

    // Choose streaming function based on mode
    // Note: Perplexity has built-in web search, skip agentic mode
    const isPerplexity = (settings.provider || '').toLowerCase() === 'perplexity';
    
    if (settings.agenticMode && !isPerplexity) {
      // Web Search mode (skip for Perplexity - has built-in search)
      await streamAgenticChat({
        signal: ac.signal,
        messages: apiMessages,
        model: settings.model,
        provider: settings.provider,
        baseUrl: settings.baseUrl || undefined,
        apiKey: settings.apiKey,
        agenticConfig: settings.agenticTools,
        onChunk: handleChunk,
        onThink: handleThink,
        onToolCall: handleToolCall,
        onToolResult: handleToolResult,
        onDone: handleDone,
        onError: handleError,
      });
    } else if (settings.generateImage) {
      // Image Generation mode - uses user's current provider only
      await streamImageGenChat({
        signal: ac.signal,
        messages: apiMessages,
        model: settings.model,
        provider: settings.provider,
        baseUrl: settings.baseUrl || undefined,
        apiKey: settings.apiKey,
        imageModel: settings.imageModel || 'auto',
        onChunk: handleChunk,
        onThink: handleThink,
        onToolCall: handleToolCall,
        onToolResult: handleToolResult,
        onDone: handleDone,
        onError: handleError,
      });
    } else {
      // Normal chat mode (includes Perplexity with built-in web search)
      await streamChat({
        signal: ac.signal,
        messages: apiMessages,
        model: settings.model,
        provider: settings.provider,
        baseUrl: settings.baseUrl || undefined,
        apiKey: settings.apiKey,
        onChunk: handleChunk,
        onThink: handleThink,
        onDone: handleDone,
        onError: handleError,
        onSearchResults: handleSearchResults, // Perplexity built-in search
      });
    }
  }, [currentSession, clearDraft, saveWelcomeDraft, messages, createSession, appendMessage, settings, removeMessage, updateSession, setIsStreaming, setStreamingContent, setThinkingContent, setStreamingMessageId, setInputText, setNewMessageId, onStreamingThinking, triggerHaptic]);

  const handleStop = async () => {
    // 1. Abort network request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 2. Clear visual streaming state
    setIsStreaming(false);
    setStreamingContent('');
    setThinkingContent('');
    setStreamingMessageId(null);

    // 3. Restore last user message to input and delete from chat
    // Ensure we have messages and the last one is from user (it should be, AI is not added yet)
    if (messages.length > 0 && currentSession?.id) {
      const lastMsg = messages[messages.length - 1];
      
      if (lastMsg.role === 'user') {
        // Restore text
        if (inputRef.current) {
          inputRef.current.setValue(lastMsg.content || '');
          
          // Restore attachments if any
          if (lastMsg.attachments && lastMsg.attachments.length > 0) {
            // Clear current attachments first (should be empty anyway)
            inputRef.current.clearAttachments();
            
            // Remap attachments ensuring they have IDs
            const restoredAttachments = lastMsg.attachments.map((a, i) => ({
              ...a,
              id: Date.now() + i // Generate fresh temp IDs
            }));
            
            inputRef.current.addAttachments(restoredAttachments);
          }
        }
        
        // Cleanup: remove message or delete session if it's the first message
        if (messages.length === 1) {
          // If this was the first message (Start of session), delete the whole session
          // This cancels the "Start Chat" action and returns to Welcome
          await deleteSession(currentSession.id);
        } else {
          // Remove from database and state
          await removeMessage(currentSession.id, lastMsg.message_index);
        }
      }
    }
  };

  // Retrieve preceding user prompt for retry injection
  // Searches by ARRAY POSITION (backwards from AI message), not message_index
  // This handles cases where message_index might be duplicate due to race conditions
  const getUserPromptForMessage = useCallback((aiMessage) => {
    if (!aiMessage) {
      log('[getUserPromptForMessage] No message provided');
      return '';
    }
    
    log('[getUserPromptForMessage] Looking for user message before AI:', aiMessage.content?.substring(0, 30));
    
    // Find this AI message's position in the array
    const aiPos = messages.findIndex(m => 
      m.role === 'assistant' && 
      m.content === aiMessage.content
    );
    
    log('[getUserPromptForMessage] AI message found at array position:', aiPos);
    
    if (aiPos <= 0) {
      log('[getUserPromptForMessage] AI at position 0 or not found, no user message before');
      return '';
    }
    
    // Look backwards from AI position to find the first user message
    for (let i = aiPos - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        log('[getUserPromptForMessage] Found user message at position:', i, 'content:', messages[i].content?.substring(0, 50));
        return messages[i].content || '';
      }
    }
    
    log('[getUserPromptForMessage] No user message found before AI');
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
      log('[Retry] Aborted: no retryTarget or currentSession');
      return;
    }
    
    const pickedResponse = retryTarget.content || '';
    
    // Find AI message position in array (NOT message_index!)
    const aiArrayPos = messages.findIndex(m => 
      m.role === 'assistant' && m.content === retryTarget.content
    );
    
    log('[Retry] AI message array position:', aiArrayPos);
    log('[Retry] Mode:', mode);
    log('[Retry] Messages count before:', messages.length);
    log('[Retry] Messages:', messages.map((m, i) => ({ pos: i, role: m.role, index: m.message_index, content: m.content?.substring(0, 30) })));
    
    if (aiArrayPos < 0) {
      log('[Retry] AI message not found in array!');
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
    
    log('[Retry] User message array position:', userArrayPos);
    log('[Retry] Found userPrompt:', userPrompt?.substring(0, 100));
    
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
    log('[Retry] Injected prompt:', injectedUserPrompt.substring(0, 150));

    // Close modals and clear state
    setRetryOptionsVisible(false);
    setRetryReasonVisible(false);
    setRetryReason('');
    setRetryTarget(null);

    // SNAPSHOT messages BEFORE any state changes
    const messagesSnapshot = [...messages];
    log('[Retry] Snapshot count:', messagesSnapshot.length);

    // Get the message_index of the AI we want to delete (for DB deletion)
    // Pass role and content for precise state filtering (handles duplicate indexes)
    const aiMessageIndex = retryTarget.message_index;
    const aiContent = retryTarget.content;
    
    // Delete from DB and state (with precise matching using role + content)
    log('[Retry] Deleting AI message with message_index:', aiMessageIndex, 'role: assistant');
    await removeMessage(currentSession.id, aiMessageIndex, 'assistant', aiContent);
    
    // Scroll to bottom
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    // Build system prompt (sama seperti handleSend)
    const systemPrompt = buildSystemPrompt(settings);
    
    // Build API messages dari snapshot using ARRAY POSITION:
    // - Include all messages BEFORE the AI (by array position)
    // - Replace the user message (by array position) with injected prompt
    const filteredMessages = messagesSnapshot.slice(0, aiArrayPos); // Everything before AI
    log('[Retry] Filtered messages for API (before AI at pos', aiArrayPos, '):', 
      filteredMessages.map((m, i) => ({ pos: i, role: m.role })));
    
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...filteredMessages.map((m, idx) => {
        // Replace the user message that triggered the response with injected version
        if (idx === userArrayPos) {
          log('[Retry] Replacing user message at array pos', idx, 'with injected prompt');
          return { role: 'user', content: injectedUserPrompt };
        }
        return { role: m.role, content: m.content };
      })
    ];

    log('[Retry] Final API messages count:', apiMessages.length);
    log('[Retry] API messages summary:', apiMessages.map(m => ({ role: m.role, contentLen: m.content?.length })));

    // Start streaming - SAMA PERSIS seperti handleSend
    setIsStreaming(true);
    setStreamingContent('');
    setThinkingContent('');
    
    const stableStreamingId = `streaming-retry-${Date.now()}`;
    setStreamingMessageId(stableStreamingId);
    log('[Retry] Streaming started with ID:', stableStreamingId);

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
          log('[Retry] Thinking started');
        }
        // Append thinking content
        fullThinking += think;
        setThinkingContent(fullThinking);
        onStreamingThinking?.(fullThinking);
      },
      onDone: async (summary = {}) => {
        log('[Retry] Stream done, fullContent length:', fullContent.length, 'fullThinking length:', fullThinking.length);
        
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
        log('[Retry] Appending new AI response');
        await appendMessage('assistant', content, metadata);

        // Clear streaming states
        setIsStreaming(false);
        setStreamingContent('');
        setThinkingContent('');
        setStreamingMessageId(null);
        log('[Retry] Complete!');
      },
      onError: async (error) => {
        log('[Retry] Error:', error);
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

  // PERF: useCallback to prevent renderMessage recreation on every render
  // This is critical for LegendList/FlatList performance during streaming
  const renderMessage = useCallback(({ item }) => (
    <ChatMessage
      message={item}
      isUser={item.role === 'user'}
      isNew={item._key === newMessageId}
      onShowThinking={onShowThinking}
      onRetry={item.isLastAiMessage ? () => handleRetryModal(item) : null}
      onSelectText={onSelectText}
      onReact={(liked) => handleReaction(item, liked)}
      onShowMetadata={(msg, pos) => handleMetadataOpen(msg || item, pos)}
      onImagePress={onImagePress}
    />
  ), [newMessageId, onShowThinking, onSelectText, onImagePress, handleRetryModal, handleReaction, handleMetadataOpen]);

  // Messages are already paginated from context - just add keys
  // Key must be STABLE across prepends - use message_index only (not array index!)
  // Array index changes when prepending, causing LegendList to think items are new
  // Use FULL session ID in key to prevent recycler confusion across sessions
  // ALSO use message.id as fallback for uniqueness when message_index might be duplicate
  const displayMessagesBase = useMemo(() => {
    const seen = new Set();
    return messages.map((m, idx) => {
      // Primary key format - use message.id if available for guaranteed uniqueness
      const uniqueId = m.id || `idx-${idx}`;
      const key = `msg-${currentSession?.id || 'x'}-${m.message_index}-${m.role}-${uniqueId}`;
      
      // Dedupe check (shouldn't happen, but safety)
      if (seen.has(key)) {
        console.warn('[ChatScreen] Duplicate key detected, adding suffix:', key);
        return { ...m, _key: `${key}-dup-${idx}` };
      }
      seen.add(key);
      return { ...m, _key: key };
    });
  }, [messages, currentSession?.id]);
  
  // Create mutable copy for streaming message push
  let displayMessages = [...displayMessagesBase];
  
  // Check if content exceeds viewport - 30px threshold
  const shouldHaveSpacer = listContentHeight >= (listLayoutHeight - 30);
  
  // Only show streaming message if we're actually streaming AND no saved assistant message exists yet
  // This prevents duplicate display during the brief state transition
  const lastMessage = displayMessages[displayMessages.length - 1];
  const alreadyHasSavedResponse = lastMessage?.role === 'assistant' && !lastMessage?.isStreaming;
  
  if ((streamingContent || isStreaming) && !alreadyHasSavedResponse) {
    // Key must be UNIQUE - use streamingMessageId for guaranteed uniqueness
    // This prevents any collision with saved messages
    const streamingIndex = messages.length;
    const sessionIdPart = currentSession?.id || 'x';
    displayMessages.push({
      _key: `msg-${sessionIdPart}-${streamingIndex}-assistant-streaming-${streamingMessageId || 'active'}`,
      role: 'assistant',
      content: thinkingContent ? `<thinking>${thinkingContent}</thinking>\n\n${streamingContent}` : streamingContent || (toolStatus ? '' : '...'),
      isStreaming: true,
      shouldHaveSpacer,
      toolStatus: toolStatus, // { name, commentary } for tool execution indicator
      isWaitingForIteration: isWaitingForIteration, // Show typewriter while waiting for next agentic iteration
    });
  }
  
  // Mark the last non-streaming AI message for retry button visibility
  // Retry is ONLY allowed on the last AI message (not messages in the middle)
  const lastAiIndex = displayMessages.reduce((lastIdx, msg, idx) => 
    (msg.role === 'assistant' && !msg.isStreaming) ? idx : lastIdx, -1);
  if (lastAiIndex >= 0) {
    displayMessages[lastAiIndex] = { ...displayMessages[lastAiIndex], isLastAiMessage: true };
  }
  
  // Normal order: oldest first, newest last

  // Load more messages when scroll to top
  const handleLoadMore = useCallback(async () => {
    // Guard: Already loading or no more data
    if (isLoadingMore || !hasMoreMessages) return;
    
    // Guard: Debounce
    if (loadingTimeoutRef.current) return;
    loadingTimeoutRef.current = 'pending';
    
    loadingTimeoutRef.current = setTimeout(async () => {
      await loadMoreMessages();
      loadingTimeoutRef.current = null;
    }, 150);
  }, [isLoadingMore, hasMoreMessages, loadMoreMessages]);

  // Find last AI message index for initial scroll
  const getLastAiIndex = useCallback(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (displayMessages[i].role === 'assistant') return i;
    }
    return displayMessages.length - 1;
  }, [displayMessages]);

  // DISABLED: useEffect scroll to last AI message - causes lag
  // Simpler approach: just scroll to end
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
  
  // Debounced scroll state handler - runs on JS thread but throttled
  const scrollStateTimeout = useRef(null);
  const handleScrollState = useCallback((offsetY, distanceFromBottom, nearBottom, contentHeight, layoutHeight) => {
    lastScrollOffset.current = offsetY;
    isNearBottomRef.current = nearBottom;
    
    // Hide spacer when scrolled up after stream ends
    if (streamEndedRef.current && showSpacer && !nearBottom) {
      setShowSpacer(false);
    }
    
    // Fast hide scroll button when near bottom
    if (scrollButtonVisible && nearBottom && !programmaticScrollRef.current) {
      setScrollButtonVisible(false);
    }
    
    // Debounced show button - show when scrolled away from bottom
    const isScrollable = contentHeight > layoutHeight;
    const shouldShow = isScrollable && !nearBottom;
    
    scrollPositionRef.current.showButton = shouldShow;
    scrollPositionRef.current.isScrolling = true;
    
    if (scrollStateTimeout.current) clearTimeout(scrollStateTimeout.current);
    scrollStateTimeout.current = setTimeout(() => {
      scrollPositionRef.current.isScrolling = false;
      if (!programmaticScrollRef.current && scrollPositionRef.current.showButton) {
        setScrollButtonVisible(true);
      }
      programmaticScrollRef.current = false;
    }, 200);
  }, [showSpacer, scrollButtonVisible]);
  
  // Header component for load more (appears at TOP)
  const ListHeader = useCallback(() => {
    if (!hasMoreMessages) return null;
    return (
      <TouchableWithoutFeedback onPress={handleLoadMore}>
        <View style={styles.loadMoreContainer}>
          {isLoadingMore ? (
            <>
              <ActivityIndicator size="small" color={COLORS.fgMuted} />
              <Text style={styles.loadMoreText}>Loading</Text>
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
  }, [hasMoreMessages, isLoadingMore, handleLoadMore]);

  // Footer component for bottom spacing (appears at BOTTOM)
  // Simpler approach: fixed size during stream, conditional removal based on visibility
  const ATTACHMENT_EXTRA_HEIGHT = 150; // Increased to match new preview size (129 + margins) // Extra space when attachments are shown
  const PILL_EXTRA_HEIGHT = 48; // Match AGENTIC_SECTION_HEIGHT in ChatInput
  const ListFooter = useCallback(() => {
    const dynamicOffset = (attachmentCount > 0 ? ATTACHMENT_EXTRA_HEIGHT : 0) + (pillCount > 0 ? PILL_EXTRA_HEIGHT : 0) + inputExtraHeight;
    // Show spacer during streaming OR if stream ended but user still near bottom
    if (showSpacer) {
      return <View style={{ height: SPACER_HEIGHT + dynamicOffset }} />;
    }
    // Default minimal footer for keyboard handling
    return <View style={{ height: (Platform.OS === 'android' ? keyboardHeight + 75 : 85) + dynamicOffset }} />;
  }, [showSpacer, keyboardHeight, attachmentCount, pillCount, inputExtraHeight]);

  const onItemLayout = useCallback((index, height) => {
  itemHeights.current[index] = height;
  }, []);

  // Calculate average
  const avgHeight = useMemo(() => {
    const heights = Object.values(itemHeights.current);
    if (heights.length === 0) return 440;
    return Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
  }, [itemHeights.current]);

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
        <>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ReanimatedModule.View style={[styles.emptyState, { paddingTop: topInset, opacity: contentFadeAnimTwo.value !== undefined ? contentFadeAnimTwo.value : 1 }, contentPaddingAnimatedStyle]}>
            </ReanimatedModule.View>
          </TouchableWithoutFeedback>
          {/* Skeleton for Welcome->Session transition (before messages load) */}
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
      ) : (
        <>
          <Animated.View style={{ flex: 1, opacity: contentFadeAnim }}>
              <LegendList
                key={currentSession?.id || 'welcome'}  // Force remount on session change to reset recycled state
                ref={flatListRef}
                data={displayMessages}
                keyExtractor={(item) => item._key}
                renderItem={renderMessage}
                estimatedItemSize={avgHeight}
                recycleItems={true}
                drawDistance={5000}  // Increased for smoother pre-rendering of long sessions
                initialScrollIndex={displayMessages.length > 0 ? displayMessages.length - 1 : undefined}  // Start at bottom
                maintainScrollAtEnd
                maintainScrollAtEndThreshold={0.02}
                onStartReached={() => {handleLoadMore()}}
                onStartReachedThreshold={0.02}
                ListHeaderComponent={ListHeader}
                ListFooterComponent={ListFooter}
                contentContainerStyle={{ paddingLeft: 0, paddingTop: topInset + 66 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                maintainVisibleContentPosition={true}
                waitForInitialLayout={true}
                onContentSizeChange={(w, h) => {
                  setListContentHeight(h);
                  lastContentHeight.current = h;
                  
                  // Scroll to bottom on every size change while loading from sidebar
                  if (shouldScrollOnSizeChange.current) {
                    flatListRef.current?.scrollToEnd({ animated: false });
                  }
                }}
                onLayout={(e) => {
                  setListLayoutHeight(e.nativeEvent.layout.height);
                  lastLayoutHeight.current = e.nativeEvent.layout.height;
                }}
                onScroll={(e) => {
                  // Simple scroll handler - calls debounced state handler
                  const contentOffset = e.nativeEvent?.contentOffset || { x: 0, y: 0 };
                  const contentSize = e.nativeEvent?.contentSize || { width: 0, height: 0 };
                  const layoutMeasurement = e.nativeEvent?.layoutMeasurement || { width: 0, height: 0 };
                  
                  if (layoutMeasurement.height === 0) return;
                  
                  // Calculate distance from bottom (normal list)
                  const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
                  const nearBottom = distanceFromBottom < 400;
                  
                  handleScrollState(contentOffset.y, distanceFromBottom, nearBottom, contentSize.height, layoutMeasurement.height);
                }}
                scrollEventThrottle={16}
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
            bottom: 85 + (attachmentCount > 0 ? ATTACHMENT_EXTRA_HEIGHT : 0) + (pillCount > 0 ? PILL_EXTRA_HEIGHT : 0) + inputExtraHeight,
            opacity: scrollBtnOpacity,
          }]}
        >
          <Pressable
            onPress={() => {
              if (!scrollButtonVisible) return; // Guard against ghost taps
              programmaticScrollRef.current = true;
              
              // Scroll to bottom (normal list)
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
            ref={inputRef}
            onSend={handleSend}
            isStreaming={isStreaming}
            onStop={handleStop}
            placeholder={!currentSession && messages.length === 0 ? 'How can I help you today?' : 'Reply...'}
            value={inputText}
            onChangeText={setInputText}
            onOpenAttachmentModal={onOpenAttachmentModal}
            onAttachmentsChange={setAttachmentCount}
            onInputHeightChange={setInputExtraHeight}
            onPillsChange={setPillCount}
            onToggleAgenticMode={handleToggleAgentic}
            onToggleGenerateImage={handleToggleGenerateImage}
          />
        </View>
      </ReanimatedModule.View>

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
            icon: Info, 
            onPress: () => {} 
          },
          { 
            label: `Provider: ${metadataMenu.message?.provider || 'Unknown'}`, 
            icon: Server, 
            onPress: () => {} 
          },
          { 
            label: `Input tokens: ${metadataMenu.message?.usage?.inputTokens ?? metadataMenu.message?.usage?.prompt_tokens ?? 'N/A'}`, 
            icon: ArrowDownCircle, 
            onPress: () => {} 
          },
          { 
            label: `Output tokens: ${metadataMenu.message?.usage?.outputTokens ?? metadataMenu.message?.usage?.completion_tokens ?? 'N/A'}`, 
            icon: ArrowUpCircle, 
            onPress: () => {} 
          },
          { 
            label: `Total tokens: ${metadataMenu.message?.usage?.totalTokens ?? metadataMenu.message?.usage?.total_tokens ?? 'N/A'}`, 
            icon: BarChart3, 
            onPress: () => {} 
          },
          { 
            label: `Cost: ${metadataMenu.message?.usage?.cost || metadataMenu.message?.cost ? `$${(metadataMenu.message?.usage?.cost || metadataMenu.message?.cost).toFixed(6)}` : 'N/A'}`, 
            icon: DollarSign, 
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
