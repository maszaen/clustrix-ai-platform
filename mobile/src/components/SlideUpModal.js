import { useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Dimensions, BackHandler } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Snap points as percentage from bottom
const SNAP_COLLAPSED = 0.55;
const SNAP_EXPANDED = 0.942;
const GRADIENT_MAX_HEIGHT = 100;

// Pre-calculated Y positions (constants, not functions)
const COLLAPSED_Y = SCREEN_HEIGHT * (1 - SNAP_COLLAPSED);
const EXPANDED_Y = SCREEN_HEIGHT * (1 - SNAP_EXPANDED);
const CLOSED_Y = SCREEN_HEIGHT;
const MID_POINT = (COLLAPSED_Y + EXPANDED_Y) / 2;

// Spring config - less bouncy
const SPRING_CONFIG = { damping: 50, stiffness: 400, mass: 1 };

/**
 * Reusable slide-up modal component with snap points
 * Uses Reanimated for smooth 60fps animations
 */
const SlideUpModal = forwardRef(({ 
  visible, 
  onClose, 
  children, 
  showBottomGradient = false, 
  bottomInset = 0, 
  autoExpanded = false 
}, ref) => {
  const translateY = useSharedValue(CLOSED_Y);
  const overlayOpacity = useSharedValue(0);
  const context = useSharedValue({ y: 0 });

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    close: () => {
      'worklet'; 
      // Trigger close animation
      translateY.value = withSpring(CLOSED_Y, SPRING_CONFIG);
      overlayOpacity.value = withTiming(0, { duration: 120 });
      // Call onClose after animation matches the timeout in back handler
      runOnJS(handleCloseCaller)();
    },
    expand: () => {
      translateY.value = withSpring(EXPANDED_Y, SPRING_CONFIG);
    },
    collapse: () => {
      translateY.value = withSpring(COLLAPSED_Y, SPRING_CONFIG);
    }
  }));

  // Helper to safely call onClose from worklet or JS
  const handleCloseCaller = useCallback(() => {
    setTimeout(() => {
     onClose?.();
    }, 200);
  }, [onClose]);

  // Close handler (called from JS)
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Open when visible changes
  useEffect(() => {
    if (visible) {
      const targetY = autoExpanded ? EXPANDED_Y : COLLAPSED_Y;
      translateY.value = withSpring(targetY, SPRING_CONFIG);
      overlayOpacity.value = withTiming(1, { duration: 150 });
    }
  }, [visible, autoExpanded, translateY, overlayOpacity]);

  // Handle back button
  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Close animation
      translateY.value = withSpring(CLOSED_Y, SPRING_CONFIG);
      overlayOpacity.value = withTiming(0, { duration: 120 });
      setTimeout(handleClose, 200);
      return true;
    });
    return () => backHandler.remove();
  }, [visible, handleClose, translateY, overlayOpacity]);

  // Ref for scroll gesture coordination
  const scrollRef = useRef(null);

  // Pan gesture for the entire sheet
  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      // Allow dragging down freely, but limit dragging up to EXPANDED_Y
      const newValue = Math.max(EXPANDED_Y, context.value.y + event.translationY);
      translateY.value = newValue;
    })
    .onEnd((event) => {
      const velocity = event.velocityY;
      const currentY = translateY.value;

      // Fast swipe down = close
      if (velocity > 800 || currentY > SCREEN_HEIGHT * 0.75) {
        translateY.value = withSpring(CLOSED_Y, { ...SPRING_CONFIG, velocity });
        overlayOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(handleClose)();
        return;
      }

      // Fast swipe up = expand
      if (velocity < -500) {
        translateY.value = withSpring(EXPANDED_Y, SPRING_CONFIG);
        return;
      }

      // Fast swipe down (slower) = collapse
      if (velocity > 300) {
        translateY.value = withSpring(COLLAPSED_Y, SPRING_CONFIG);
        return;
      }

      // Position-based snap
      if (currentY < MID_POINT) {
        translateY.value = withSpring(EXPANDED_Y, SPRING_CONFIG);
      } else {
        translateY.value = withSpring(COLLAPSED_Y, SPRING_CONFIG);
      }
    });

  // Tap gesture for overlay to close
  const tapGesture = Gesture.Tap().onEnd(() => {
    translateY.value = withSpring(CLOSED_Y, SPRING_CONFIG);
    overlayOpacity.value = withTiming(0, { duration: 120 });
    runOnJS(handleClose)();
  });

  // Pan gesture for backdrop - consume all swipes to block underlying content
  const backdropPanGesture = Gesture.Pan()
    .onUpdate(() => {
      // Do nothing - just consume the gesture
    });

  // Compose gestures for backdrop (tap to close, pan to block)
  const backdropGesture = Gesture.Race(tapGesture, backdropPanGesture);

  // Animated styles
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const gradientAnimatedStyle = useAnimatedStyle(() => {
    const maxHeight = GRADIENT_MAX_HEIGHT + bottomInset;
    const height = interpolate(
      translateY.value,
      [EXPANDED_Y, COLLAPSED_Y, CLOSED_Y],
      [0, maxHeight, 0],
      Extrapolation.CLAMP
    );
    return { height };
  });

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Backdrop - tap to close, pan to block swipes */}
      <GestureDetector gesture={backdropGesture}>
        <Reanimated.View style={[styles.backdrop, overlayAnimatedStyle]} />
      </GestureDetector>

      {/* Sheet with pan gesture on entire surface */}
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[
            styles.sheet, 
            { height: SCREEN_HEIGHT * SNAP_EXPANDED },
            sheetAnimatedStyle
          ]}
        >
          <View style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
          <View style={styles.content}>
            {typeof children === 'function' 
              ? children({ 
                  scrollRef, // Pass scroll ref for waitFor
                  dragHandlers: {}
                }) 
              : children}
          </View>
        </Reanimated.View>
      </GestureDetector>

      {/* Bottom gradient */}
      {showBottomGradient && (
        <Reanimated.View style={[styles.bottomGradient, gradientAnimatedStyle]} pointerEvents="none">
          <LinearGradient
            colors={['transparent', COLORS.bgSecondaryv2]}
            style={StyleSheet.absoluteFill}
          />
        </Reanimated.View>
      )}
    </View>
  );
});

export default SlideUpModal;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.whiteTr,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bgSecondaryv2,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    overflow: 'hidden',
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
    zIndex: 105,
  },
});
