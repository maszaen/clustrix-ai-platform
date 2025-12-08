import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

export default function ContextMenu({ visible, position, options, onClose }) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.menu, { top: position.y, left: Math.min(position.x, 200) }]}>
          {options.map((option, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.option, idx < options.length - 1 && styles.optionBorder]}
              onPress={() => { option.onPress(); onClose(); }}
            >
              <Ionicons name={option.icon} size={18} color={option.danger ? COLORS.danger : COLORS.fg} />
              <Text style={[styles.optionText, option.danger && styles.dangerText]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
  },
  dangerText: {
    color: COLORS.danger,
  },
});
