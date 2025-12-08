import { useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

/**
 * Fixed position context menu
 * @param {boolean} visible - Menu visibility
 * @param {function} onClose - Called when menu is closed
 * @param {string} sessionName - Current session name to display
 * @param {Array} options - Array of { label, icon, onPress, danger? }
 * @param {object} position - { top, right, left, bottom } for positioning
 * @param {string} positionType - 'absolute' or 'fixed' (default 'absolute')
 */
export default function ContextMenuFixed({ 
  visible, 
  onClose, 
  sessionName, 
  options = [], 
  position = { top: 60, right: 16 },
  positionType = 'absolute'
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  const open = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 135, friction: 19 }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.9, duration: 100, useNativeDriver: true }),
    ]).start(() => onClose?.());
  }, [fadeAnim, scaleAnim, onClose]);

  useEffect(() => {
    if (visible) open();
  }, [visible, open]);

  if (!visible) return null;

  const menuPosition = positionType === 'fixed' 
    ? { position: 'absolute', ...position }
    : { position: 'absolute', ...position };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={close}>
        <Animated.View 
          style={[
            styles.menu, 
            menuPosition,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
          ]}
        >
          {/* Session Name Header */}
          {sessionName && (
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionName} numberOfLines={1}>{sessionName}</Text>
            </View>
          )}
          
          {/* Menu Options */}
          {options.map((option, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.option}
              onPress={() => { option.onPress?.(); close(); }}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={option.icon} 
                size={18} 
                color={option.danger ? COLORS.danger : COLORS.fg} 
              />
              <Text style={[styles.optionText, option.danger && styles.dangerText]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menu: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    minWidth: 180,
    overflow: 'hidden',
  },
  sessionHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  sessionName: {
    color: COLORS.fgMuted,
    fontSize: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  optionText: {
    color: COLORS.fg,
    fontSize: 15,
  },
  dangerText: {
    color: COLORS.danger,
  },
});
