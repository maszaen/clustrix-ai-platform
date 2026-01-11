import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { View, StyleSheet, Text, Platform, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Animated, Dimensions, Modal, Pressable, ScrollView, InteractionManager } from 'react-native';
import ReanimatedModule, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Info, Server, ArrowDownCircle, ArrowUpCircle, BarChart3, DollarSign, ListChevronsDownUp, ListChevronsUpDown, MessageCircleQuestion } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { streamChat, generateTitle, buildSystemPrompt } from '../services/api';
import { streamAgenticChat, streamImageGenChat } from '../services/agenticTools';
import { usePdfExtractor, isPdfUnsupportedError, convertExtractedPdfToAttachments } from '../services/pdfExtractor';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import ContextMenuFixed from '../components/ContextMenuFixed';
import InputModal from '../components/InputModal';
import AlertModal from '../components/AlertModal';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors'; 
import { FONTS } from '../constants/fonts';
import { DIAMOND_LOGO_HTML } from '../constants/strings';
import { DEFAULT_PROVIDERS_LIST } from '../constants/providers';

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

const ChatScreen = memo(function ChatScreen({ topInset = 0, sidebarOpen = false, sessionSelectTick = 0, onShowThinking, onStreamingThinking, onSelectText, onOpenAttachmentModal, onImagePress, chatInputRef, onOpenModels }) {
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
    customProviders,
    providerApiKeys,
    // Pagination from context
    hasMoreMessages,
    loadMoreMessages,
    isLoadingMore,
    currentUser, // Add currentUser
    accessToken, // Add accessToken
  } = useApp();
  const flatListRef = useRef(null);
  // Use passed chatInputRef if available, otherwise create local ref
  const localChatInputRef = useRef(null);
  const inputRef = chatInputRef || localChatInputRef;
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [newMessageId, setNewMessageId] = useState(null);
  const [streamingMessageId, setStreamingMessageId] = useState(null); // Stable ID for streaming message to prevent blink
  const [streamingMessageIndex, setStreamingMessageIndex] = useState(null); // Stable index for streaming message key - prevents key change during stream
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [attachmentCount, setAttachmentCount] = useState(0); // Track attachment count for layout adjustments
  const [inputExtraHeight, setInputExtraHeight] = useState(0); // Track multiline input expansion
  const [pillCount, setPillCount] = useState(0); // Track pills count for layout adjustments
  const footerMeasureKey = `footer-measure-${sessionSelectTick}`;
  const [measuredContentHeight, setMeasuredContentHeight] = useState(0);
  const measuredTotalHeightRef = useRef(0);

  // Track when session switch reset happened - used to detect if we need fallback height estimation
  const sessionSwitchPendingRef = useRef(false);

  // Recalculate list measurements when user selects a session (no list remount).
  useEffect(() => {
    setListContentHeight(0);
    setListLayoutHeight(0);
    lastContentHeight.current = 0;
    lastLayoutHeight.current = 0;
    itemHeights.current = {};
    measuredTotalHeightRef.current = 0;
    setMeasuredContentHeight(0);
    sessionSwitchPendingRef.current = true;
  }, [sessionSelectTick]);

  // Fallback height estimation after session switch.
  // FlashList's onContentSizeChange may not fire reliably for short lists.
  // When messages load after a session switch, compute an estimated height from message count.
  // This ensures the keyboard animation gate updates immediately without waiting for layout events.
  const ESTIMATED_ITEM_HEIGHT = 440; // Match FlashList's estimatedItemSize
  useEffect(() => {
    // Only run after a session switch and when messages have loaded
    if (!sessionSwitchPendingRef.current || messages.length === 0) return;
    
    // Wait a frame for FlashList to potentially fire its events first
    const timeoutId = setTimeout(() => {
      // If FlashList events haven't updated the heights yet, use estimation
      if (measuredContentHeight === 0 && listContentHeight === 0 && messages.length > 0) {
        // Calculate estimated total height from message count
        // Factor in: paddingTop (topInset + 66) and footer (~85)
        const estimatedHeight = messages.length * ESTIMATED_ITEM_HEIGHT;
        setMeasuredContentHeight(estimatedHeight);
        measuredTotalHeightRef.current = estimatedHeight;
        
        // Also try to capture layout height from screen dimensions if not set
        if (listLayoutHeight === 0) {
          const screenHeight = Dimensions.get('window').height - topInset - 85;
          setListLayoutHeight(screenHeight);
          lastLayoutHeight.current = screenHeight;
        }
      }
      sessionSwitchPendingRef.current = false;
    }, 150); // Small delay to let FlashList events fire first
    
    return () => clearTimeout(timeoutId);
  }, [messages.length, topInset, measuredContentHeight, listContentHeight, listLayoutHeight]);

  // Force FlashList to fire onScroll after remount to capture accurate dimensions.
  // This addresses the case where onContentSizeChange doesn't fire reliably for short lists.
  // By doing a tiny programmatic scroll and then scrolling back, we trigger the onScroll
  // event which has fallback logic to capture contentSize and layoutMeasurement.
  useEffect(() => {
    // Only run when FlashList remounts (listMountKey changes) and we have messages
    if (!listMountKey || messages.length === 0) return;
    
    const timeoutId = setTimeout(() => {
      // Only nudge if heights are still 0 (FlashList events didn't fire)
      if (listContentHeight === 0 && flatListRef.current) {
        // Scroll to a tiny offset to trigger onScroll, then scroll to end
        flatListRef.current.scrollToOffset({ offset: 1, animated: false });
        // Use requestAnimationFrame to ensure the first scroll registered
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        });
      }
    }, 200); // Wait for FlashList to fully render
    
    return () => clearTimeout(timeoutId);
  }, [listMountKey, messages.length, listContentHeight]);
  // Pagination is now handled by context (hasMoreMessages, loadMoreMessages, isLoadingMore)
  const loadingTimeoutRef = useRef(null);
  // Track if initial scroll has been applied - prevents re-applying on data changes
  const initialScrollDoneRef = useRef(false);
  const [inputText, setInputText] = useState('');
  const [retryTarget, setRetryTarget] = useState(null);
  const [retryMenu, setRetryMenu] = useState({ visible: false, message: null, position: null }); // Retry context menu state (like metadata)
  const [retryReasonVisible, setRetryReasonVisible] = useState(false);
  const [retryReason, setRetryReason] = useState('');
  const [metadataMenu, setMetadataMenu] = useState({ visible: false, message: null, position: null });
  const [toolStatus, setToolStatus] = useState(null); // { name, commentary } - for tool execution indicator
  const [isWaitingForIteration, setIsWaitingForIteration] = useState(false); // True when waiting for next agentic iteration
  const [apiKeyModal, setApiKeyModal] = useState({ visible: false, providerName: '' }); // Missing API key alert
  const sessionAttachmentsRef = useRef([]); // Track all attachments sent in current session for reattach_file tool
  const lastHapticTime = useRef(0);
  
  // PDF extraction hook - WebView-based
  const { extract: extractPdf, extracting: pdfExtracting, ExtractorComponent } = usePdfExtractor();
  
  // PDF retry state - when API returns "unsupported PDF format", extract and retry
  const pdfRetryDataRef = useRef(null); // Store data needed for retry

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
  const isGeneratingTitleRef = useRef(false); // Prevent duplicate title generation requests
  const shouldScrollOnSizeChange = useRef(false); // Flag: scroll to bottom on every content size change
  const itemHeights = useRef({});
  
  // FlashList unmount delay - ensure full unmount before remount on session change
  // This prevents duplicate key issues when switching sessions rapidly
  const [listMountKey, setListMountKey] = useState(currentSession?.id || 'welcome');
  const listUnmountTimeoutRef = useRef(null);
  
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
  const autoCloseArmedRef = useRef(true);
  
  // Spacer visibility tracking for simpler approach
  const [showSpacer, setShowSpacer] = useState(false);
  // Shared value so the worklet sees gate changes immediately.
  const shouldAnimateKeyboard = useSharedValue(false);
  const isNearBottomRef = useRef(true); // Track if user is near bottom
  const streamEndedRef = useRef(false); // Track if stream just ended
  const SPACER_HEIGHT = Dimensions.get('window').height - 335; // Full device height - 145
  const SPACER_HIDE_BUFFER = 30; // Extra buffer before hiding spacer from bottom
  const ATTACHMENT_EXTRA_HEIGHT = 150; // Match attachment preview spacing
  const PILL_EXTRA_HEIGHT = 48; // Match AGENTIC_SECTION_HEIGHT in ChatInput
  
  // Dismiss chat input keyboard when sidebar opens (to avoid conflict with search bar)
  useEffect(() => {
    if (sidebarOpen) {
      Keyboard.dismiss();
    }
  }, [sidebarOpen]);
  
  // Populate sessionAttachments from messages
  // Also resets when session changes (new session ID means start fresh)
  const prevSessionForAttachmentsRef = useRef(currentSession?.id);
  useEffect(() => {
    const sessionChanged = prevSessionForAttachmentsRef.current !== currentSession?.id;
    
    if (sessionChanged) {
      prevSessionForAttachmentsRef.current = currentSession?.id;
      log('[Session Change] Session changed to:', currentSession?.id);
    }
    
    // No session = no attachments to track
    if (!currentSession?.id) {
      sessionAttachmentsRef.current = [];
      return;
    }
    
    // Extract attachments from all loaded messages
    const existingAttachments = [];
    for (const msg of messages) {
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          // Avoid duplicates by name
          if (!existingAttachments.some(a => a.name === att.name)) {
            existingAttachments.push(att);
          }
        }
      }
    }
    
    if (sessionChanged) {
      // On session change, only use attachments from loaded messages
      sessionAttachmentsRef.current = existingAttachments;
    } else {
      // On load more, merge with newly sent attachments (from handleSend)
      const newlySent = sessionAttachmentsRef.current.filter(
        a => !existingAttachments.some(e => e.name === a.name)
      );
      sessionAttachmentsRef.current = [...existingAttachments, ...newlySent];
    }
    
    log('[SessionAttachments] Current:', sessionAttachmentsRef.current.map(a => a.name));
  }, [messages, currentSession?.id]);
  
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
    const offset = -keyboardAnimatedHeight.value * 0.001;
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
  
  // Animated style for FlashList container - use translateY to move content up with keyboard
  // Native keyboard pushes content, but we use transform for smoother animation
  const listContainerAnimatedStyle = useAnimatedStyle(() => {
    // Skip animation when sidebar is open
    if (sidebarOpen) {
      return { transform: [{ translateY: 0 }] };
    }
    if (!shouldAnimateKeyboard.value) {
      return { transform: [{ translateY: 0 }] };
    }

    // keyboardAnimatedHeight.value is negative when keyboard open (e.g. -300)
    // Use full keyboard height for transform - footer padding will be reduced accordingly
    return {
      transform: [{ translateY: keyboardAnimatedHeight.value }],
    };
  // Depend on JS state so the worklet re-runs when the gate changes.
  }, [sidebarOpen]);
  
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
        const viewportThreshold = listLayoutHeight * 0.5;
        
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

  // Compute keyboard animation gate based on effective content height.
  useEffect(() => {
    const footerExtraHeight =
      (attachmentCount > 0 ? ATTACHMENT_EXTRA_HEIGHT : 0) +
      (pillCount > 0 ? PILL_EXTRA_HEIGHT : 0) +
      inputExtraHeight;
    const footerHeight = 85 + footerExtraHeight;
    const paddingTop = topInset + 66;
    const usingMeasured = measuredContentHeight > 0;
    const baseContentHeight = usingMeasured ? measuredContentHeight : listContentHeight;
    const contentWithoutSpacer = Math.max(
      0,
      baseContentHeight - (showSpacer ? SPACER_HEIGHT : 0)
    );
    const contentForGate = usingMeasured
      ? contentWithoutSpacer + paddingTop + footerHeight
      : contentWithoutSpacer;
    const shouldAnimate =
      listLayoutHeight > 0 && contentForGate >= listLayoutHeight * 0.9;
    shouldAnimateKeyboard.value = shouldAnimate;
  }, [
    measuredContentHeight,
    listContentHeight,
    listLayoutHeight,
    showSpacer,
    topInset,
    attachmentCount,
    pillCount,
    inputExtraHeight,
  ]);

  // Clear streaming state when saved assistant message appears
  // This prevents blink by keeping streaming message visible until saved message is in state
  // Flow: stream ends → isStreaming=false → appendMessage saves → messages updates → 
  //       this effect detects saved message → waits for render → clears streamingContent
  useEffect(() => {
    // Only run when stream just ended (isStreaming=false) but we still have streaming content
    if (!isStreaming && streamingContent) {
      // Check if last message is a saved assistant response
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant') {
        // Saved message exists - wait for next frame to ensure it's rendered
        // Then clear streaming state so streaming message disappears
        // Using requestAnimationFrame + setTimeout ensures layout is complete
        requestAnimationFrame(() => {
          setTimeout(() => {
            setStreamingContent('');
            setThinkingContent('');
            setStreamingMessageId(null);
            setStreamingMessageIndex(null);
          }, 100); // Small delay after frame to ensure paint is complete
        });
      }
    }
  }, [isStreaming, streamingContent, messages]);

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
          }, 3000);
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
        // If keyboard opens near top, require user to scroll down before auto-close.
        autoCloseArmedRef.current = lastScrollOffset.current > 100;
      });
      
      const hideSub = Keyboard.addListener(hideEvent, () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
        autoCloseArmedRef.current = true;
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

    // FlashList unmount delay - set key to null first, then to new session after delay
    // This ensures FlashList fully unmounts before remounting with new data
    if (isSessionToSession || isWelcomeToSession || isSessionToWelcome) {
      // Clear any pending timeout
      if (listUnmountTimeoutRef.current) {
        clearTimeout(listUnmountTimeoutRef.current);
      }
      // Set to null to unmount FlashList
      setListMountKey(null);
      // After brief delay, set to new session ID to remount
      listUnmountTimeoutRef.current = setTimeout(() => {
        setListMountKey(currentSession?.id || 'welcome');
      }, 50);
    }

    
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
      if (listUnmountTimeoutRef.current) clearTimeout(listUnmountTimeoutRef.current);
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
    // Block sending when local mode is active but the current provider API key is missing
    const activeProviderId = settings.provider || 'openrouter';
    const providerApiKey = providerApiKeys[activeProviderId] || settings.apiKey || '';
    const isCloudMode = settings.useClustrixCloud ?? false;
    
    if (!isCloudMode && !providerApiKey.trim()) {
      const providerList = [...DEFAULT_PROVIDERS_LIST, ...customProviders.map(p => ({ id: p.id, name: p.name }))];
      const providerName = providerList.find(p => p.id === activeProviderId)?.name || activeProviderId;
      setApiKeyModal({ visible: true, providerName });
      return;
    }

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
    
    // Prepare attachment metadata for storage
    // NOTE: base64 is NOT stored to keep DB size small
    // For cloud mode reattach_file, base64 is populated on-demand from file system
    const attachmentMeta = attachments.map(a => ({
      type: a.type,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      width: a.width,
      height: a.height,
      // Store URI for display and for on-demand file reading
      uri: a.uri,
      // Include textContent for text files so AI can read them
      textContent: a.textContent,
    }));
    
    // Collect attachments for reattach_file tool (track all attachments in session)
    if (attachmentMeta.length > 0) {
      // Add new attachments, avoiding duplicates by name
      const existingNames = sessionAttachmentsRef.current.map(a => a.name);
      const newAttachments = attachmentMeta.filter(a => !existingNames.includes(a.name));
      sessionAttachmentsRef.current = [...sessionAttachmentsRef.current, ...newAttachments];
      log('[handleSend] sessionAttachments updated:', sessionAttachmentsRef.current.map(a => a.name));
    }
    
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
    
    // Scroll to bottom - delay 500ms to ensure spacer is rendered first
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 500);
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
    
    // Store stable index for streaming message key
    // This MUST stay constant during entire stream to prevent key change → unmount → blink
    // IMPORTANT: Use actual message_index from last message, NOT messages.length!
    // With pagination/lazy load, messages.length != actual message count
    // For new session: user=0, assistant=1
    // For existing session (inverted list - index 0 = newest):
    //   - messages state here is BEFORE user message is appended (closure)
    //   - newest message (index 0) has message_index N
    //   - user message will get index N+1
    //   - assistant message will get index N+2
    const lastMsgIndex = messages.length > 0 ? (messages[messages.length - 1].message_index ?? messages.length - 1) : -1;
    const expectedAssistantIndex = isNewSession ? 1 : lastMsgIndex + 2;
    setStreamingMessageIndex(expectedAssistantIndex);

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
        setStreamingMessageIndex(null);
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

      // DON'T clear streamingContent here - it causes blink!
      // The streaming message needs to stay visible until saved message is rendered
      // Only set isStreaming to false to indicate stream is complete
      // streamingContent will be cleared by useEffect when saved message appears
      setIsStreaming(false);

      // Generate title if needed (new session OR existing session with default title)
      // Use ref to prevent duplicate requests if already generating
      const currentTitle = isNewSession ? 'New Chat' : (sessionRef.current?.name || '');
      const needsTitle = !currentTitle || currentTitle === 'New Chat' || currentTitle === 'Untitled';
      
      if (needsTitle && !isGeneratingTitleRef.current) {
        isGeneratingTitleRef.current = true;
        try {
          const title = await generateTitle(text, settings.model, settings.provider, settings.baseUrl, settings.apiKey, {
            useCloud: settings.useClustrixCloud,
            idToken: accessToken,
            userEmail: currentUser?.email,
          });
          // Update session with generated title
          if (isNewSession) {
            await updateSession({ name: title }, session);
          } else {
            await updateSession({ name: title });
          }
        } finally {
          isGeneratingTitleRef.current = false;
        }
      }
      
      // Auto-enable agentic mode if user sent attachments in this session
      // This allows reattach_file tool in subsequent messages
      // Note: We enable AFTER stream completes so user gets thinking on first message
      if (sessionAttachmentsRef.current.length > 0 && !settings.agenticMode) {
        log('[handleDone] Auto-enabling agentic mode for reattach_file tool');
        updateSettings({ agenticMode: true });
      }
    };

    const handleError = async (error) => {
      const errorMsg = error.message || error || '';
      
      // DEBUG: Log error for PDF detection check
      console.log('[handleError] Error received:', errorMsg);
      console.log('[handleError] isPdfUnsupportedError:', isPdfUnsupportedError(errorMsg));
      
      // Check if this is a PDF unsupported error and we have PDF attachments to retry with
      const hasPdfAttachments = attachments.some(a => 
        a.type === 'file' && a.base64 && 
        (a.mimeType === 'application/pdf' || a.name?.toLowerCase().endsWith('.pdf'))
      );
      
      console.log('[handleError] hasPdfAttachments:', hasPdfAttachments);
      console.log('[handleError] pdfRetryDataRef.current?.retried:', pdfRetryDataRef.current?.retried);
      
      // If PDF format not supported and we have PDFs, try to extract and retry
      if (isPdfUnsupportedError(errorMsg) && hasPdfAttachments && !pdfRetryDataRef.current?.retried) {
        console.log('[handleError] PDF unsupported error detected, attempting extraction and retry...');
        
        // Find PDF attachments
        const pdfAttachments = attachments.filter(a => 
          a.type === 'file' && a.base64 && 
          (a.mimeType === 'application/pdf' || a.name?.toLowerCase().endsWith('.pdf'))
        );
        const nonPdfAttachments = attachments.filter(a => 
          !(a.type === 'file' && a.base64 && 
            (a.mimeType === 'application/pdf' || a.name?.toLowerCase().endsWith('.pdf')))
        );
        
        // Store retry context and trigger extraction
        try {
          setToolStatus({ name: 'PDF Extraction', commentary: 'Extracting text and images from PDF...' });
          
          // Extract all PDFs
          const extractedResults = await Promise.all(
            pdfAttachments.map(async (pdf) => {
              try {
                const extracted = await extractPdf(pdf.base64);
                return { pdf, extracted, success: true };
              } catch (e) {
                console.warn('[handleError] Failed to extract PDF:', pdf.name, e);
                return { pdf, error: e.message, success: false };
              }
            })
          );
          
          // Convert extracted PDFs to text + images
          let additionalText = '';
          const extractedImages = [];
          let anySuccess = false;
          
          for (const result of extractedResults) {
            if (result.success && result.extracted && result.extracted.text) {
              const { textContent, imageAttachments } = convertExtractedPdfToAttachments(
                result.extracted, 
                result.pdf.name
              );
              additionalText += textContent + '\n\n';
              extractedImages.push(...imageAttachments);
              anySuccess = true;
            } else {
              additionalText += `[PDF: ${result.pdf.name} - Could not extract text]\n\n`;
            }
          }
          
          // If NO extractions succeeded, don't retry - show helpful error
          if (!anySuccess) {
            console.log('[handleError] All PDF extractions failed, showing helpful error');
            setToolStatus(null);
            pdfRetryDataRef.current = { retried: true }; // Prevent infinite loop
            
            // Show a helpful error message instead
            const helpfulError = `This provider (${settings.provider}) cannot process PDF files directly, and text extraction failed.\n\n**Solutions:**\n- Use **Gemini**, **Claude**, or **OpenAI** (GPT-4o) - they support PDF natively\n- Copy-paste the text content from your PDF\n- Use a text-based file format instead (.txt, .md)`;
            
            // Fall through to normal error handling with helpful message
            const finalContent = fullThinking 
              ? `<thinking>${fullThinking}</thinking>\n\n${fullContent}\n\n**Error:** ${helpfulError}`
              : `${fullContent}\n\n**Error:** ${helpfulError}`;

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

            setIsStreaming(false);
            setStreamingContent('');
            setThinkingContent('');
            setStreamingMessageId(null);
            setStreamingMessageIndex(null);
            return; // Exit - don't retry
          }
          
          // Rebuild attachments with extracted content instead of PDFs
          const newAttachments = [
            ...nonPdfAttachments,
            ...extractedImages.map((img, idx) => ({
              ...img,
              id: Date.now() + idx, // Generate unique IDs
            })),
          ];
          
          // Rebuild user message with extracted text prepended
          const newText = additionalText.trim() + '\n\n' + text;
          
          // Mark as retried to prevent infinite loop
          pdfRetryDataRef.current = { retried: true };
          
          // Clear current streaming state
          setStreamingContent('');
          setThinkingContent('');
          fullContent = '';
          fullThinking = '';
          toolResults = [];
          
          // Rebuild API messages with extracted content
          const newUserMessage = {
            role: 'user',
            content: newText,
            attachments: newAttachments.length > 0 ? newAttachments : undefined,
          };
          
          const newApiMessages = isNewSession 
            ? [{ role: 'system', content: systemPrompt }, newUserMessage]
            : [
                { role: 'system', content: systemPrompt }, 
                ...messages.map(m => ({ role: m.role, content: m.content, attachments: m.attachments })), 
                newUserMessage
              ];
          
          setToolStatus({ name: 'Retrying', commentary: 'Retrying with extracted PDF content...' });
          
          // Retry the API call
          const isPerplexity = (settings.provider || '').toLowerCase() === 'perplexity';
          
          if (settings.agenticMode && !isPerplexity) {
            await streamAgenticChat({
              signal: ac.signal,
              messages: newApiMessages,
              model: settings.model,
              provider: settings.provider,
              baseUrl: settings.baseUrl || undefined,
              apiKey: settings.apiKey,
              agenticConfig: settings.agenticTools,
              idToken: accessToken,
              userEmail: currentUser?.email,
              onChunk: handleChunk,
              onThink: handleThink,
              onToolCall: handleToolCall,
              onToolResult: handleToolResult,
              onDone: handleDone,
              onError: handleError, // Will catch final errors after retry
            });
          } else if (settings.generateImage) {
            await streamImageGenChat({
              signal: ac.signal,
              messages: newApiMessages,
              model: settings.model,
              provider: settings.provider,
              baseUrl: settings.baseUrl || undefined,
              apiKey: settings.apiKey,
              imageModel: settings.imageModel || 'auto',
              idToken: accessToken,
              userEmail: currentUser?.email,
              onChunk: handleChunk,
              onThink: handleThink,
              onToolCall: handleToolCall,
              onToolResult: handleToolResult,
              onDone: handleDone,
              onError: handleError,
            });
          } else {
            await streamChat({
              signal: ac.signal,
              messages: newApiMessages,
              model: settings.model,
              provider: settings.provider,
              baseUrl: settings.baseUrl || undefined,
              apiKey: settings.apiKey,
              useCloud: settings.useClustrixCloud,
              idToken: accessToken,
              userEmail: currentUser?.email,
              onChunk: handleChunk,
              onThink: handleThink,
              onDone: handleDone,
              onError: handleError,
              onSearchResults: handleSearchResults,
            });
          }
          
          return; // Exit - retry handlers will take over
          
        } catch (extractError) {
          console.error('[handleError] PDF extraction failed:', extractError);
          // Fall through to show original error + extraction failure
        } finally {
          setToolStatus(null);
        }
      }
      
      // Reset retry flag for next send
      pdfRetryDataRef.current = null;
      
      // Normal error handling - show error to user
      setToolStatus(null);
      setIsStreaming(false);
      
      const errorMessage = `\n\n**Error:** ${errorMsg}`;
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
      setStreamingMessageIndex(null);
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
        useCloud: settings.useClustrixCloud,
        agenticConfig: {
          ...settings.agenticTools,
          sessionId: session?.id || currentSession?.id, // For list_attachments to query DB directly
          sessionAttachments: sessionAttachmentsRef.current, // For reattach_file tool
          userId: currentUser?.id || currentUser?.uid, // For reminder tools
        },
        idToken: accessToken,
        userEmail: currentUser?.email,
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
        useCloud: settings.useClustrixCloud,
        imageModel: settings.imageModel || 'auto',
        idToken: accessToken,
        userEmail: currentUser?.email,
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
        useCloud: settings.useClustrixCloud,
        idToken: accessToken,
        userEmail: currentUser?.email,
        onChunk: handleChunk,
        onThink: handleThink,
        onDone: handleDone,
        onError: handleError,
        onSearchResults: handleSearchResults, // Perplexity built-in search
      });
    }
  }, [currentSession, clearDraft, saveWelcomeDraft, messages, createSession, appendMessage, settings, providerApiKeys, customProviders, removeMessage, updateSession, setIsStreaming, setStreamingContent, setThinkingContent, setStreamingMessageId, setInputText, setNewMessageId, onStreamingThinking, triggerHaptic]);

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
    setStreamingMessageIndex(null);

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

  // Retry menu trigger - opens context menu at button position (like metadata)
  const handleRetryModal = useCallback((message, buttonPosition) => {
    setRetryTarget(message);
    setRetryMenu({ visible: true, message, position: buttonPosition });
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
    setRetryMenu({ visible: false, message: null, position: null });
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
    
    // Calculate expected message index for streaming message (SAMA seperti handleSend)
    // After deleting AI message, the new AI will take the same index
    const lastMsgIndex = messages.length > 0 ? (messages[messages.length - 1].message_index ?? messages.length - 1) : -1;
    const expectedAssistantIndex = lastMsgIndex + 1; // Next index after current last message
    setStreamingMessageIndex(expectedAssistantIndex);
    
    log('[Retry] Streaming started with ID:', stableStreamingId, 'index:', expectedAssistantIndex);

    let fullContent = '';
    let fullThinking = '';
    let thinkStartTime = null;

    await streamChat({
      messages: apiMessages,
      model: settings.model,
      provider: settings.provider,
      baseUrl: settings.baseUrl || undefined,
      apiKey: settings.apiKey,
      useCloud: settings.useClustrixCloud,
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
        setStreamingMessageIndex(null);
        log('[Retry] Complete!');
      },
      onError: async (error) => {
        log('[Retry] Error:', error);
        setIsStreaming(false);
        setStreamingContent('');
        setThinkingContent('');
        setStreamingMessageId(null);
        setStreamingMessageIndex(null);
        await appendMessage('assistant', `Error: ${error}`, { error: true });
      },
    });
  }, [retryTarget, currentSession, removeMessage, messages, settings, appendMessage, setIsStreaming, setStreamingContent, setThinkingContent, setStreamingMessageId, setStreamingMessageIndex, onStreamingThinking, triggerHaptic]);

  // Handle like/dislike toggle
  const handleReaction = useCallback((message, liked) => {
    if (!currentSession || message?.message_index === undefined) return;
    // liked can be: true (like), false (dislike), or null (unlike/undislike)
    setMessageMetadata(currentSession.id, message.message_index, { isLiked: liked });
  }, [currentSession, setMessageMetadata]);

  // Open metadata context menu with position
  const handleMetadataOpen = useCallback((message, buttonPosition) => {
    setMetadataMenu({ visible: true, message, position: buttonPosition });
  }, []);

  // Track per-item heights so short sessions update immediately on session switch.
  // Recalculate total from all tracked items on each measurement to ensure accuracy
  // even after fallback estimation was used.
  const handleMessageLayout = useCallback((key, height) => {
    const prev = itemHeights.current[key] || 0;
    if (prev === height) return;
    itemHeights.current[key] = height;
    
    // Recalculate total from all tracked heights (more accurate than delta updates)
    const totalMeasured = Object.values(itemHeights.current).reduce((sum, h) => sum + h, 0);
    measuredTotalHeightRef.current = totalMeasured;
    setMeasuredContentHeight(totalMeasured);
  }, []);

  // PERF: useCallback to prevent renderMessage recreation on every render
  // This is critical for LegendList/FlatList performance during streaming
  const renderMessage = useCallback(({ item }) => (
    <View onLayout={(e) => handleMessageLayout(item._key, e.nativeEvent.layout.height)}>
      <ChatMessage
        message={item}
        isUser={item.role === 'user'}
        isNew={item._key === newMessageId}
        onShowThinking={onShowThinking}
        onRetry={item.isLastAiMessage ? (msg, pos) => handleRetryModal(msg || item, pos) : null}
        onSelectText={onSelectText}
        onReact={(liked) => handleReaction(item, liked)}
        onShowMetadata={(msg, pos) => handleMetadataOpen(msg || item, pos)}
        onImagePress={onImagePress}
      />
    </View>
  ), [newMessageId, onShowThinking, onSelectText, onImagePress, handleRetryModal, handleReaction, handleMetadataOpen, handleMessageLayout]);

  // Messages are already paginated from context - just add keys
  // Key must be STABLE across prepends - use message_index only (not array index!)
  // Array index changes when prepending, causing LegendList to think items are new
  // Use FULL session ID in key to prevent recycler confusion across sessions
  // Key format: msg-{session}-{message_index}-{role}-{suffix}
  // For assistant messages, use 'streaming' suffix to match streaming message key
  // This ensures smooth transition from streaming to saved (same key = no remount = no blink)
  const displayMessagesBase = useMemo(() => {
    const seen = new Set();
    
    // DEBUG: Check for duplicate message_index in source messages
    const indexCount = {};
    messages.forEach(m => {
      const idx = m.message_index;
      indexCount[idx] = (indexCount[idx] || 0) + 1;
    });
    const duplicateIndices = Object.entries(indexCount).filter(([k, v]) => v > 1);
    if (duplicateIndices.length > 0) {
      console.warn('[ChatScreen] DUPLICATE message_index in messages array:', duplicateIndices);
    }
    
    const filtered = messages
      // Filter out the saved assistant message that matches streaming index
      // This prevents duplicate display during the brief transition period
      .filter((m, idx) => {
        // If streaming content exists and this message has same index as streaming, hide it
        // The streaming message will show instead (with same content)
        if (streamingContent && streamingMessageIndex !== null && m.role === 'assistant' && m.message_index === streamingMessageIndex) {
          return false;
        }
        return true;
      })
      .map((m, idx) => {
        // For assistant messages, use 'streaming' suffix to match streaming message key
        // This allows LegendList to reuse the same item when transitioning from streaming to saved
        const suffix = m.role === 'assistant' ? 'streaming' : (m.id || `idx-${idx}`);
        const key = `msg-${currentSession?.id || 'x'}-${m.message_index}-${m.role}-${suffix}`;
        
        // Dedupe check (shouldn't happen, but safety)
        if (seen.has(key)) {
          console.warn('[ChatScreen] Duplicate key detected, adding suffix:', key);
          return { ...m, _key: `${key}-dup-${idx}` };
        }
        seen.add(key);
        return { ...m, _key: key };
      });
    return filtered;
  }, [messages, currentSession?.id, streamingContent, streamingMessageIndex]);
  
  // Create mutable copy for streaming message push
  let displayMessages = [...displayMessagesBase];
  
  // Check if content exceeds viewport - 30px threshold
  const shouldHaveSpacer = listContentHeight >= (listLayoutHeight - 50);
  
  // Streaming message visibility - simple logic:
  // Show streaming message while we have streaming content
  // Hide when streamingContent is cleared (by useEffect after saved message renders)
  // This ensures streaming message stays visible until saved message is fully rendered
  const shouldShowStreamingMessage = !!streamingContent || isStreaming;
  
  if (shouldShowStreamingMessage && streamingMessageIndex !== null) {
    // Use STABLE streamingMessageIndex set at stream start - NOT messages.length!
    // messages.length changes when appendMessage adds saved message, causing key change → unmount → blink
    const sessionIdPart = currentSession?.id || 'x';
    const streamingKey = `msg-${sessionIdPart}-${streamingMessageIndex}-assistant-streaming`;
    // Use same key format as saved messages: msg-{session}-{index}-{role}-{uniqueId}
    // For streaming, use 'streaming' as uniqueId - will be replaced by actual id when saved
    displayMessages.push({
      _key: streamingKey,
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

  // Refs for manual scroll position adjustment during prepend
  // Ref for tracking scroll state during load more
  const prependScrollAdjustRef = useRef(null);

  // Load more messages when scroll to top
  const handleLoadMore = useCallback(async () => {
    // Guard: Already loading or no more data
    if (isLoadingMore || !hasMoreMessages) {
      return;
    }
    
    // Guard: Debounce
    if (loadingTimeoutRef.current) {
      return;
    }
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
  
  // Scroll state handler - Implements: Hide on Scroll, Show on Stop
  const scrollStateTimeout = useRef(null);
  const handleScrollState = useCallback((offsetY, distanceFromBottom, nearBottom, contentHeight, layoutHeight) => {
    lastScrollOffset.current = offsetY;
    isNearBottomRef.current = nearBottom;
    
    // Hide spacer when scrolled up after stream ends
    if (streamEndedRef.current && showSpacer) {
      // Hide only after user scrolls above spacer height + buffer from bottom
      if (distanceFromBottom > SPACER_HEIGHT + SPACER_HIDE_BUFFER) {
        setShowSpacer(false);
      }
    }
    
    // Logic 1: User Scroll = Fade Out (Hide immediately)
    // Only hide if currently visible and NOT a programmatic scroll (auto-scroll)
    if (scrollButtonVisible && !programmaticScrollRef.current) {
        setScrollButtonVisible(false);
    }
    
    // Logic 2: User Stop Scrolling = Fade In
    // We detect "Stop" by calculating silence in scroll events
    if (scrollStateTimeout.current) clearTimeout(scrollStateTimeout.current);
    
    scrollStateTimeout.current = setTimeout(() => {
      // Scroll Stopped
      const isScrollable = contentHeight > layoutHeight;
      const shouldShow = isScrollable && !nearBottom;
      
      // Show button if valid position
      if (shouldShow && !scrollButtonVisible && !programmaticScrollRef.current) {
        setScrollButtonVisible(true);
      }
      
      // Reset flags
      programmaticScrollRef.current = false;
    }, 150); // 150ms debounce implies stopped scrolling
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
  const handleFooterLayout = useCallback((e) => {
    const { y, height } = e.nativeEvent.layout;
    const nextHeight = y + height;
    // Update content height from footer position to avoid stale size on session switch.
    setListContentHeight(prev => (prev === nextHeight ? prev : nextHeight));
    lastContentHeight.current = nextHeight;
  }, []);

  const ListFooter = useCallback(() => {
    const dynamicOffset = (attachmentCount > 0 ? ATTACHMENT_EXTRA_HEIGHT : 0) + (pillCount > 0 ? PILL_EXTRA_HEIGHT : 0) + inputExtraHeight;
    // Show spacer during streaming OR if stream ended but user still near bottom
    if (showSpacer) {
      return (
        <View
          key={footerMeasureKey}
          onLayout={handleFooterLayout}
          style={{ height: SPACER_HEIGHT + dynamicOffset }}
        />
      );
    }
    // Default minimal footer - keyboard height handled by container transform, not padding
    // Only add base padding for input area
    return (
      <View
        key={footerMeasureKey}
        onLayout={handleFooterLayout}
        style={{ height: 85 + dynamicOffset }}
      />
    );
  }, [showSpacer, attachmentCount, pillCount, inputExtraHeight, handleFooterLayout, footerMeasureKey]);

  // const onItemLayout = useCallback((index, height) => {
  // itemHeights.current[index] = height;
  // }, []);

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
          <ReanimatedModule.View style={[{ flex: 1 }, listContainerAnimatedStyle]}>
            {/* Only render FlashList when listMountKey is set - ensures full unmount between sessions */}
            {listMountKey && (
              <FlashList
                key={listMountKey}
                ref={flatListRef}
                data={displayMessages}
                keyExtractor={(item) => item._key}
                renderItem={renderMessage}
                estimatedItemSize={440}
                drawDistance={2500}
                initialScrollIndex={!initialScrollDoneRef.current && displayMessages.length > 0 ? displayMessages.length - 1 : undefined}
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                onStartReached={() => {
                  handleLoadMore();
                }}
                onStartReachedThreshold={0.02}
                ListHeaderComponent={ListHeader}
                ListFooterComponent={ListFooter}
                contentContainerStyle={{ paddingLeft: 0, paddingTop: topInset + 66 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onContentSizeChange={(w, h) => {
                  if (!initialScrollDoneRef.current && displayMessages.length > 0) {
                    initialScrollDoneRef.current = true;
                  }
                  setListContentHeight(h);
                  lastContentHeight.current = h;
                  if (shouldScrollOnSizeChange.current) {
                    flatListRef.current?.scrollToEnd({ animated: false });
                  }
                }}
                onLayout={(e) => {
                  const layoutHeight = e.nativeEvent.layout.height;
                  setListLayoutHeight(layoutHeight);
                  lastLayoutHeight.current = layoutHeight;
                }}
                  onScroll={(e) => {
                    const contentOffset = e.nativeEvent?.contentOffset || { x: 0, y: 0 };
                    const contentSize = e.nativeEvent?.contentSize || { width: 0, height: 0 };
                    const layoutMeasurement = e.nativeEvent?.layoutMeasurement || { width: 0, height: 0 };
                    if (layoutMeasurement.height === 0) return;
                    // Fallback: capture list dimensions from scroll events when layout events do not fire.
                    if (layoutMeasurement.height !== listLayoutHeight) {
                      setListLayoutHeight(layoutMeasurement.height);
                    }
                    if (contentSize.height !== listContentHeight) {
                      setListContentHeight(contentSize.height);
                    }
                    lastScrollOffset.current = contentOffset.y;
                    lastContentHeight.current = contentSize.height;
                    lastLayoutHeight.current = layoutMeasurement.height;
                    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
                    const nearBottom = distanceFromBottom < 400;
                    if (keyboardVisible) {
                      if (!autoCloseArmedRef.current && contentOffset.y > 100) {
                        autoCloseArmedRef.current = true;
                      }
                      if (autoCloseArmedRef.current && contentOffset.y <= 0) {
                        autoCloseArmedRef.current = false;
                        Keyboard.dismiss();
                      }
                    }
                    handleScrollState(contentOffset.y, distanceFromBottom, nearBottom, contentSize.height, layoutMeasurement.height);
                  }}
                scrollEventThrottle={16}
              />
            )}
          </ReanimatedModule.View>
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

      {/* Retry context menu - positioned same as metadata */}
      <ContextMenuFixed
        visible={retryMenu.visible}
        onClose={() => setRetryMenu({ visible: false, message: null, position: null })}
        sessionName="Retry response"
        position={retryMenu.position ? {
          // Position near the button - if button is in lower half of screen, show above it
          top: retryMenu.position.y > 400 ? undefined : retryMenu.position.y + 80,
          bottom: retryMenu.position.y > 400 ? (Dimensions.get('window').height - retryMenu.position.y + -38) : undefined,
          left: 76,
        } : { top: 100, left: 16 }}
        options={[
          { 
            label: 'Concise response', 
            icon: ListChevronsDownUp, 
            onPress: () => handleRetrySubmit('concise') 
          },
          { 
            label: 'Detailed response', 
            icon: ListChevronsUpDown, 
            onPress: () => handleRetrySubmit('detailed') 
          },
          { 
            label: 'Other (give reason)', 
            icon: MessageCircleQuestion, 
            onPress: () => {
              setRetryMenu({ visible: false, message: null, position: null });
              setRetryReasonVisible(true);
            }
          },
        ]}
      />

      {/* Retry reason modal */}
      <InputModal
        visible={retryReasonVisible}
        title="Give reason why retry?"
        fields={[{ key: 'reason', label: '', placeholder: 'Explain what to fix', value: retryReason, multiline: true, required: true }]}
        submitText="Send"
        onSubmit={(values) => handleRetrySubmit('other', values.reason)}
        onCancel={() => {
          setRetryReasonVisible(false);
          setRetryReason('');
        }}
      />

      {/* Missing API key modal */}
      {/* <ConfirmModal
        visible={apiKeyModal.visible}
        title="Api key not configured"
        message={`Please configure the ${apiKeyModal.providerName} api key to continue chatting, or switch to cloud mode`}
        confirmText="OK"
        cancelText="Cancel"
        onConfirm={() => {
          setApiKeyModal({ visible: false, providerName: '' });
          onOpenModels?.();
        }}
        onCancel={() => setApiKeyModal({ visible: false, providerName: '' })}
      /> */}

      <AlertModal
        visible={apiKeyModal.visible}
        title="Api key not configured"
        message={`You’re using BYOK mode, but no API key is configured, so requests can’t be sent. Add your API key in Settings and try again, or switch to Cloud Mode to continue.`}
        primaryText="Open Settings"
        secondaryText="Close"
        onPrimary={() => {
          setApiKeyModal({ visible: false, providerName: '' });
          onOpenModels?.();
        }}
        funcOnPress
        onSecondary={() => setApiKeyModal({ visible: false, providerName: '' })}
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
      
      {/* Hidden WebView for PDF extraction */}
      {ExtractorComponent}
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
  },
  retryTitle: {
    color: COLORS.fg,
    fontSize: 17,
    fontFamily: FONTS.display,
    marginBottom: 8,
    borderBottomWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,

    borderBottomColor: COLORS.borderLight,
  },
  retryOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,

  },
  retryOptionLast: {
    
  },
  retryOptionText: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
});
