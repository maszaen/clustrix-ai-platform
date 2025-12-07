import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
const COLORS = {
  bg: '#000000ff',
  surface: '#1f1f1f',
  inputBg: '#282A2D',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  accent: '#0e4bae',
  borderLight: '#3c4141',
};
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useEffect } from 'react';

function ChatInputComponent({ onSend, isStreaming, onStop }, ref) {
  const [text, setText] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const insets = useSafeAreaInsets();

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
  }));


  const handleSend = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['transparent', 'transparent', COLORS.bg, COLORS.bg]}
        locations={[0, 0.2, 0.7, 1]}
        style={[styles.bottomFade, { height: insets.bottom + 100 }]}
      />
      
      <View style={styles.container}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Ask anything..."
          placeholderTextColor={COLORS.fgMuted}
          multiline
          maxLength={10000}
          // editable={!isStreaming}
          onPressIn={() => {
            // Only force blur+focus if keyboard is not visible (fix Android multiline bug)
            if (!isFocused && !keyboardVisible) {
              inputRef.current?.blur();
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }}
        />
        
        {isStreaming ? (
          <TouchableOpacity style={styles.stopButton} onPress={onStop}>
            <Ionicons name="stop" size={20} color={COLORS.fg} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]} 
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Ionicons name="arrow-up" size={20} color={COLORS.fg} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 26,
    paddingHorizontal: 10,
    paddingTop: 0,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.inputBg,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    paddingLeft: 13,
    paddingRight: 4,
    paddingVertical: 4,
    zIndex: 100,
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
    maxHeight: 120,
    paddingVertical: 8,
    lineHeight: 20,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
});


export default forwardRef(ChatInputComponent);
