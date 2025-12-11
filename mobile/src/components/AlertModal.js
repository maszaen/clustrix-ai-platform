import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { COLORS } from '../constants/colors';
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
  const hasSecondary = !!secondaryText && !!onSecondary;
  
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onPrimary}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Title */}
          <Text style={styles.title}>{title}</Text>
          
          {/* Message */}
          {message && <Text style={styles.message}>{message}</Text>}
          
          {/* Buttons - aligned right */}
          <View style={styles.buttons}>
            {hasSecondary && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={onSecondary}>
                <Text style={styles.secondaryText}>{secondaryText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={onPrimary}>
              <Text style={styles.primaryText}>{primaryText}</Text>
            </TouchableOpacity>
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
