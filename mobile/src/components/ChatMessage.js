import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Animated } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { parseThinkingBlocks } from '../utils/markdown';

const COLORS = {
  bg: '#000000ff',
  bgSecondary: '#282A2C',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  primaryLight: '#1f3760',
  borderLight: '#3c4141',
  thinkBg: '#282A2C',
};

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

export default function ChatMessage({ message, isUser, isNew }) {
  const [showThinking, setShowThinking] = useState(false);
  const slideAnim = useRef(new Animated.Value(isNew && isUser ? 50 : 0)).current;
  const opacityAnim = useRef(new Animated.Value(isNew && isUser ? 0 : 1)).current;
  
  useEffect(() => {
    if (isNew && isUser) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 100,
          friction: 12,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, []);
  
  const blocks = isUser ? [{ type: 'text', content: message.content }] : parseThinkingBlocks(message.content || '');
  const hasThinking = blocks.some(b => b.type === 'thinking');
  const thinkingContent = blocks.find(b => b.type === 'thinking')?.content || '';
  const textContent = blocks.filter(b => b.type === 'text').map(b => b.content).join('');

  if (isUser) {
    return (
      <Animated.View style={[
        styles.userContainer,
        { transform: [{ translateX: slideAnim }], opacity: opacityAnim }
      ]}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      </Animated.View>
    );
  }

  const isLoading = message.isStreaming && (!textContent || textContent === '...');
  
  return (
    <View style={styles.aiContainer}>
      {hasThinking && (
        <TouchableOpacity 
          style={styles.thinkToggle} 
          onPress={() => setShowThinking(!showThinking)}
        >
          <Text style={styles.thinkToggleText}>
            {showThinking ? '▼ Hide thinking' : '▶ Show thinking'}
          </Text>
        </TouchableOpacity>
      )}
      
      {showThinking && thinkingContent && (
        <View style={styles.thinkingBlock}>
          <Text style={styles.thinkingText}>{thinkingContent}</Text>
        </View>
      )}
      
      {isLoading ? (
        <TypewriterLoader />
      ) : (
        <Markdown style={markdownStyles} rules={markdownRules}>{textContent || ' '}</Markdown>
      )}
    </View>
  );
}

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

const styles = StyleSheet.create({
  userContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  userText: {
    color: COLORS.fg,
    fontSize: 15,
    lineHeight: 21,
  },
  aiContainer: {
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  thinkToggle: {
    marginBottom: 8,
  },
  thinkToggleText: {
    color: COLORS.fgMuted,
    fontSize: 13,
  },
  thinkingBlock: {
    backgroundColor: COLORS.thinkBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.borderLight,
    padding: 12,
    marginBottom: 12,
    borderRadius: 4,
  },
  thinkingText: {
    color: COLORS.fgMuted,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
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
  },
});

const markdownStyles = {
  body: { color: COLORS.fg, fontSize: 15, lineHeight: 23 },
  heading1: { color: COLORS.fg, fontSize: 22, fontWeight: '600', marginVertical: 8 },
  heading2: { color: COLORS.fg, fontSize: 19, fontWeight: '600', marginVertical: 6 },
  heading3: { color: COLORS.fg, fontSize: 17, fontWeight: '600', marginVertical: 4 },
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
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fence: { 
    backgroundColor: 'transparent',
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
  },
  fenceContent: {
    color: '#a2a9b0',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
  code_block: { 
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12, 
    borderRadius: 10, 
    marginVertical: 8,
    color: '#a2a9b0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  link: { color: '#D3E3FD' },
  blockquote: { 
    backgroundColor: COLORS.bg,
    borderLeftWidth: 3, 
    color: COLORS.fgMuted,
    borderLeftColor: COLORS.borderLight, 
    paddingLeft: 12, 
    marginLeft: 0,
    borderRadius: 10,
    opacity: 0.9,
  },
  list_item: { marginVertical: 4 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  strong: { fontWeight: '600', color: COLORS.fg },
  em: { fontStyle: 'italic' },
  hr: { backgroundColor: COLORS.borderLight, height: 1, marginVertical: 12 },
  table: { borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 10 },
  th: { backgroundColor: 'transparent', padding: 8, borderBottomWidth: 0, borderColor: COLORS.borderLight },
  td: { padding: 8, borderTopWidth: 1, borderColor: COLORS.borderLight, backgroundColor: 'transparent', },
};
