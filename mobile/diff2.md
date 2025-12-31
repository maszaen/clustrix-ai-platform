commit 21fbc0a567b2ff69472a1e5ad0cf5e5420066f93
Author: maszaen <exqeon@gmail.com>
Date:   Wed Dec 31 17:44:30 2025 +0700

    fix: image viewer

diff --git a/mobile/src/components/ChatMessage.js b/mobile/src/components/ChatMessage.js
index 8c636c2..c2e0457 100644
--- a/mobile/src/components/ChatMessage.js
+++ b/mobile/src/components/ChatMessage.js
@@ -149,7 +149,7 @@ const LongPressWrapper = memo(({ children, onLongPress, disabled, style, isUser
       maxDist={15}
       enabled={!disabled}
     >
-      <Animated.View>
+      <Animated.View style={isUser ? { alignSelf: 'flex-end', maxWidth: '85%' } : undefined}>
         <TouchableWithoutFeedback onPress={handleTap}>
           <View ref={containerRef} style={[style, { overflow: 'hidden' }]}>
             {children}
diff --git a/mobile/src/components/ImageViewerModal.js b/mobile/src/components/ImageViewerModal.js
index 36ca575..14bf2b6 100644
--- a/mobile/src/components/ImageViewerModal.js
+++ b/mobile/src/components/ImageViewerModal.js
@@ -1,12 +1,13 @@
 import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
 import { View, Text, StyleSheet, Animated, Dimensions, BackHandler, Image as RNImage, StatusBar, ActivityIndicator } from 'react-native';
-import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
+import { Gesture, GestureDetector } from 'react-native-gesture-handler';
 import ReanimatedAnimated, { 
   useSharedValue, 
   useAnimatedStyle, 
   withSpring, 
-  withTiming,
-  runOnJS 
+  withDecay,
+  runOnJS,
+  cancelAnimation,
 } from 'react-native-reanimated';
 import { Pressable } from 'react-native-gesture-handler';
 import { X, Download } from 'lucide-react-native';
@@ -18,6 +19,7 @@ const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
 
 /**
  * Full-screen image viewer with pinch-to-zoom and pan
+ * Custom implementation with smooth magnet effect + inertia when zoomed
  * @param {boolean} isDownloadable - If true, shows download button
  */
 function ImageViewerModal({ visible, image, onClose, isDownloadable = false }) {
@@ -34,7 +36,6 @@ function ImageViewerModal({ visible, image, onClose, isDownloadable = false }) {
   const savedTranslateY = useSharedValue(0);
   
   // Calculate image dimensions to fit screen while maintaining aspect ratio
-  // Use useMemo with explicit deps to recalculate when image properties change
   const imageDims = useMemo(() => {
     if (!image) return { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.6 };
     
@@ -151,7 +152,7 @@ function ImageViewerModal({ visible, image, onClose, isDownloadable = false }) {
       scale.value = savedScale.value * event.scale;
     })
     .onEnd(() => {
-      // Clamp scale between 0.5 and 5
+      // Clamp scale between 1 and 5
       if (scale.value < 1) {
         scale.value = withSpring(1);
         savedScale.value = 1;
@@ -167,31 +168,82 @@ function ImageViewerModal({ visible, image, onClose, isDownloadable = false }) {
       }
     });
   
-  // Pan gesture for dragging
+  // Pan gesture for dragging - with inertia when zoomed
   const panGesture = Gesture.Pan()
+    .onStart(() => {
+      // Save current position BEFORE canceling - so new pan starts from here
+      savedTranslateX.value = translateX.value;
+      savedTranslateY.value = translateY.value;
+      // Cancel any ongoing decay animations
+      cancelAnimation(translateX);
+      cancelAnimation(translateY);
+    })
     .onUpdate((event) => {
       translateX.value = savedTranslateX.value + event.translationX;
       translateY.value = savedTranslateY.value + event.translationY;
     })
-    .onEnd(() => {
-      savedTranslateX.value = translateX.value;
-      savedTranslateY.value = translateY.value;
-      
-      // If zoomed out, snap back to center
+    .onEnd((event) => {
+      // If NOT zoomed, snap back to center (original magnet behavior)
       if (scale.value <= 1) {
         translateX.value = withSpring(0);
         translateY.value = withSpring(0);
         savedTranslateX.value = 0;
         savedTranslateY.value = 0;
+      } else {
+        // ZOOMED - calculate bounds
+        const scaledWidth = imageDims.width * scale.value;
+        const scaledHeight = imageDims.height * scale.value;
+        const maxX = Math.max(0, (scaledWidth - SCREEN_WIDTH) / 2);
+        const maxY = Math.max(0, (scaledHeight - SCREEN_HEIGHT) / 2);
+        
+        // Helper: clamp value to bounds
+        const clampX = (v) => Math.max(-maxX, Math.min(maxX, v));
+        const clampY = (v) => Math.max(-maxY, Math.min(maxY, v));
+        
+        // Check if currently out of bounds
+        const outOfBoundsX = translateX.value < -maxX || translateX.value > maxX;
+        const outOfBoundsY = translateY.value < -maxY || translateY.value > maxY;
+        
+        // Low velocity threshold - if user just holds
+        const lowVelocity = Math.abs(event.velocityX) < 100 && Math.abs(event.velocityY) < 100;
+        
+        if (lowVelocity || outOfBoundsX || outOfBoundsY) {
+          // Low velocity or out of bounds - immediately spring to valid position
+          const targetX = clampX(translateX.value);
+          const targetY = clampY(translateY.value);
+          translateX.value = withSpring(targetX);
+          translateY.value = withSpring(targetY);
+          savedTranslateX.value = targetX;
+          savedTranslateY.value = targetY;
+        } else {
+          // High velocity - apply decay with inertia, then check bounds after
+          translateX.value = withDecay({
+            velocity: event.velocityX,
+            clamp: [-maxX, maxX],
+          }, (finished) => {
+            if (finished) {
+              savedTranslateX.value = translateX.value;
+            }
+          });
+          
+          translateY.value = withDecay({
+            velocity: event.velocityY,
+            clamp: [-maxY, maxY],
+          }, (finished) => {
+            if (finished) {
+              savedTranslateY.value = translateY.value;
+            }
+          });
+        }
       }
     });
   
   // Double tap to zoom in/out
   const doubleTapGesture = Gesture.Tap()
     .numberOfTaps(2)
-    .onEnd(() => {
+    .onEnd((event) => {
       if (scale.value > 1) {
-        // Zoom out
+        // Zoom out - reset to center
         scale.value = withSpring(1);
         savedScale.value = 1;
         translateX.value = withSpring(0);
@@ -199,9 +251,35 @@ function ImageViewerModal({ visible, image, onClose, isDownloadable = false }) {
         savedTranslateX.value = 0;
         savedTranslateY.value = 0;
       } else {
-        // Zoom in
-        scale.value = withSpring(2.5);
-        savedScale.value = 2.5;
+        // Zoom in at tap point
+        const targetScale = 2.5;
+        
+        // Tap position relative to screen center
+        const focalX = event.x - SCREEN_WIDTH / 2;
+        const focalY = event.y - SCREEN_HEIGHT / 2;
+        
+        // Calculate translation to keep tap point in place after zoom
+        // When zooming, the focal point moves away from center by (focal * (scale - 1))
+        // We need to translate in opposite direction to compensate
+        const offsetX = -focalX * (targetScale - 1);
+        const offsetY = -focalY * (targetScale - 1);
+        
+        // Calculate bounds to clamp translation
+        const scaledWidth = imageDims.width * targetScale;
+        const scaledHeight = imageDims.height * targetScale;
+        const maxX = Math.max(0, (scaledWidth - SCREEN_WIDTH) / 2);
+        const maxY = Math.max(0, (scaledHeight - SCREEN_HEIGHT) / 2);
+        
+        // Clamp to valid bounds
+        const clampedX = Math.max(-maxX, Math.min(maxX, offsetX));
+        const clampedY = Math.max(-maxY, Math.min(maxY, offsetY));
+        
+        scale.value = withSpring(targetScale);
+        savedScale.value = targetScale;
+        translateX.value = withSpring(clampedX);
+        translateY.value = withSpring(clampedY);
+        savedTranslateX.value = clampedX;
+        savedTranslateY.value = clampedY;
       }
     });
   
diff --git a/mobile/src/components/SlideLeftModal.js b/mobile/src/components/SlideLeftModal.js
index 163ad80..4144d82 100644
--- a/mobile/src/components/SlideLeftModal.js
+++ b/mobile/src/components/SlideLeftModal.js
@@ -9,7 +9,7 @@ import { FONTS } from '../constants/fonts';
 const { width: SCREEN_WIDTH } = Dimensions.get('window');
 
 // Gradient constants - pixel based
-const GRADIENT_MAX_HEIGHT = 100; // Max gradient height in pixels
+const GRADIENT_MAX_HEIGHT = 50; // Max gradient height in pixels
 const GRADIENT_THRESHOLD = 200; // Scroll distance for full gradient (0 to full in 200px)
 
 /**
