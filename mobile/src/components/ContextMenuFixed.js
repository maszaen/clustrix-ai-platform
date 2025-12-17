import { useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Modal, TouchableWithoutFeedback, Pressable } from 'react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

/**
 * Fixed position context menu with Lucide icon support
 * @param {boolean} visible - Menu visibility
 * @param {function} onClose - Called when menu is closed
 * @param {string} sessionName - Current session name to display
 * @param {Array} options - Array of { label, icon: LucideIcon, onPress, danger? }
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
      <TouchableWithoutFeedback onPress={close}>
        <View style={styles.overlay}>
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
          
          {/* Menu Options - supports Lucide icon components */}
          {options.map((option, idx) => {
            const IconComponent = option.icon;
            
            return (
              <Pressable
                key={idx}
                style={styles.option}
                onPress={() => { option.onPress?.(); close(); }}
                android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
              >
                {/* Render Lucide icon component if provided */}
                {IconComponent && <IconComponent size={18} color={option.danger ? COLORS.danger : COLORS.fg} strokeWidth={1.3} />}
                <Text style={[styles.optionText, option.danger && styles.dangerText]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  menu: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    minWidth: 180,
    maxWidth: 300,
    paddingBottom: 5,
    paddingRight: 3,
    overflow: 'hidden',
  },
  sessionHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    marginBottom: 5,
  },
  sessionName: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.displayItalic,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 9,
  },
  optionText: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  dangerText: {
    color: COLORS.danger,
  },
});
