import { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Animated, Dimensions, TouchableWithoutFeedback, PanResponder, BackHandler } from 'react-native';
import { COLORS } from '../constants/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Reusable slide-up modal component
 * @param {boolean} visible - Modal visibility
 * @param {function} onClose - Called when modal is closed
 * @param {React.ReactNode} children - Modal content
 * @param {number} height - Modal height as percentage (0-1), default 0.9
 */
export default function SlideUpModal({ visible, onClose, children, height = 0.9 }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const open = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 20, useNativeDriver: true, tension: 135, friction: 19 }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, overlayAnim]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: SCREEN_HEIGHT, useNativeDriver: true, tension: 135, friction: 19 }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 125, useNativeDriver: true }),
    ]).start(() => onClose?.());
  }, [slideAnim, overlayAnim, onClose]);

  useEffect(() => {
    if (visible) open();
  }, [visible, open]);

  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, close]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10,
      onPanResponderMove: (_, gs) => {
        const newValue = Math.max(20, 20 + gs.dy);
        slideAnim.setValue(newValue);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 100 || gs.vy > 0.5) {
          close();
        } else {
          Animated.spring(slideAnim, { toValue: 20, useNativeDriver: true, tension: 135, friction: 19 }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View style={[styles.backdrop, { opacity: overlayAnim }]} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[styles.sheet, { height: SCREEN_HEIGHT * height, transform: [{ translateY: slideAnim }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handle} />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
});
