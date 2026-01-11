import { View, Text, StyleSheet, Modal } from 'react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import RipplePressable from './RipplePressable';

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
  danger,
  funcOnPress
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
              <RipplePressable
                style={styles.secondaryBtn}
                onPress={onSecondary}
                // Foreground ripple keeps feedback visible on transparent buttons.
                android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: false, foreground: true }}
                clipRipple
              >
                <Text style={styles.secondaryText}>{secondaryText}</Text>
              </RipplePressable>
            )}
            <RipplePressable
              style={[styles.primaryBtn, danger ? {backgroundColor: COLORS.danger30, borderColor: COLORS.danger40, } : funcOnPress ?  {backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary40, } : {backgroundColor: 'transparent', borderColor: COLORS.borderLight, }]}
              onPress={onPrimary}
              // Foreground ripple keeps feedback visible on transparent buttons.
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false, foreground: true }}
              clipRipple
            >
              <Text style={[styles.primaryText, danger ? {color: COLORS.fgMuted } : {color: COLORS.fgMuted }]}>{primaryText}</Text>
            </RipplePressable>
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
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    color: COLORS.fg,
    fontSize: 16,
    fontFamily: FONTS.displayItalic,
    borderBottomWidth: 1,
    paddingBottom: 8,
    borderBottomColor: COLORS.borderLight,
    marginBottom: 8,
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
    gap: 6,
  },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  secondaryText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  primaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 50,
    borderWidth: 1,
  },
  primaryText: {
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
});
