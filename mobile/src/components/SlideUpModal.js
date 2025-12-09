import { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Animated, Dimensions, TouchableWithoutFeedback, PanResponder, BackHandler } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Snap points as percentage from bottom
const SNAP_COLLAPSED = 0.55; // 55% from bottom, jgn diganti lagi
const SNAP_EXPANDED = 0.942;   // 94.2% from bottom (current) jgn diganti lgi
const GRADIENT_MAX_HEIGHT = 100;

/**
 * Reusable slide-up modal component with snap points
 * @param {boolean} visible - Modal visibility
 * @param {function} onClose - Called when modal is closed
 * @param {React.ReactNode} children - Modal content
 */
export default function SlideUpModal({ visible, onClose, children, showBottomGradient = false, bottomInset = 0, autoExpanded = false }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const gradientHeightAnim = useRef(new Animated.Value(GRADIENT_MAX_HEIGHT + bottomInset)).current;
  const scrollOffset = useRef(0); // Track content scroll position
  
  // Calculate Y positions for snap points
  const getYForSnap = (snap) => SCREEN_HEIGHT * (1 - snap);
  const collapsedY = getYForSnap(SNAP_COLLAPSED);
  const expandedY = getYForSnap(SNAP_EXPANDED);

  const open = useCallback(() => {
    scrollOffset.current = 0;
    const targetY = autoExpanded ? expandedY : collapsedY;
    const targetGradient = autoExpanded ? 0 : GRADIENT_MAX_HEIGHT + bottomInset;
    gradientHeightAnim.setValue(targetGradient);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: targetY, useNativeDriver: true, tension: 135, friction: 19 }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, overlayAnim, collapsedY, expandedY, gradientHeightAnim, bottomInset, autoExpanded]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: SCREEN_HEIGHT, useNativeDriver: true, tension: 135, friction: 19 }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 125, useNativeDriver: true }),
      Animated.timing(gradientHeightAnim, { toValue: 0, duration: 125, useNativeDriver: false }),
    ]).start(() => onClose?.());
  }, [slideAnim, overlayAnim, gradientHeightAnim, onClose]);

  const snapTo = useCallback((snap) => {
    const targetGradientHeight = snap === SNAP_COLLAPSED ? GRADIENT_MAX_HEIGHT + bottomInset : 0;
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: getYForSnap(snap),
        useNativeDriver: true,
        tension: 135,
        friction: 19,
      }),
      Animated.spring(gradientHeightAnim, {
        toValue: targetGradientHeight,
        useNativeDriver: false,
        tension: 135,
        friction: 19,
      }),
    ]).start();
  }, [slideAnim, gradientHeightAnim, bottomInset]);

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

  const lastY = useRef(autoExpanded ? expandedY : collapsedY);

  // Track scroll position from content (for future use)
  const handleContentScroll = useCallback((event) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  }, []);

  // Drag handler for handle area and any custom drag areas
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        slideAnim.stopAnimation((value) => {
          lastY.current = value;
        });
      },
      onPanResponderMove: (_, gs) => {
        const newValue = Math.max(expandedY, lastY.current + gs.dy);
        slideAnim.setValue(newValue);
        // Calculate gradient height based on position (3 states)
        // expandedY -> collapsedY: 0 -> max
        // collapsedY -> SCREEN_HEIGHT: max -> 0
        const maxHeight = GRADIENT_MAX_HEIGHT + bottomInset;
        let newGradientHeight;
        if (newValue <= collapsedY) {
          // Between expanded and collapsed: 0 to max
          const progress = (newValue - expandedY) / (collapsedY - expandedY);
          newGradientHeight = progress * maxHeight;
        } else {
          // Between collapsed and very_collapsed (closing): max to 0
          const progress = (newValue - collapsedY) / (SCREEN_HEIGHT - collapsedY);
          newGradientHeight = (1 - progress) * maxHeight;
        }
        gradientHeightAnim.setValue(Math.max(0, Math.min(maxHeight, newGradientHeight)));
      },
      onPanResponderRelease: (_, gs) => {
        const currentY = lastY.current + gs.dy;
        const velocity = gs.vy;
        
        if (velocity > 1 || currentY > SCREEN_HEIGHT * 0.75) {
          close();
          return;
        }
        if (velocity < -0.5) {
          snapTo(SNAP_EXPANDED);
          lastY.current = expandedY;
          return;
        }
        if (velocity > 0.3) {
          snapTo(SNAP_COLLAPSED);
          lastY.current = collapsedY;
          return;
        }
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
      >
        <View style={styles.handleArea} {...handlePanResponder.panHandlers}>
          <View style={styles.handle} />
        </View>
        <View style={styles.content}>
          {typeof children === 'function' 
            ? children({ onScroll: handleContentScroll, dragHandlers: handlePanResponder.panHandlers }) 
            : children}
        </View>
      </Animated.View>
      {showBottomGradient && (
        <Animated.View style={[styles.bottomGradient, { height: gradientHeightAnim }]}>
          <LinearGradient
            colors={['transparent', COLORS.bgSecondary]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
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
    paddingVertical: 16,
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
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 35,
  },
});
