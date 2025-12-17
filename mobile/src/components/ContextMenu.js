import { View, Text, StyleSheet, Modal, TouchableWithoutFeedback, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

export default function ContextMenu({ visible, position, options, onClose }) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
        <View style={[styles.menu, { top: position.y, left: Math.min(position.x, 200) }]}>
          {options.map((option, idx) => (
            <Pressable
              key={idx}
              style={[styles.option, idx < options.length - 1 && styles.optionBorder]}
              onPress={() => { option.onPress(); onClose(); }}
              android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
            >
              <Ionicons name={option.icon} size={18} color={option.danger ? COLORS.danger : COLORS.fg} />
              <Text style={[styles.optionText, option.danger && styles.dangerText]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menu: {
    position: 'absolute',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    minWidth: 160,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  optionText: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  dangerText: {
    color: COLORS.danger,
  },
});
