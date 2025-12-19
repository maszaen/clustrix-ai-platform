import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, BackHandler, Image as RNImage, StatusBar } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedAnimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  runOnJS 
} from 'react-native-reanimated';
import { Pressable } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';
import { COLORS } from '../constants/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Full-screen image viewer with pinch-to-zoom and pan
 */
function ImageViewerModal({ visible, image, onClose }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  
  // Reanimated values for gestures
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  
  // Calculate image dimensions to fit screen while maintaining aspect ratio
  const getImageDimensions = useCallback(() => {
    if (!image) return { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.6 };
    
    const imgWidth = image.width || 800;
    const imgHeight = image.height || 600;
    const imgAspect = imgWidth / imgHeight;
    
    const screenAspect = SCREEN_WIDTH / SCREEN_HEIGHT;
    
    let width, height;
    if (imgAspect > screenAspect) {
      // Image is wider than screen - fit to width
      width = SCREEN_WIDTH;
      height = SCREEN_WIDTH / imgAspect;
    } else {
      // Image is taller than screen - fit to height (with some padding)
      height = SCREEN_HEIGHT * 0.8;
      width = height * imgAspect;
    }
    
    return { width, height };
  }, [image]);
  
  const imageDims = getImageDimensions();
  
  // Reset zoom/pan when image changes
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [image]);
  
  // Open/close animation
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible, fadeAnim, mounted]);
  
  // Back button handler
  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose?.();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, onClose]);
  
  // Pinch gesture for zoom
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      // Clamp scale between 0.5 and 5
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > 5) {
        scale.value = withSpring(5);
        savedScale.value = 5;
      } else {
        savedScale.value = scale.value;
      }
    });
  
  // Pan gesture for dragging
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      
      // If zoomed out, snap back to center
      if (scale.value <= 1) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });
  
  // Double tap to zoom in/out
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        // Zoom out
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // Zoom in
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });
  
  // Single tap to close (on background)
  const singleTapGesture = Gesture.Tap()
    .onEnd(() => {
      if (onClose) {
        runOnJS(onClose)();
      }
    });
  
  // Combine gestures
  const composedGestures = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );
  
  // Animated style for the image
  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));
  
  if (!mounted) return null;
  
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar hidden={visible} />
      
      {/* Background - tap to close */}
      <GestureDetector gesture={singleTapGesture}>
        <View style={styles.background} />
      </GestureDetector>
      
      {/* Close button */}
      <Pressable 
        style={styles.closeButton} 
        onPress={onClose}
        android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
      >
        <X size={24} color="#fff" strokeWidth={2} />
      </Pressable>
      
      {/* Zoomable/pannable image */}
      {image && (
        <GestureDetector gesture={composedGestures}>
          <ReanimatedAnimated.View style={[styles.imageContainer, imageAnimatedStyle]}>
            <RNImage
              source={{ uri: image.uri }}
              style={[styles.image, { width: imageDims.width, height: imageDims.height }]}
              resizeMode="contain"
            />
          </ReanimatedAnimated.View>
        </GestureDetector>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 45,
    height: 45,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,

    shadowColor: '#000',
    shadowOffset: {
      width: 4,
      height: 4,
    },
    shadowOpacity: 1,
    shadowRadius: 4,
    // Shadow untuk Android
    elevation: 3,
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    borderRadius: 11,
  },
});

export default memo(ImageViewerModal);
