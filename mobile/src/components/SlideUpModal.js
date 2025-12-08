import { useRef, useEffect, useCallback, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, TouchableWithoutFeedback, PanResponder, BackHandler } from 'react-native';
import { COLORS } from '../constants/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Snap points as percentage from bottom
const SNAP_COLLAPSED = 0.55; // 35% from bottom
const SNAP_EXPANDED = 0.96;   // 90% from bottom (current)

/**
 * Reusable slide-up modal component with snap points
 * @param {boolean} visible - Modal visibility
 * @param {function} onClose - Called when modal is closed
 * @param {React.ReactNode} children - Modal content
 * @param {number} height - Modal height as percentage (0-1), default 0.9
 */
export default function SlideUpModal({ visible, onClose, children, height = SNAP_EXPANDED }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [currentSnap, setCurrentSnap] = useState(SNAP_COLLAPSED);
  
  // Calculate Y positions for snap points
  const getYForSnap = (snap) => SCREEN_HEIGHT * (1 - snap);
  const collapsedY = getYForSnap(SNAP_COLLAPSED);
  const expandedY = getYForSnap(SNAP_EXPANDED);

  const open = useCallback(() => {
    setCurrentSnap(SNAP_COLLAPSED);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: collapsedY, useNativeDriver: true, tension: 135, friction: 19 }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, overlayAnim, collapsedY]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: SCREEN_HEIGHT, useNativeDriver: true, tension: 135, friction: 19 }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 125, useNativeDriver: true }),
    ]).start(() => onClose?.());
  }, [slideAnim, overlayAnim, onClose]);

  const snapTo = useCallback((snap) => {
    setCurrentSnap(snap);
    Animated.spring(slideAnim, {
      toValue: getYForSnap(snap),
      useNativeDriver: true,
      tension: 135,
      friction: 19,
    }).start();
  }, [slideAnim]);

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

  const lastY = useRef(collapsedY);
  
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10,
      onPanResponderGrant: () => {
        slideAnim.stopAnimation((value) => {
          lastY.current = value;
        });
      },
      onPanResponderMove: (_, gs) => {
        const newValue = Math.max(expandedY, lastY.current + gs.dy);
        slideAnim.setValue(newValue);
      },
      onPanResponderRelease: (_, gs) => {
        const currentY = lastY.current + gs.dy;
        const velocity = gs.vy;
        
        // If swiping down fast or dragged below threshold, close
        if (velocity > 1 || currentY > SCREEN_HEIGHT * 0.75) {
          close();
          return;
        }
        
        // If swiping up fast, expand
        if (velocity < -0.5) {
          snapTo(SNAP_EXPANDED);
          lastY.current = expandedY;
          return;
        }
        
        // If swiping down moderately, collapse
        if (velocity > 0.3) {
          snapTo(SNAP_COLLAPSED);
          lastY.current = collapsedY;
          return;
        }
        
        // Snap to nearest point based on position
        const midPoint = (collapsedY + expandedY) / 2;
        if (currentY < midPoint) {
          snapTo(SNAP_EXPANDED);
          lastY.current = expandedY;
        } else {
          snapTo(SNAP_COLLAPSED);
          lastY.current = collapsedY;
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
        style={[styles.sheet, { height: SCREEN_HEIGHT * SNAP_EXPANDED, transform: [{ translateY: slideAnim }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handleArea}>
          <View style={styles.handle} />
        </View>
        <View style={styles.content}>
          {children}
        </View>
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
  handleArea: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
  },
  content: {
    flex: 1,
  },
});
