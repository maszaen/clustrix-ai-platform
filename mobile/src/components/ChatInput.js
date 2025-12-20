import { useState, useRef, forwardRef, useImperativeHandle, useCallback, useEffect, memo } from 'react';
import { View, Text, TextInput, StyleSheet, Keyboard } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { LinearGradient } from 'expo-linear-gradient';
import { LucideCombine, LucideImage, LucideX } from 'lucide-react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, ZoomIn, ZoomOut, LinearTransition } from 'react-native-reanimated';
import AttachmentPreview from './AttachmentPreview';

// Animation config - TWEAK HERE
// Height of attachment preview section (Height 129 + margins ~16)
const ATTACHMENT_SECTION_HEIGHT = 145;

const SPRING_CONFIG = {
  damping: 26,     // Higher = less bounce (try 15-40)
  stiffness: 250,  // Higher = faster snap (try 100-400)
  mass: 0.8        // Lower = lighter/faster (try 0.5-2)
};

// Height of agentic mode pill section (matches pill paddingVertical 8 * 2 + fontSize 13 + margins)
const AGENTIC_SECTION_HEIGHT = 48;

function ChatInputComponent({ onSend, isStreaming, onStop, placeholder = 'Ask anything', value = '', onChangeText, onOpenAttachmentModal, onAttachmentsChange, onInputHeightChange, onPillsChange, onToggleAgenticMode, onToggleGenerateImage }, ref) {
  const [text, setText] = useState(value || '');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [inputHeight, setInputHeight] = useState(0);
  // Local state for pills (mimics attachments array)
  const [activePills, setActivePills] = useState([]);
  
  const inputRef = useRef(null);
  const insets = useSafeAreaInsets();
  const attachmentIdRef = useRef(0);
  const baseInputHeight = useRef(0); // Store initial single-line height
  
  // Animation value for attachment section height
  const attachmentSectionHeight = useSharedValue(0);
  // Animation value for agentic mode pill
  const agenticSectionHeight = useSharedValue(0);

  // Track keyboard visibility
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    blur: () => inputRef.current?.blur(),
    setValue: (val) => setText(val),
    clearAttachments: () => setAttachments([]),
    addAttachments: (newAttachments) => setAttachments(prev => [...prev, ...newAttachments]),
    getAttachmentIdRef: () => attachmentIdRef,
    getAttachmentCount: () => attachments.length,
    setPillState: (name, enabled) => {
      setActivePills(prev => {
        if (enabled) {
          return prev.includes(name) ? prev : [...prev, name];
        } else {
          return prev.filter(p => p !== name);
        }
      });
    },
  }), [attachments.length]);
  // Sync external value changes (used for draft restore)
  useEffect(() => {
    setText(value || '');
  }, [value]);

  // Remove attachment
  const handleRemoveAttachment = useCallback((id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  // Handle pill close
  const handlePillClose = useCallback((pillName) => {
    // Local remove (triggers ZoomOut)
    setActivePills(prev => prev.filter(p => p !== pillName));
    
    // Notify parent
    if (pillName === 'agentic') {
      onToggleAgenticMode?.();
    } else if (pillName === 'generate_image') {
      onToggleGenerateImage?.();
    }
  }, [onToggleAgenticMode, onToggleGenerateImage]);

  const handleSend = () => {
    if ((!text.trim() && attachments.length === 0) || isStreaming) return;
    Keyboard.dismiss();
    onSend(text.trim(), attachments);
    setText('');
    setAttachments([]);
  };

  const hasContent = text.trim() || attachments.length > 0;


  // Notify parent when input height changes (extra height from multiline)
  useEffect(() => {
    // Cap height at 150 (maxHeight from styles)
    const effectiveHeight = Math.min(inputHeight, 150);
    const extraHeight = baseInputHeight.current > 0 ? Math.max(0, effectiveHeight - baseInputHeight.current) : 0;
    onInputHeightChange?.(extraHeight);
  }, [inputHeight, onInputHeightChange]);

  // Animate attachment section height
  useEffect(() => {
    // Determine target height
    // We use withSpring for lively interaction but high damping to prevent bottom wobble
    const targetHeight = attachments.length > 0 ? ATTACHMENT_SECTION_HEIGHT : 0;
    attachmentSectionHeight.value = withSpring(targetHeight, SPRING_CONFIG);
    
    onAttachmentsChange?.(attachments.length);
  }, [attachments.length, onAttachmentsChange]);

  // Animate agentic section height
  useEffect(() => {
    const baseHeight = activePills.length > 0 ? AGENTIC_SECTION_HEIGHT : 0;
    const targetHeight = baseHeight > 0 && attachments.length > 0 ? baseHeight - 8 : baseHeight;
    agenticSectionHeight.value = withSpring(targetHeight, SPRING_CONFIG);
    onPillsChange?.(activePills.length);
  }, [activePills.length, attachments.length, onPillsChange]);

  const attachmentStyle = useAnimatedStyle(() => ({
    height: attachmentSectionHeight.value,
    opacity: attachmentSectionHeight.value > 10 ? 1 : 0, // Prevent flicker at 0
    overflow: 'hidden',
  }));

  const agenticStyle = useAnimatedStyle(() => ({
    height: agenticSectionHeight.value,
    opacity: agenticSectionHeight.value > 10 ? 1 : 0,
    overflow: 'hidden',
  }));

  // Match gradient height logic below
  // ...
  
  // Calculate dynamic height for gradient
  const effectiveInputHeight = Math.min(inputHeight, 150);
  const extraInputHeight = baseInputHeight.current > 0 ? Math.max(0, effectiveInputHeight - baseInputHeight.current) : 0;
  const attachmentHeight = attachments.length > 0 ? ATTACHMENT_SECTION_HEIGHT + 5 : 0; // +5 for extra breathing room in gradient
  // Use LOCAL state for gradient height too!
  const agenticHeight = activePills.length > 0 ? AGENTIC_SECTION_HEIGHT : 0;

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['transparent', COLORS.bg70, COLORS.bg90, COLORS.bg90]}
        locations={[0, 0.45, 0.6, 1]}
        style={[styles.bottomFade, { height: insets.bottom + 85 + extraInputHeight + attachmentHeight + agenticHeight }]}
        pointerEvents="none"
      />
      
      <Pressable 
        style={styles.addBtn} 
        onPress={onOpenAttachmentModal}
        android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
      >
        <Ionicons name="add-outline" size={27} color={COLORS.icon} />
      </Pressable>

      <View style={styles.containerInput}>
        {/* Agentic Mode Pill - Top */}
        <Reanimated.View style={agenticStyle}>
          {activePills.length > 0 && (
              <View style={styles.agenticContainer}>
                {activePills.map(pill => {
                if (pill === 'agentic') {
                  return (
                    <Reanimated.View 
                      key="agentic"
                      entering={ZoomIn.duration(100)}
                      exiting={ZoomOut.duration(100)}
                      layout={LinearTransition.springify().damping(30).stiffness(350).mass(1)}
                    >
                      <View style={styles.pill}>
                        <LucideCombine size={20} color={COLORS.primary} strokeWidth={2} />
                        <Text style={styles.pillText}>Agentic</Text>
                        <Pressable onPress={() => handlePillClose('agentic')} hitSlop={12}>
                        <LucideX size={15} color={COLORS.primary} strokeWidth={2} />

                        </Pressable>
                      </View>
                    </Reanimated.View>
                  );
                }
                if (pill === 'generate_image') {
                  return (
                    <Reanimated.View 
                      key="generate_image"
                      entering={ZoomIn.duration(200)}
                      exiting={ZoomOut.duration(200)}
                      layout={LinearTransition.springify().damping(30).stiffness(350).mass(1)}
                    >
                      <View style={styles.pill}>
                        <LucideImage size={20} color={COLORS.primary} strokeWidth={2} /> 
                        <Text style={styles.pillText}>Image</Text>
                        <Pressable onPress={() => handlePillClose('generate_image')} hitSlop={12}>
                        <LucideX size={15} color={COLORS.primary} strokeWidth={2} />
                        </Pressable>
                      </View>
                    </Reanimated.View>
                  );
                }
                return null;
              })}
            </View>
          )}
        </Reanimated.View>

        {/* Attachment preview - above input */}
        <Reanimated.View style={attachmentStyle}>
          <AttachmentPreview 
            attachments={attachments} 
            onRemove={handleRemoveAttachment}
          />
        </Reanimated.View>

        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={(val) => {
              setText(val);
              onChangeText?.(val);
            }}
            placeholder={placeholder}
            placeholderTextColor={COLORS.fgMuted}
            multiline
            maxLength={10000}
            onContentSizeChange={(e) => {
              const height = e.nativeEvent.contentSize.height;
              // Store base height on first measurement
              if (baseInputHeight.current === 0 && height > 0) {
                baseInputHeight.current = height;
              }
              setInputHeight(height);
            }}
            onPressIn={() => {
              if (!keyboardVisible) {
                inputRef.current?.blur();
                setTimeout(() => inputRef.current?.focus(), 50);
              }
            }}
          />
          
          {isStreaming ? (
            <Pressable style={styles.stopButton} onPress={onStop} android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: true }}>
              <Ionicons name="stop" size={20} color={COLORS.fg} />
            </Pressable>
          ) : (
            <Pressable 
              style={[styles.sendButton, !hasContent && styles.sendButtonDisabled]} 
              onPress={handleSend}
              disabled={!hasContent}
              android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: true }}
            >
              <Ionicons name="arrow-up" size={20} color={COLORS.icon} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 27,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  addBtn: {
    position: 'absolute',
    left: 16,
    width: 45,
    height: 45,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    color: COLORS.icon,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    bottom: 27,
    zIndex: 101,
  },
  containerInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginLeft: 53,
    paddingVertical: 4,
    zIndex: 100,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 13,
    paddingRight: 4,
  },
  // Bottom fade gradient
  bottomFade: {
    position: 'absolute',
    bottom: -10,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  input: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 15,
    maxHeight: 150,
    paddingVertical: 3,
    lineHeight: 20,
    fontFamily: FONTS.sans,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 28,
    marginTop: 'auto',
    color: COLORS.icon,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.surface,
  },
  stopButton: {
    width: 36,
    height: 36,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agenticContainer: {
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.bgSecondaryv3,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: {
    color: COLORS.primary,
    fontSize: 15,
    fontFamily: FONTS.sans,
    fontWeight: '600',
  },
});


export default memo(forwardRef(ChatInputComponent));
