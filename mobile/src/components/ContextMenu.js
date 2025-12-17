import { View, Text, StyleSheet, Modal, TouchableWithoutFeedback, Pressable } from 'react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

/**
 * Context menu component with Lucide icon support
 * @param {boolean} visible - Menu visibility
 * @param {object} position - { x, y } position
 * @param {Array} options - Array of { label, icon: LucideIcon, onPress, danger? }
 * @param {function} onClose - Called when menu is closed
 */
export default function ContextMenu({ visible, position, options, onClose }) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <View style={[styles.menu, { top: position.y, left: Math.min(position.x, 200) }]}>
            {options.map((option, idx) => {
              const IconComponent = option.icon;
              
              return (
                <Pressable
                  key={idx}
                  style={[styles.option, idx < options.length - 1 && styles.optionBorder]}
                  onPress={() => { option.onPress(); onClose(); }}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                >
                  {/* Render Lucide icon component if provided */}
                  {IconComponent && <IconComponent size={18} color={option.danger ? COLORS.danger : COLORS.fg} strokeWidth={1.3} />}
                  <Text style={[styles.optionText, option.danger && styles.dangerText]}>{option.label}</Text>
                </Pressable>
              );
            })}
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
    paddingHorizontal: 14,
    paddingVertical: 10,
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
