import { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Image, FileText, Camera, X } from 'lucide-react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Attachment modal - options for file/image upload
 * Simple slide-up menu with 3 options
 */
function AttachmentModal({ visible, onClose, onSelectImages, onSelectFiles, onOpenCamera }) {
  if (!visible) return null;

  const options = [
    {
      id: 'images',
      icon: Image,
      label: 'Upload Images',
      sublabel: 'JPEG, PNG, GIF, WebP',
      onPress: () => {
        onClose();
        onSelectImages?.();
      },
    },
    {
      id: 'files',
      icon: FileText,
      label: 'Upload Files',
      sublabel: 'PDF, TXT, DOC, etc.',
      onPress: () => {
        onClose();
        onSelectFiles?.();
      },
    },
    {
      id: 'camera',
      icon: Camera,
      label: 'Take Photo',
      sublabel: 'Use camera',
      onPress: () => {
        onClose();
        onOpenCamera?.();
      },
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Backdrop */}
        <AnimatedPressable 
          style={styles.backdrop}
          onPress={onClose}
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
        />

        {/* Menu */}
        <Animated.View 
          style={styles.menu}
          entering={SlideInDown.springify().damping(20).stiffness(300)}
          exiting={SlideOutDown.duration(150)}
        >
          <View style={styles.handle} />
          
          <Text style={styles.title}>Add Attachment</Text>
          
          {options.map((option, index) => (
            <Pressable
              key={option.id}
              style={({ pressed }) => [
                styles.option,
                pressed && styles.optionPressed,
                index === options.length - 1 && { borderBottomWidth: 0 }
              ]}
              onPress={option.onPress}
              android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
            >
              <View style={styles.optionIcon}>
                <option.icon size={22} color={COLORS.accent} strokeWidth={1.8} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionSublabel}>{option.sublabel}</Text>
              </View>
            </Pressable>
          ))}

          {/* Cancel button */}
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelPressed]}
            onPress={onClose}
            android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  menu: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontFamily: FONTS.sansBold,
    color: COLORS.fg,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontFamily: FONTS.sans,
    color: COLORS.fg,
    marginBottom: 2,
  },
  optionSublabel: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.fgMuted,
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  cancelPressed: {
    opacity: 0.7,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: FONTS.sans,
    color: COLORS.fgMuted,
  },
});

export default memo(AttachmentModal);
