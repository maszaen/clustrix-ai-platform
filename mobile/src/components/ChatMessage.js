import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Keyboard, Easing } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { StreamdownRN } from '../lib/streamdown';
import { parseThinkingBlocks } from '../utils/markdown';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { PanelBottomOpen, RotateCcw, Copy, Check, ThumbsUp, ThumbsDown, Info, ClipboardCopy, FileText, Search, ImageIcon, Loader2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import ContextMenu from './ContextMenu';
import MessageAttachments from './MessageAttachments';
import ToolResultView from './ToolResultView';

// PERF: Memoized StreamdownRN wrapper to cache rendered markdown for completed messages
// This prevents expensive re-parsing during list recycling and session loads
const MemoizedMarkdown = memo(({ content, isStreaming, theme }) => {
  // For streaming messages, always render fresh (content changes frequently)
  // For completed messages, memoize based on content to prevent re-parsing
  return (
    <StreamdownRN 
      theme={theme}
      isComplete={!isStreaming}
    >
      {content || ' '}
    </StreamdownRN>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if content or streaming state changes
  // This is more aggressive than default shallow compare
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.content !== nextProps.content) return false;
  // Theme rarely changes, skip deep compare
  return true;
});

// PERF: Static theme object to prevent recreation on every render
// This ensures MemoizedMarkdown can properly skip re-renders
const MARKDOWN_THEME = {
  colors: {
    background: 'transparent',
    foreground: COLORS.fg,
    muted: COLORS.fgMuted,
    accent: COLORS.primary,
    codeBackground: COLORS.inputBg,
    codeForeground: '#a2a9b0',
    border: COLORS.borderLight,
    link: '#D3E3FD',
    // Syntax highlighting
    syntaxDefault: '#c9d1d9',
    syntaxKeyword: '#ff7b72',
    syntaxString: '#a5d6ff',
    syntaxNumber: '#79c0ff',
    syntaxComment: '#8b949e',
    syntaxFunction: '#d2a8ff',
    syntaxClass: '#ffa657',
    syntaxOperator: '#ff7b72',
  },
  fonts: {
    regular: FONTS.ai,
    bold: FONTS.aiBold,
    mono: FONTS.mono,
  },
  spacing: {
    block: 8,
    inline: 4,
    indent: 16,
  },
};

// Custom ripple wrapper using gesture-handler Pressable
// Allows nested ScrollViews to handle their own gestures
const LongPressWrapper = memo(({ children, onLongPress, disabled, style, isUser }) => {
  const [ripples, setRipples] = useState([]);
  const rippleIdRef = useRef(0);
  const containerRef = useRef(null);

  const handleLongPress = useCallback((e) => {
    if (onLongPress && !disabled) {
      onLongPress(e);
    }
  }, [onLongPress, disabled]);

  // Dismiss keyboard on regular tap
  const handlePress = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  // Start ripple - measure container to get accurate position
  const handlePressIn = useCallback((e) => {
    const { pageX, pageY } = e.nativeEvent;
    const id = rippleIdRef.current++;
    
    // Measure container position to calculate relative touch position
    containerRef.current?.measure((x, y, width, height, containerPageX, containerPageY) => {
      const relativeX = pageX - containerPageX;
      const relativeY = pageY - containerPageY;
      
      setRipples(prev => [
        ...prev.map(r => !r.released ? { ...r, released: true } : r),
        { id, x: relativeX, y: relativeY, released: false }
      ]);
    });
  }, []);

  // Trigger fade out when finger released
  const handlePressOut = useCallback(() => {
    setRipples(prev => prev.map(r => 
      !r.released ? { ...r, released: true } : r
    ));
  }, []);

  // Remove ripple from array
  const removeRipple = useCallback((id) => {
    setRipples(prev => prev.filter(r => r.id !== id));
  }, []);

  const rippleSize = 80;

  return (
    <Pressable
      ref={containerRef}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={handleLongPress}
      delayLongPress={300}
      disabled={disabled}
      style={[style, { overflow: 'hidden' }]}
    >
      {/* No pointerEvents="none" - allows nested ScrollViews to work */}
      {children}
      {/* Ripple layer - absolute positioned, doesn't block touches */}
      {ripples.map(ripple => (
        <RippleCircle 
          key={ripple.id}
          x={ripple.x} 
          y={ripple.y} 
          size={rippleSize}
          isUser={isUser}
          released={ripple.released}
          onComplete={() => removeRipple(ripple.id)}
        />
      ))}
    </Pressable>
  );
});

// Separate animated ripple component
const RippleCircle = memo(({ x, y, size, isUser, released, onComplete }) => {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const hasStartedFade = useRef(false);

  // Scale animation on mount (ease out)
  useEffect(() => {
    Animated.timing(scale, {
      toValue: 1.5,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  // Fade out only when released
  useEffect(() => {
    if (released && !hasStartedFade.current) {
      hasStartedFade.current = true;
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        onComplete?.();
      });
    }
  }, [released]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.15)',
        opacity,
        transform: [{ scale }],
      }}
    />
  );
});

