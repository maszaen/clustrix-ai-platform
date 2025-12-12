import { View, Text, StyleSheet, Modal } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

export default function ConfirmModal({ visible, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.buttons}>
            <Pressable style={styles.cancelBtn} onPress={onCancel} android_ripple={{ color: 'rgba(255,255,255,0.1)' }}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </Pressable>
            <Pressable style={[styles.confirmBtn, danger && styles.dangerBtn]} onPress={onConfirm} android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
              <Text style={[styles.confirmText, danger && styles.dangerText]}>{confirmText}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    color: COLORS.fg,
    fontSize: 18,
    fontFamily: FONTS.display,
    marginBottom: 8,
  },
  message: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
  },
  cancelText: {
    color: COLORS.fgMuted,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  confirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
  },
  confirmText: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  dangerBtn: {
    backgroundColor: COLORS.danger,
  },
  dangerText: {
    color: '#fff',
  },
});
