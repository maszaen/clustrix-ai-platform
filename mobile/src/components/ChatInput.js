import { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  bg: '#1b1c1d',
  surface: '#1f1f1f',
  inputBg: '#282A2D',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  accent: '#0e4bae',
  borderLight: '#3c4141',
};

export default function ChatInput({ onSend, isStreaming, onStop }) {
  const [text, setText] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const inputRef = useRef(null);

  // Android needs manual keyboard tracking
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleSend = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim());
    setText('');
  };

  // Android: add keyboard height as margin
  const androidStyle = Platform.OS === 'android' ? { marginBottom: keyboardHeight } : {};

  return (
    <View style={[styles.wrapper, androidStyle]}>
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
          editable={!isStreaming}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: COLORS.bg,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.inputBg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
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
    backgroundColor: '#e81123',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
