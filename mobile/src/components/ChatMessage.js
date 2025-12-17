import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Pressable, Keyboard, Easing } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { parseThinkingBlocks } from '../utils/markdown';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { PanelBottomOpen, RotateCcw, Copy, Check, ThumbsUp, ThumbsDown, Info } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import ContextMenu from './ContextMenu';
import MessageAttachments from './MessageAttachments';

// Custom ripple that follows touch position exactly
const LongPressWrapper = memo(({ children, onLongPress, disabled, style, isUser }) => {
  const [ripples, setRipples] = useState([]);
  const rippleIdRef = useRef(0);
  const activeRippleId = useRef(null);

  const handleLongPress = useCallback((e) => {
    if (onLongPress && !disabled) {
      onLongPress(e);
    }
  }, [onLongPress, disabled]);

  // Dismiss keyboard on regular tap
  const handlePress = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  // Start ripple at touch position
  const handlePressIn = useCallback((e) => {
    const { locationX, locationY } = e.nativeEvent;
    const id = rippleIdRef.current++;
    activeRippleId.current = id;
    
    // Release all previous ripples first, then add new one
    setRipples(prev => [
      ...prev.map(r => !r.released ? { ...r, released: true } : r),
      { id, x: locationX, y: locationY, released: false }
    ]);
  }, []);

  // Trigger fade out when finger released - release ALL unreleased ripples
  const handlePressOut = useCallback(() => {
    setRipples(prev => prev.map(r => 
      !r.released ? { ...r, released: true } : r
    ));
    activeRippleId.current = null;
  }, []);

  // Remove ripple from array
  const removeRipple = useCallback((id) => {
    setRipples(prev => prev.filter(r => r.id !== id));
  }, []);

  const rippleSize = 80;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={handleLongPress}
      delayLongPress={300}
      disabled={disabled}
      style={[style, { overflow: 'hidden' }]}
    >
      {/* Wrap children so ALL touches pass through to Pressable */}
      <View pointerEvents="none">
        {children}
      </View>
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

export default function ChatMessage({ message, isUser, isNew, onShowThinking, onRetry, onReact, onShowMetadata, onSelectText }) {
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
  const openSelectText = useCallback(() => {
    setContextMenuVisible(false);
    // Pass raw content to parent for SlideLeftModal
    onSelectText?.(rawContent);
  }, [onSelectText, rawContent]);

  // Get raw content for selection (without thinking tags for AI)
  const rawContent = isUser ? message.content : (textContent.trim() || message.content || '');

  // Context menu options
  const contextMenuOptions = useMemo(() => [
    { label: 'Copy', icon: 'copy-outline', onPress: handleCopy },
    { label: 'Select text', icon: 'text-outline', onPress: openSelectText },
  ], [handleCopy, openSelectText]);

  if (isUser) {
    // Check for attachments
    const attachments = message.attachments || [];
    const hasAttachments = attachments.length > 0;
    const hasContent = message.content && message.content.trim();
    
    // DEBUG: Log what ChatMessage receives
    console.log('[ChatMessage] isUser, message.attachments:', message.attachments?.length, message.attachments?.map(a => a.name));
    
    return (
      <>
        <Animated.View style={[
          styles.userContainer,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
        ]}>
          {/* Attachments */}
          {hasAttachments && (
            <MessageAttachments attachments={attachments} />
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

  const isLoading = message.isStreaming && (!textContent || textContent === '...');

  return (
    <>
      <Animated.View style={styles.aiContainer}>
        {hasThinking && (
          <View style={{paddingHorizontal: 16}}>
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
            // Native Markdown for all AI messages
            <View style={{paddingHorizontal: 16}}>
              <Markdown style={markdownStyles} rules={markdownRules}>{textContent || ' '}</Markdown>
            </View>
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
}

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

// Markdown styles for saved messages (native rendering)
const markdownStyles = {
  body: { color: COLORS.fg, fontSize: 15, lineHeight: 23, fontFamily: FONTS.ai },
  heading1: { color: COLORS.fg, fontSize: 22, fontFamily: FONTS.aiBold, marginVertical: 8 },
  heading2: { color: COLORS.fg, fontSize: 19, fontFamily: FONTS.aiBold, marginVertical: 6 },
  heading3: { color: COLORS.fg, fontSize: 17, fontFamily: FONTS.aiBold, marginVertical: 4 },
  paragraph: { marginVertical: 4 },
  code_inline: { 
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    color: '#8ab4f8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 14,
    fontFamily: FONTS.mono,
  },
  fence: { 
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12, 
    borderRadius: 8, 
    marginVertical: 8,
  },
  fenceLanguage: {
    color: COLORS.fgMuted,
    fontSize: 11,
    marginBottom: 8,
    textTransform: 'uppercase',
    fontFamily: FONTS.mono,
  },
  fenceContent: {
    color: '#a2a9b0',
    fontSize: 13,
    fontFamily: FONTS.mono,
    lineHeight: 20,
  },
  code_block: { 
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12, 
    borderRadius: 10, 
    marginVertical: 8,
    color: '#a2a9b0',
    fontFamily: FONTS.mono,
  },
  link: { color: '#D3E3FD' },
  blockquote: { 
    backgroundColor: COLORS.bg,
    borderLeftWidth: 3, 
    color: COLORS.fgMuted,
    borderLeftColor: COLORS.borderLight, 
    paddingLeft: 12, 
    marginLeft: 0,
    borderRadius: 0,
    opacity: 0.9,
  },
  list_item: { marginVertical: 4 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  strong: { fontFamily: FONTS.aiBold, fontWeight: 'normal', color: COLORS.fg },
  em: { fontFamily: FONTS.displayItalic, fontStyle: 'normal' },
  hr: { backgroundColor: COLORS.borderLight, height: 1, opacity: 0.5, marginVertical: 12 },
  table: { borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 10, backgroundColor: COLORS.bgSecondary },
  th: { backgroundColor: 'transparent', padding: 8, fontFamily: FONTS.aiBold },
  td: { paddingHorizontal: 8, borderTopWidth: 1, borderColor: COLORS.borderLight, backgroundColor: 'transparent', borderBottomWidth: 0, borderRadius: 10 },
};

// Markdown rules for code blocks
const markdownRules = {
  fence: (node) => {
    const language = node.sourceInfo || '';
    return (
      <View key={node.key} style={markdownStyles.fence}>
        {language ? <Text style={markdownStyles.fenceLanguage}>{language}</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text style={markdownStyles.fenceContent}>{node.content}</Text>
        </ScrollView>
      </View>
    );
  },
  code_inline: (node) => (
    <Text key={node.key} style={markdownStyles.code_inline}>{node.content}</Text>
  ),
};