// Loading verbs from desktop - exact copy
const LOADING_VERBS = [
  "Accomplishing", "Actioning", "Actualizing", "Baking", "Booping", "Brewing",
  "Calculating", "Cerebrating", "Channelling", "Churning", "Clustrixing",
  "Coalescing", "Cogitating", "Computing", "Combobulating", "Concocting",
  "Considering", "Contemplating", "Cooking", "Crafting", "Creating", "Crunching",
  "Deciphering", "Deliberating", "Determining", "Discombobulating", "Doing",
  "Effecting", "Elucidating", "Enchanting", "Envisioning", "Finagling",
  "Flibbertigibbeting", "Forging", "Forming", "Frolicking", "Generating",
  "Germinating", "Hatching", "Herding", "Honking", "Ideating", "Imagining",
  "Incubating", "Inferring", "Manifesting", "Marinating", "Meandering",
  "Moseying", "Mulling", "Mustering", "Musing", "Noodling", "Percolating",
  "Perusing", "Philosophising", "Pontificating", "Pondering", "Processing",
  "Puttering", "Puzzling", "Reticulating", "Ruminating", "Scheming",
  "Schlepping", "Shimmying", "Simmering", "Smooshing", "Spelunking", "Spinning",
  "Stewing", "Sussing", "Synthesizing", "Thinking", "Tinkering", "Transmuting",
  "Unfurling", "Unravelling", "Vibing", "Wandering", "Whirring", "Wibbling",
  "Working", "Wrangling",
];

let lastUsedVerb = '';

function getRandomLoadingVerb() {
  if (LOADING_VERBS.length === 1) return LOADING_VERBS[0];
  let newVerb;
  do {
    newVerb = LOADING_VERBS[Math.floor(Math.random() * LOADING_VERBS.length)];
  } while (newVerb === lastUsedVerb);
  lastUsedVerb = newVerb;
  return newVerb;
}

// Typewriter loader - EXACT copy of desktop morphText
function TypewriterLoader() {
  const [displayText, setDisplayText] = useState('');
  const isMountedRef = useRef(true);
  const dotScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    isMountedRef.current = true;
    
    // Dot pulse animation (breathing)
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(dotScale, {
          toValue: 0.8,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnim.start();
    
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    
    // EXACT morphText from desktop
    const morphText = async (oldWord, newWord) => {
      const newLength = newWord.length;
      const oldLength = oldWord.length;
      const cursorPos = newLength;
      
      const FIRST_DELETE_DELAY = 250;
      const DELETE_SPEED = 40;
      
      // FASE 1: DELETE LEFT - First char slow, then fast
      const leftDeleteCount = Math.min(oldLength, cursorPos);
      if (leftDeleteCount > 0) {
        for (let leftChars = leftDeleteCount; leftChars > 0; leftChars--) {
          if (!isMountedRef.current) return;
          
          let morphed = "";
          for (let j = 0; j < leftChars; j++) {
            morphed += oldWord[j];
          }
          morphed += "│";
          for (let j = cursorPos; j < oldLength; j++) {
            morphed += oldWord[j];
          }
          
          setDisplayText(morphed);
          const delay = leftChars === leftDeleteCount ? FIRST_DELETE_DELAY : DELETE_SPEED;
          await sleep(delay);
        }
      }
      
      // FASE 2: BUILD NEW WORD - Random realistic typing delays
      for (let i = 0; i <= newLength; i++) {
        if (!isMountedRef.current) return;
        
        let morphed = "";
        for (let j = 0; j < i; j++) {
          morphed += newWord[j];
        }
        morphed += "│";
        if (oldLength > cursorPos) {
          for (let j = cursorPos; j < oldLength; j++) {
            morphed += oldWord[j];
          }
        }
        
        setDisplayText(morphed);
        const delay = 50 + Math.random() * 70;
        await sleep(delay);
      }
      
      // FASE 3: DELETE RIGHT - Fast constant speed
      const rightDeleteCount = oldLength > cursorPos ? oldLength - cursorPos : 0;
      if (rightDeleteCount > 0) {
        for (let i = rightDeleteCount; i > 0; i--) {
          if (!isMountedRef.current) return;
          
          let morphed = newWord + "│";
          for (let j = 0; j < i - 1; j++) {
            morphed += oldWord[cursorPos + j];
          }
          
          setDisplayText(morphed);
          await sleep(DELETE_SPEED);
        }
      }
      
      // FASE 4: FINAL - Remove cursor
      if (!isMountedRef.current) return;
      setDisplayText(newWord);
      
      // IDLE STATE: Wait exactly 2500ms
      await sleep(2500);
    };
    
    const runLoop = async () => {
      let currentVerb = getRandomLoadingVerb();
      setDisplayText(currentVerb);
      
      while (isMountedRef.current) {
        const oldVerb = currentVerb;
        const newVerb = getRandomLoadingVerb();
        await morphText(oldVerb, newVerb);
        currentVerb = newVerb;
      }
    };
    
    runLoop();
    
    return () => {
      isMountedRef.current = false;
      pulseAnim.stop();
    };
  }, []);

  return (
    <View style={styles.loaderContainer}>
      <Animated.View style={[
        styles.loaderDot, 
        { transform: [{ scale: dotScale }], opacity: dotScale }
      ]} />
      <Text style={styles.loaderText}>{displayText}</Text>
    </View>
  );
}

