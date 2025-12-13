import { View, Text, StyleSheet, Modal, TouchableWithoutFeedback, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { FONTS } from '../constants/fonts';

export default function ContextMenu({ visible, position, options, onClose }) {
  const { colors } = useTheme();
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.menu, { backgroundColor: colors.bgSecondary, top: position.y, left: Math.min(position.x, 200) }]}>
          {options.map((option, idx) => (
            <Pressable
              key={idx}
              style={[styles.option, idx < options.length - 1 && [styles.optionBorder, { borderBottomColor: colors.borderLight }]]}
              onPress={() => { option.onPress(); onClose(); }}
              android_ripple={{ color: colors.ripple }}
            >
              <Ionicons name={option.icon} size={18} color={option.danger ? colors.danger : colors.fg} />
              <Text style={[styles.optionText, { color: colors.fg }, option.danger && { color: colors.danger }]}>{option.label}</Text>
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
    fontFamily: FONTS.sans,
  },
  dangerText: {
    color: COLORS.danger,
  },
});
