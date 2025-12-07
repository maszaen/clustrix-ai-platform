import { useState, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

export default function ChatInput({ onSend, isStreaming, onStop }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  const insets = useSafeAreaInsets();


  const handleSend = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <LinearGradient
        colors={['transparent', 'transparent', COLORS.bg]}
        locations={[0, 0.5, 1]}
        style={[styles.bottomFade, { height: insets.bottom + 178 }]}
        pointerEvents="none"
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 0,
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
    zIndex: 100,
  },
  // Bottom fade gradient
  bottomFade: {
    position: 'absolute',
    bottom: 0,
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
