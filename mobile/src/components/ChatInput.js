import { useState, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { View, TextInput, StyleSheet, Keyboard } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { LinearGradient } from 'expo-linear-gradient';
import AttachmentPreview from './AttachmentPreview';

import { useEffect } from 'react';

function ChatInputComponent({ onSend, isStreaming, onStop, placeholder = 'Ask anything', value = '', onChangeText, onOpenAttachmentModal, onAttachmentsChange, onInputHeightChange }, ref) {
  const [text, setText] = useState(value || '');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [inputHeight, setInputHeight] = useState(0);
  const inputRef = useRef(null);
  const insets = useSafeAreaInsets();
  const attachmentIdRef = useRef(0);
  const baseInputHeight = useRef(0); // Store initial single-line height

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
  }), [attachments.length]);

  // Notify parent when attachments change
  useEffect(() => {
    onAttachmentsChange?.(attachments.length);
  }, [attachments.length, onAttachmentsChange]);

  // Notify parent when input height changes (extra height from multiline)
  useEffect(() => {
    // Cap height at 150 (maxHeight from styles)
    const effectiveHeight = Math.min(inputHeight, 150);
    const extraHeight = baseInputHeight.current > 0 ? Math.max(0, effectiveHeight - baseInputHeight.current) : 0;
    onInputHeightChange?.(extraHeight);
  }, [inputHeight, onInputHeightChange]);

  // Sync external value changes (used for draft restore)
  useEffect(() => {
    setText(value || '');
  }, [value]);

  // Remove attachment
  const handleRemoveAttachment = useCallback((id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleSend = () => {
    if ((!text.trim() && attachments.length === 0) || isStreaming) return;
    Keyboard.dismiss();
    onSend(text.trim(), attachments);
    setText('');
    setAttachments([]);
  };

  const hasContent = text.trim() || attachments.length > 0;
  
  // Calculate dynamic height for gradient
  const effectiveInputHeight = Math.min(inputHeight, 150);
  const extraInputHeight = baseInputHeight.current > 0 ? Math.max(0, effectiveInputHeight - baseInputHeight.current) : 0;
  const attachmentHeight = attachments.length > 0 ? 120 : 0;

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['transparent', COLORS.bg70, COLORS.bg90, COLORS.bg90]}
        locations={[0, 0.45, 0.6, 1]}
        style={[styles.bottomFade, { height: insets.bottom + 85 + extraInputHeight + attachmentHeight }]}
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
        {/* Attachment preview - above input */}
        {attachments.length > 0 && (
          <AttachmentPreview 
            attachments={attachments} 
            onRemove={handleRemoveAttachment}
          />
        )}

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
});


export default forwardRef(ChatInputComponent);