// Tool Status Indicator - shows when a tool is executing
const ToolStatusIndicator = memo(({ toolStatus }) => {
  const spinAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, []);
  
  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  
  const icon = toolStatus.name === 'web_search' ? Search : ImageIcon;
  const Icon = icon;
  
  return (
    <View style={styles.toolStatusContainer}>
      <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
        <Loader2 size={14} color={COLORS.primary} strokeWidth={2} />
      </Animated.View>
      <Icon size={14} color={COLORS.fgMuted} strokeWidth={2} style={{ marginLeft: 6 }} />
      <Text style={styles.toolStatusText}>{toolStatus.commentary}</Text>
    </View>
  );
});

// Memoized ChatMessage - only re-renders when props actually change
// CRITICAL for performance during streaming (prevents all messages re-rendering on each chunk)
const ChatMessage = memo(function ChatMessage({ message, isUser, isNew, onShowThinking, onRetry, onReact, onShowMetadata, onSelectText, onImagePress }) {
  // Animation for new user messages - fade in + subtle slide from right
  const fadeAnim = useRef(new Animated.Value(isNew && isUser ? 0 : 1)).current;
  const scaleAnim = useRef(new Animated.Value(isNew && isUser ? 0.95 : 1)).current;
  const [copied, setCopied] = useState(false);
  // Pre-render actions for saved messages to prevent layout shift
  const [showActions, setShowActions] = useState(!message.isStreaming && !isUser);
  const actionsOpacity = useRef(new Animated.Value(!message.isStreaming && !isUser ? 1 : 0)).current;
  const metadataBtnRef = useRef(null);
  
  // Context menu state
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const messageRef = useRef(null);
  
  useEffect(() => {
    if (isNew && isUser) {
      // Animate user message appearing (only on mount)
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, []); // Empty deps - run once on mount
  
  // Old streaming spacer logic removed - now handled by ListFooter in ChatScreen
  
  // Memoize parsing - only recalculate when content changes
  const blocks = useMemo(() => {
    return isUser 
      ? [{ type: 'text', content: message.content }] 
      : parseThinkingBlocks(message.content || '');
  }, [message.content, isUser]);
  
  // Memoize derived values
  const { hasThinking, thinkingContent, textContent } = useMemo(() => ({
    hasThinking: blocks.some(b => b.type === 'thinking'),
    thinkingContent: blocks.find(b => b.type === 'thinking')?.content || '',
    textContent: blocks.filter(b => b.type === 'text').map(b => b.content).join(''),
  }), [blocks]);

  // Fade in action buttons after stream completes
  useEffect(() => {
    const hasText = !!textContent?.trim();
    
    if (!isUser && !message.isStreaming && hasText) {
      // Show actions for completed AI messages
      if (!showActions) {
        setShowActions(true);
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }
    } else if (message.isStreaming) {
      // Hide while streaming
      setShowActions(false);
      actionsOpacity.setValue(0);
    }
  }, [message.isStreaming, isUser, textContent]);
  
  // Live timer for streaming thinking
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const thinkingTimerRef = useRef(null);
  
  useEffect(() => {
    // Start timer when streaming with thinking content
    if (message.isStreaming && hasThinking) {
      setThinkingSeconds(0);
      thinkingTimerRef.current = setInterval(() => {
        setThinkingSeconds(s => s + 1);
      }, 1000);
    }
    
    return () => {
      if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current);
    };
  }, [message.isStreaming, hasThinking]);
  
  // Format seconds to "Nm Ns" or just "Ns"
  const formatThinkTime = (seconds) => {
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}m ${s}s`;
    }
    return `${seconds}s`;
  };
  
  // Get thinking button text
  const getThinkingText = () => {
    if (message.isStreaming) {
      return `Thinking ${formatThinkTime(thinkingSeconds)}`;
    }
    // Check both camelCase (streaming) and snake_case (database)
    const duration = message.thinkDuration || message.think_duration;
    if (duration) {
      return `Thought for ${formatThinkTime(duration)}`;
    }
    return 'Show thinking';
  };

  // Copy message text ONLY (without thinking content)
  const handleCopy = async () => {
    const content = isUser ? message.content : (textContent.trim() || message.content || '');
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setContextMenuVisible(false);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get raw content for selection (without thinking tags for AI)
  // Using useMemo to ensure stable reference that updates when message changes
  const rawContent = useMemo(() => {
    return isUser ? message.content : (textContent.trim() || message.content || '');
  }, [isUser, message.content, textContent]);

  // Long press handler - show context menu
  const handleLongPress = useCallback((event) => {
    // Don't show for streaming messages
    if (message.isStreaming) return;
    
    // Get touch position for menu placement
    const { pageX, pageY } = event.nativeEvent;
    setContextMenuPosition({ x: pageX, y: pageY });
    setContextMenuVisible(true);
  }, [message.isStreaming]);

  // Open select text modal - calls parent callback with raw content
  // FIX: Compute content directly from message prop to avoid stale closure with recycled items
  const openSelectText = useCallback(() => {
    setContextMenuVisible(false);
    // Compute fresh content directly from current message prop
    const content = isUser ? message.content : (textContent.trim() || message.content || '');
    onSelectText?.(content);
  }, [onSelectText, isUser, message.content, textContent]);

  // Context menu options - using Lucide icons
  const contextMenuOptions = useMemo(() => [
    { label: 'Copy', icon: ClipboardCopy, onPress: handleCopy },
    { label: 'Select text', icon: FileText, onPress: openSelectText },
  ], [handleCopy, openSelectText]);

  if (isUser) {
    // Check for attachments
    const attachments = message.attachments || [];
    const hasAttachments = attachments.length > 0;
    const hasContent = message.content && message.content.trim();
    
    // DEBUG removed for performance - uncomment if needed
    // console.log('[ChatMessage] isUser, message.attachments:', message.attachments?.length);
    
    return (
      <>
        <Animated.View style={[
          styles.userContainer,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
        ]}>
          {/* Attachments */}
          {hasAttachments && (
            <MessageAttachments attachments={attachments} onImagePress={onImagePress} />
          )}
          
          {/* Text bubble - only if there's text content */}
          {hasContent && (
            <LongPressWrapper onLongPress={handleLongPress} style={styles.userBubble} isUser={true}>
              <Text style={styles.userText}>{message.content}</Text>
            </LongPressWrapper>
          )}
        </Animated.View>
        <ContextMenu 
          visible={contextMenuVisible}
          position={contextMenuPosition}
          options={contextMenuOptions}
          onClose={() => setContextMenuVisible(false)}
        />
      </>
    );
  }

  const isLoading = message.isStreaming && (!textContent || textContent === '...') && !message.toolStatus;
  const hasToolStatus = message.isStreaming && message.toolStatus;

  return (
    <>
      <Animated.View style={styles.aiContainer}>
        {hasThinking && (
          <View style={{paddingHorizontal: 16, paddingBottom: 6}}>
            <TouchableOpacity 
              style={styles.thinkToggle} 
              onPress={() => onShowThinking?.(thinkingContent)}
              activeOpacity={0.7}
            >
              <PanelBottomOpen size={13} color={COLORS.fgMuted} />
              <Text style={styles.thinkToggleText}>{getThinkingText()}</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Tool Status Indicator - shown when tool is executing */}
        {hasToolStatus && (
          <View style={{paddingHorizontal: 16, paddingVertical: 8}}>
            <ToolStatusIndicator toolStatus={message.toolStatus} />
          </View>
        )}
        
        <LongPressWrapper 
          onLongPress={handleLongPress} 
          disabled={message.isStreaming}
          style={styles.aiMessagePressable}
          isUser={false}
          >
          
          {isLoading ? (
            <View style={{paddingHorizontal: 16}}>
              <TypewriterLoader />
            </View>
          ) : (
            <>
              {/* Tool Results - shown for messages with tool results */}
              {message.toolResults?.map((result, idx) => (
                <View key={result.id || idx} style={{marginBottom: 12}}>
                  <ToolResultView 
                    toolName={result.name} 
                    result={result.data} 
                  />
                </View>
              ))}
              
              {/* Text content */}
              {textContent && textContent.trim() && textContent !== '...' && (
                <View style={{paddingHorizontal: 16}}>
                  <MemoizedMarkdown
                    content={textContent}
                    isStreaming={message.isStreaming}
                    theme={MARKDOWN_THEME}
                  />
                </View>
              )}
            </>
          )}
        </LongPressWrapper>

        {!isLoading && showActions && (
          <Animated.View style={[styles.actionRow, { opacity: actionsOpacity }]}>
            

            <Pressable 
              style={styles.actionBtn} 
              onPress={handleCopy}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            >
              <View style={styles.actionBtnInner}>
                {copied ? <Check size={17} color={COLORS.primary} strokeWidth={2} /> : <Copy size={17} color={COLORS.fgMuted} strokeWidth={2} />}
              </View>
            </Pressable>

            <View ref={metadataBtnRef} collapsable={false}>
              <Pressable 
                style={styles.actionBtn} 
                onPress={() => {
                  // Measure button position for menu placement
                  metadataBtnRef.current?.measureInWindow((x, y, width, height) => {
                    onShowMetadata?.(message, { x, y, width, height });
                  });
                }}
                android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
              >
                <View style={styles.actionBtnInner}>
                  <Info size={17} color={COLORS.fgMuted} strokeWidth={2} />
                </View>
              </Pressable>
            </View>

            <Pressable 
              style={styles.actionBtn} 
              onPress={() => onReact?.(true)}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            >
              <View style={styles.actionBtnInner}>
                <ThumbsUp size={17} color={message.isLiked === true ? COLORS.primary : COLORS.fgMuted} strokeWidth={2} fill={message.isLiked === true ? COLORS.primary : 'none'} />
              </View>
            </Pressable>

            <Pressable 
              style={styles.actionBtn} 
              onPress={() => onReact?.(false)}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            >
              <View style={styles.actionBtnInner}>
                <ThumbsDown size={17} color={message.isLiked === false ? '#f87171' : COLORS.fgMuted} strokeWidth={2} fill={message.isLiked === false ? '#f87171' : 'none'} />
              </View>
            </Pressable>

            

            {onRetry && (
              <Pressable 
                style={styles.actionBtn} 
                onPress={() => onRetry?.(message)}
                android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
              >
                <View style={styles.actionBtnInner}>
                  <RotateCcw size={17} color={COLORS.fgMuted} strokeWidth={2} />
                </View>
              </Pressable>
            )}
          </Animated.View>
        )}
      </Animated.View>
      <ContextMenu 
        visible={contextMenuVisible}
        position={contextMenuPosition}
        options={contextMenuOptions}
        onClose={() => setContextMenuVisible(false)}
      />
    </>
  );
}); // Close memo()

// Note: markdownRules moved to MarkdownWebView

const styles = StyleSheet.create({
  userContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  userText: {
    color: COLORS.fg,
    fontSize: 15,
    lineHeight: 21,

    fontFamily: FONTS.sans,
    flexShrink: 1,

  },
  aiContainer: {
    marginVertical: 6,
  },
  aiMessagePressable: {
  },
  thinkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 0,
    marginTop: 6
  },
  thinkToggleText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.displayItalic,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginTop: 0,
    marginBottom: 4,
    paddingHorizontal: 7
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  actionBtnInner: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  loaderDot: {
    width: 11,
    height: 11,
    borderRadius: 7,
    backgroundColor: COLORS.fgMuted,
    marginRight: 12,
  },
  loaderText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.displayItalic,
  },
  // Tool status indicator styles
  toolStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toolStatusText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.displayItalic,
    marginLeft: 6,
    flex: 1,
  },
  // User bubble styles
  userBubble: {
    maxWidth: '85%',
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginBottom: 4,
    overflow: 'hidden',
  },
});

// Export memoized component
export default ChatMessage;
