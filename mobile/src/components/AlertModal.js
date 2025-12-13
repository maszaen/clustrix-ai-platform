import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { COLORS } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { FONTS } from '../constants/fonts';

/**
 * Reusable Alert Modal - replaces native Alert.alert
 * Clean, minimal design - no icons, button on right
 */
export default function AlertModal({ 
  visible, 
  title, 
  message,
  primaryText = 'Okay',
  onPrimary,
  secondaryText,
  onSecondary,
}) {
  const { colors } = useTheme();
  const hasSecondary = !!secondaryText && !!onSecondary;
  
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onPrimary}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modal, { backgroundColor: colors.bgSecondary }]}>
          {/* Title */}
          <Text style={[styles.title, { color: colors.fg }]}>{title}</Text>
          
          {/* Message */}
          {message && <Text style={[styles.message, { color: colors.fgMuted }]}>{message}</Text>}
          
          {/* Buttons - aligned right */}
          <View style={styles.buttons}>
            {hasSecondary && (
              <Pressable style={styles.secondaryBtn} onPress={onSecondary} android_ripple={{ color: colors.ripple }}>
                <Text style={[styles.secondaryText, { color: colors.fgMuted }]}>{secondaryText}</Text>
              </Pressable>
            )}
            <Pressable style={[styles.primaryBtn, { borderColor: colors.borderLight }]} onPress={onPrimary} android_ripple={{ color: colors.rippleMedium }}>
              <Text style={[styles.primaryText, { color: colors.fg }]}>{primaryText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modal: {
    width: '100%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    color: COLORS.fg,
    fontSize: 16,
    fontFamily: FONTS.display,
    marginBottom: 6,
  },
  message: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
    lineHeight: 20,
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  primaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  primaryText: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
});
