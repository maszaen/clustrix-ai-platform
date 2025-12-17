import { useState, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { View, TextInput, StyleSheet, Keyboard, Alert } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AttachmentModal from './AttachmentModal';
import AttachmentPreview from './AttachmentPreview';

import { useEffect } from 'react';

function ChatInputComponent({ onSend, isStreaming, onStop, placeholder = 'Ask anything', value = '', onChangeText }, ref) {
  const [text, setText] = useState(value || '');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const inputRef = useRef(null);
  const insets = useSafeAreaInsets();
  const attachmentIdRef = useRef(0);

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
  }));

  // Sync external value changes (used for draft restore)
  useEffect(() => {
    setText(value || '');
  }, [value]);

  // Read file as base64
  const readFileAsBase64 = async (uri) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  };

  // Get MIME type from extension
  const getMimeType = (filename) => {
    const ext = filename?.split('.').pop()?.toLowerCase() || '';
    const mimeTypes = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
      pdf: 'application/pdf',
      txt: 'text/plain',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  };

  // Handle image selection
  const handleSelectImages = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: false, // We'll read it manually for consistency
      });

      if (!result.canceled && result.assets) {
        const newAttachments = await Promise.all(
          result.assets.map(async (asset) => {
            const base64 = await readFileAsBase64(asset.uri);
            const filename = asset.fileName || asset.uri.split('/').pop() || 'image.jpg';
            return {
              id: attachmentIdRef.current++,
              type: 'image',
              uri: asset.uri,
              name: filename,
              mimeType: asset.mimeType || getMimeType(filename),
              size: asset.fileSize,
              base64,
              width: asset.width,
              height: asset.height,
            };
          })
        );
        setAttachments(prev => [...prev, ...newAttachments]);
      }
    } catch (error) {
      console.error('Error picking images:', error);
      Alert.alert('Error', 'Failed to select images. Please try again.');
    }
  }, []);

  // Handle file selection
  const handleSelectFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        const newAttachments = await Promise.all(
          result.assets.map(async (asset) => {
            const base64 = await readFileAsBase64(asset.uri);
            return {
              id: attachmentIdRef.current++,
              type: 'file',
              uri: asset.uri,
              name: asset.name,
              mimeType: asset.mimeType || getMimeType(asset.name),
              size: asset.size,
              base64,
            };
          })
        );
        setAttachments(prev => [...prev, ...newAttachments]);
      }
    } catch (error) {
      console.error('Error picking files:', error);
      Alert.alert('Error', 'Failed to select files. Please try again.');
    }
  }, []);

  // Handle camera
  const handleOpenCamera = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your camera to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const base64 = await readFileAsBase64(asset.uri);
        const filename = asset.fileName || `photo_${Date.now()}.jpg`;
        
        setAttachments(prev => [...prev, {
          id: attachmentIdRef.current++,
          type: 'image',
          uri: asset.uri,
          name: filename,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
          base64,
          width: asset.width,
          height: asset.height,
        }]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  }, []);

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

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['transparent', COLORS.bg70, COLORS.bg90, COLORS.bg90]}
        locations={[0, 0.45, 0.6, 1]}
        style={[styles.bottomFade, { height: insets.bottom + 85 }]}
        pointerEvents="none"
      />
      
      <Pressable 
        style={styles.addBtn} 
        onPress={() => setModalVisible(true)}
        android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
      >
        <Ionicons name="add-outline" size={27} color={COLORS.icon} />
      </Pressable>

      <View style={styles.inputWrapper}>
        {/* Attachment preview */}
        {attachments.length > 0 && (
          <AttachmentPreview 
            attachments={attachments} 
            onRemove={handleRemoveAttachment}
          />
        )}

        <View style={styles.containerInput}>
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

      {/* Attachment modal */}
      <AttachmentModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelectImages={handleSelectImages}
        onSelectFiles={handleSelectFiles}
        onOpenCamera={handleOpenCamera}
      />
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
  inputWrapper: {
    marginLeft: 53,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 26,
    borderWidth: 1,
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

