import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Text,
  ActivityIndicator,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  BackHandler,
  Keyboard,
  ScrollView,
  Image,
} from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector, Pressable } from 'react-native-gesture-handler';
import Reanimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  Easing,
  interpolate,
  runOnJS,
  cancelAnimation
} from 'react-native-reanimated';
import Markdown from 'react-native-markdown-display';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import ChatScreen from './src/screens/ChatScreen';
import PersonalizationScreen from './src/screens/PersonalizationScreen';
import ModelsListScreen from './src/screens/ModelsListScreen';
import SessionList from './src/components/SessionList';
import SlideUpModal from './src/components/SlideUpModal';
import ContextMenuFixed from './src/components/ContextMenuFixed';
import InputModal from './src/components/InputModal';
import ConfirmModal from './src/components/ConfirmModal';
import LoadingScreen from './src/components/LoadingScreen';
import { SvgXml } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { COLORS } from './src/constants/colors';
import { fontAssets, FONTS } from './src/constants/fonts';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { PENCIL, LOGO_SVG, DIAMOND_LOGO_HTML_LOADER } from './src/constants/strings';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Base sidebar width sits at ~83% of the screen so users can peek the main page
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.80;
// The maximum distance the sidebar can stretch to the right (until it fills the screen)
const SIDEBAR_STRETCH_DISTANCE = SCREEN_WIDTH - SIDEBAR_WIDTH;
const TOTAL_WIDTH = SIDEBAR_WIDTH + SCREEN_WIDTH; // Total scrollable width

// Diamond Logo component (using LOADER version for splash screen)
function DiamondLogo({ accentColor }) {
  return (
    <View style={loadingOverlayStyles.logoContainer}>
      <WebView
        source={{ html: DIAMOND_LOGO_HTML_LOADER(accentColor) }}
        style={loadingOverlayStyles.logoWebView}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        originWhitelist={['*']}
        javaScriptEnabled={true}
      />
    </View>
  );
}

// Welcome Overlay with typewriter effect (uses message from context)
function WelcomeOverlay({ message, accentColor, visible, onFadeComplete }) {
  const [displayText, setDisplayText] = useState('');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isMountedRef = useRef(true);

  // Typewriter effect
  useEffect(() => {
    if (!message) return;
    
    isMountedRef.current = true;
    let i = 0;
    const timers = [];
    
    const typeChar = () => {
      if (!isMountedRef.current) return;
      if (i < message.length) {
        setDisplayText(message.slice(0, i + 1));
        i++;
        const char = message[i - 1];
        const delay = /[.,?!;:\-–]/.test(char) ? 350 : 30 + Math.random() * 40;
        const t = setTimeout(typeChar, delay);
        timers.push(t);
      }
    };
    
    const starter = setTimeout(typeChar, 100);
    timers.push(starter);
    
    return () => { 
      isMountedRef.current = false;
      timers.forEach(t => clearTimeout(t));
    };
  }, [message]);

  // Fade out when not visible
  useEffect(() => {
    if (!visible) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        onFadeComplete?.();
      });
    }
  }, [visible, fadeAnim, onFadeComplete]);
 // fadeAnim
  return (
    <Animated.View style={[loadingOverlayStyles.overlay, { opacity: fadeAnim }]} pointerEvents="none">
      <View style={loadingOverlayStyles.welcomeContainer}>
        <DiamondLogo accentColor={accentColor} />
        <Text style={loadingOverlayStyles.welcomeText}>{displayText}</Text>
      </View>
    </Animated.View>
  );
}


function MainApp() {
  const insets = useSafeAreaInsets();
  const { isReady, sessions, currentSession, messages, selectSession, deleteSession, clearCurrentSession, toggleFavorite, renameSession, currentUser, isLoggedIn, lastBackupTime, settings, splashMessage, setSplashComplete } = useApp();
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHasQuery, setSidebarHasQuery] = useState(false);
  const [renameModal, setRenameModal] = useState({ visible: false, session: null });
  const [confirmDelete, setConfirmDelete] = useState({ visible: false, session: null });
  const [sidebarContextMenuOpen, setSidebarContextMenuOpen] = useState(false);
  const [thinkingModal, setThinkingModal] = useState({ visible: false, content: '' });
  
  // Loading overlay state
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
  const [mountLoadingOverlay, setMountLoadingOverlay] = useState(true);
  // Track if any modal is open (for blocking pager swipe)
  const isModalOpen = useRef(false);
  // Fade animation for right buttons container
  const rightBtnOpacity = useRef(new Animated.Value(0)).current;
  const showRightBtns = currentSession && messages.length > 0;

  // Fade in/out right buttons when session changes
  useEffect(() => {
    Animated.timing(rightBtnOpacity, {
      toValue: showRightBtns ? 1 : 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [showRightBtns, rightBtnOpacity]);

  // Trigger fadeout when app becomes ready
  useEffect(() => {
    if (!isReady) {
      setTimeout(() => {
        setSplashComplete(true);
      }, 2000);
    }
    if (isReady) {
      setShowLoadingOverlay(false);
    }

  }, [isReady]);

  // Keep modal open ref in sync
  useEffect(() => {
    isModalOpen.current = showContextMenu || showModels || showPersonalization || renameModal.visible || confirmDelete.visible || sidebarContextMenuOpen || thinkingModal.visible;
  }, [showContextMenu, showModels, showPersonalization, renameModal.visible, confirmDelete.visible, sidebarContextMenuOpen, thinkingModal.visible]);

  // Horizontal pager - start at main screen (offset = SIDEBAR_WIDTH)
  // Using Reanimated shared values for smooth native thread animations
  const scrollX = useSharedValue(SIDEBAR_WIDTH);
  const sidebarStretch = useSharedValue(0);
  const currentPage = useSharedValue(1); // 0 = sidebar, 1 = main
  const gestureStartedExpanded = useSharedValue(false); // Track if gesture started while expanded
  const lastDragPosition = useRef(SIDEBAR_WIDTH);
  
  // Keep RN Animated for non-gesture animations (button opacity etc)
  const scrollXAnimated = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const sidebarStretchAnimated = useRef(new Animated.Value(0)).current;
  
  // Animated styles for pager container (runs on native thread)
  const pagerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));
  
  // Animated styles for sidebar width
  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    width: SIDEBAR_WIDTH + sidebarStretch.value,
  }));
  
  // Animated styles for overlays
  const mainOverlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [0, SIDEBAR_WIDTH], [0.5, 0]),
  }));

  // Keep RN Animated interpolations for non-gesture related UI
  const sidebarOverlayOpacity = scrollXAnimated.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0, 0.5],
    extrapolate: 'clamp',
  });
  const mainOverlayOpacity = scrollXAnimated.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0.5, 0],
    extrapolate: 'clamp',
  });

  // Helper to sync RN Animated with Reanimated for non-gesture UI
  // const syncAnimatedValues = useCallback((targetPage) => {
  //   const scrollTarget = targetPage === 0 ? 0 : SIDEBAR_WIDTH;
  //   const stretchTarget = targetPage === 0 && sidebarHasQuery ? SIDEBAR_STRETCH_DISTANCE : 0;
  //   scrollXAnimated.setValue(scrollTarget);
  //   sidebarStretchAnimated.setValue(stretchTarget);
  // }, [scrollXAnimated, sidebarStretchAnimated, sidebarHasQuery]);

  // Wrapper for Keyboard.dismiss to use with runOnJS
  const dismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

  // Horizontal pager gesture handler (runs entirely on native UI thread)
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onStart(() => {
      'worklet';
      // Cancel any running animations to prevent flicker
      cancelAnimation(scrollX);
      cancelAnimation(sidebarStretch);
      // Track initial stretch value at gesture start
      gestureStartedExpanded.value = sidebarStretch.value;
    })
    .onUpdate((e) => {
      'worklet';
      const initialStretch = gestureStartedExpanded.value;
      const baseOffset = currentPage.value === 0 ? 0 : SIDEBAR_WIDTH;
      
      // If started from expanded state on sidebar
      if (currentPage.value === 0 && initialStretch > 0) {
        // Sliding left - consume translation for stretch collapse, excess to pager
        if (e.translationX < 0) {
          const stretchConsumed = Math.min(initialStretch, -e.translationX);
          sidebarStretch.value = initialStretch - stretchConsumed;
          const excessTranslation = Math.max(0, -e.translationX - initialStretch);
          scrollX.value = Math.min(SIDEBAR_WIDTH, excessTranslation);
        } else {
          // Sliding right or not moving yet - keep stretch, allow stretch increase
          sidebarStretch.value = Math.min(SIDEBAR_STRETCH_DISTANCE, initialStretch + e.translationX);
          scrollX.value = 0;
        }
        return;
      }
      
      // Normal pager movement (not started from expanded)
      const proposedOffset = baseOffset - e.translationX;

      if (proposedOffset < 0) {
        scrollX.value = 0;
        sidebarStretch.value = Math.min(SIDEBAR_STRETCH_DISTANCE, -proposedOffset);
      } else {
        scrollX.value = Math.max(0, Math.min(SIDEBAR_WIDTH, proposedOffset));
        sidebarStretch.value = 0;
      }
    })
    .onEnd((e) => {
      'worklet';
      const currentOffset = scrollX.value;
      const initialStretch = gestureStartedExpanded.value;
      const wasExpanded = initialStretch > 0;

      // Normal page determination
      let targetPage;
      if (Math.abs(e.velocityX) > 500) {
        targetPage = e.velocityX > 0 ? 0 : 1;
      } else {
        targetPage = currentOffset < SIDEBAR_WIDTH / 2 ? 0 : 1;
      }

      const scrollTarget = targetPage === 0 ? 0 : SIDEBAR_WIDTH;
      // If started from expanded, always collapse stretch
      const stretchTarget = 0;

      // Animate to target - fast, snappy, no bounce
      const config = { duration: 200, easing: Easing.out(Easing.cubic) };
      scrollX.value = withTiming(scrollTarget, config);
      sidebarStretch.value = withTiming(stretchTarget, config);
      
      // Sync state on JS thread
      runOnJS(setSidebarOpen)(targetPage === 0);
      if (targetPage === 1 || wasExpanded) {
        runOnJS(setSidebarHasQuery)(false);
        runOnJS(dismissKeyboard)();
      }
      currentPage.value = targetPage;
    });

  // Sidebar width calculated from Reanimated value is handled by sidebarAnimatedStyle

  const openSidebar = useCallback(() => {
    Keyboard.dismiss();
    currentPage.value = 0;
    setSidebarOpen(true);
    const config = { duration: 200, easing: Easing.out(Easing.cubic) };
    scrollX.value = withTiming(0, config);
    sidebarStretch.value = withTiming(sidebarHasQuery ? SIDEBAR_STRETCH_DISTANCE : 0, config);
  }, [scrollX, sidebarHasQuery, sidebarStretch]);

  const closeSidebar = useCallback(() => {
    Keyboard.dismiss();
    currentPage.value = 1;
    setSidebarOpen(false);
    setSidebarHasQuery(false);
    const config = { duration: 200, easing: Easing.out(Easing.cubic) };
    scrollX.value = withTiming(SIDEBAR_WIDTH, config);
    sidebarStretch.value = withTiming(0, config);
  }, [scrollX, sidebarStretch, setSidebarHasQuery]);

  // Smoothly adjust sidebar extent when search text toggles a full-width request
  useEffect(() => {
    if (!sidebarOpen) return;
    sidebarStretch.value = withTiming(sidebarHasQuery ? SIDEBAR_STRETCH_DISTANCE : 0, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, [sidebarHasQuery, sidebarOpen, sidebarStretch]);

  const openPersonalization = useCallback(() => setShowPersonalization(true), []);
  const closePersonalization = useCallback(() => setShowPersonalization(false), []);
  const handleShowThinking = useCallback((content) => {
    setThinkingModal({ visible: true, content });
  }, []);
  const handleStreamingThinking = useCallback((content) => {
    // Only update content if modal is already open, don't auto-open
    setThinkingModal(prev => prev.visible ? { ...prev, content } : prev);
  }, []);
  const closeThinkingModal = useCallback(() => {
    setThinkingModal({ visible: false, content: '' });
  }, []);
  const openModels = useCallback(() => {
    Keyboard.dismiss();
    setShowModels(true);
  }, []);
  const closeModels = useCallback(() => setShowModels(false), []);

  // Back button handler - only for sidebar (modals handle their own back)
  useEffect(() => {
    if (showPersonalization || showModels || showContextMenu) return; // Let modals handle back
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sidebarOpen) {
        closeSidebar();
        return true;
      }
      return false;
    });
    return () => backHandler.remove();
  }, [showPersonalization, showModels, showContextMenu, sidebarOpen, closeSidebar]);

  // Helper to format backup time
  const formatBackupTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const handleNewChat = useCallback(() => {
    if (!currentSession || messages.length === 0) {
      clearCurrentSession();
      closeSidebar();
      return;
    }
    clearCurrentSession();
    closeSidebar();
  }, [currentSession, messages, clearCurrentSession, closeSidebar]);

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        
        {/* Horizontal Pager Container */}
        <Reanimated.View style={[styles.pagerContainer, pagerAnimatedStyle]}>
          {/* Page 1: Sidebar (80% base width, stretches to 100% when pulled) */}
          <Reanimated.View style={[styles.sidebarPage, sidebarAnimatedStyle, { paddingTop: insets.top }]}>

          <View style={styles.sidebarContent}>

            

            <SessionList
              sessions={sessions}
              currentSession={currentSession}
              onSelect={(session) => { selectSession(session); setTimeout(() => closeSidebar(), 50); }}
              onDelete={deleteSession}
              onNew={handleNewChat}
              onToggleFavorite={toggleFavorite}
              onRename={renameSession}
              onSearchQueryChange={setSidebarHasQuery}
              onContextMenuChange={setSidebarContextMenuOpen}
              isExpanded={sidebarHasQuery}
              onCollapse={() => { Keyboard.dismiss(); setSidebarHasQuery(false); }}
            />
            {/* Profile / Account Section */}
            <Pressable 
              style={styles.sidebarProfileBtn} 
              onPress={openPersonalization}
              android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
            >
              {isLoggedIn && currentUser?.avatarUrl ? (
                <Image 
                  source={{ uri: currentUser.avatarUrl }} 
                  style={styles.sidebarProfileImage} 
                />
              ) : (
                <View style={styles.sidebarProfilePlaceholder}>
                  <Ionicons name="person-circle-outline" size={38} color={COLORS.icon} />
                </View>
              )}
              <View style={styles.sidebarProfileInfo}>
                <Text style={styles.sidebarProfileName}>
                  {isLoggedIn ? currentUser?.name || 'Account' : 'Not Logged in'}
                </Text>
                {isLoggedIn && lastBackupTime ? (
                  <Text style={styles.sidebarBackupTime}>
                    Last backup: {formatBackupTime(lastBackupTime)}
                  </Text>
                  ) :
                  <Text style={styles.sidebarBackupTime}>
                    Open settings
                  </Text>
                }
              </View>
            </Pressable>
            {/* <TouchableOpacity style={styles.sidebarSettingsBtn} onPress={openPersonalization}>
              <Ionicons name="options-outline" size={20} color={COLORS.fgMuted} />
              <Text style={styles.sidebarSettingsText}>Personalization</Text>
            </TouchableOpacity> */}
          </View>
          </Reanimated.View>

        {/* Page 2: Main Chat (100% width) */}
        <View style={[styles.mainPage, { width: SCREEN_WIDTH }]}>
          <ChatScreen topInset={insets.top} onShowThinking={handleShowThinking} onStreamingThinking={handleStreamingThinking} />

          <LinearGradient
            colors={[COLORS.bg90, COLORS.bg90, COLORS.bg70, 'transparent']}
            locations={[0, 0.5, 0.8, 1]}
            style={[styles.floatingHeader, { height: insets.top + 75 }]}
            pointerEvents="none"
          />

          <Pressable 
            style={[styles.floatingMenuBtn, { top: insets.top + 11 }]} 
            onPress={openSidebar}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
          >
            <Ionicons name="menu" size={22} color={COLORS.icon} />
          </Pressable>

          <Pressable
            style={[styles.floatingLogoBtn, { top: insets.top + 11 }]}
            onPress={openModels}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
          >
            <View style={styles.logo}>
              <SvgXml xml={LOGO_SVG} width={70} height={30}/>
            </View>
          </Pressable>

          <Animated.View 
            style={[styles.floatingPencilBtn, { top: insets.top + 11, opacity: rightBtnOpacity }]}
            pointerEvents={showRightBtns ? 'auto' : 'none'}
          >
            {/* BUTTON 1: PENCIL */}
            <Pressable 
              onPress={handleNewChat} 
              // Bikin wadah lingkaran 40x40 (atau sesuaikan size yg dimau)
              style={{ 
                width: 43, 
                height: 43, 
                borderRadius: 30, // Setengah dari width/height
                alignItems: 'center', // Biar icon di tengah
                justifyContent: 'center' 
              }}
              // borderless: false biar ripplenya stay di dalem lingkaran
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            >
              <SvgXml 
  xml={PENCIL} 
  // Perhatikan kurung siku [] lalu kurung kurawal {}
  style={[styles.rightSideLogo, { transform: [{ translateX: 1 }] }]} 
  width={23} 
  height={23} 
/>
            </Pressable>

            {/* BUTTON 2: ELLIPSIS (Tiga Titik) */}
            <Pressable 
              onPress={() => setShowContextMenu(true)} 
              // Sama, bikin wadah lingkaran juga
              style={{ 
                width: 43, 
                height: 43, 
                borderRadius: 30, 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            >
              <Ionicons name="ellipsis-vertical" size={21} color={COLORS.icon} />
            </Pressable>
          </Animated.View>

          {/* Context Menu */}
          <ContextMenuFixed
            visible={showContextMenu}
            onClose={() => setShowContextMenu(false)}
            sessionName={currentSession?.name || 'New Chat'}
            position={{ top: insets.top + 65, right: 16 }}
            options={[
              { label: 'Rename', icon: 'pencil-outline', onPress: () => {
                if (currentSession) setRenameModal({ visible: true, session: currentSession });
              }},
              { label: 'Delete', icon: 'trash-outline', danger: true, onPress: () => {
                if (currentSession) setConfirmDelete({ visible: true, session: currentSession });
              }},
            ]}
          />

          {/* Main dimming overlay - tap to close sidebar when sidebar is open */}
          <Reanimated.View 
            style={[styles.pageOverlay, mainOverlayAnimatedStyle]} 
            pointerEvents={sidebarOpen ? 'auto' : 'none'}
          >
            <TouchableWithoutFeedback onPress={closeSidebar}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
          </Reanimated.View>
        </View>
        </Reanimated.View>

      {/* Personalization Modal */}
      <PersonalizationScreen visible={showPersonalization} onClose={closePersonalization} />

      {/* Account Modal */}

      {/* Models List Modal */}
      <SlideUpModal visible={showModels} onClose={closeModels} showBottomGradient autoExpanded>
        {({ dragHandlers }) => (
          <ModelsListScreen onClose={closeModels} dragHandlers={dragHandlers} />
        )}
      </SlideUpModal>

      {/* Rename Modal */}
      <InputModal
        visible={renameModal.visible}
        title="Rename Chat"
        fields={[{ key: 'name', placeholder: 'Chat name', value: renameModal.session?.name || '', required: true }]}
        submitText="Save"
        onSubmit={(values) => {
          if (renameModal.session) renameSession(renameModal.session.id, values.name);
          setRenameModal({ visible: false, session: null });
        }}
        onCancel={() => setRenameModal({ visible: false, session: null })}
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        visible={confirmDelete.visible}
        title="Delete Chat"
        message={`Are you sure you want to delete "${confirmDelete.session?.name}"?`}
        confirmText="Delete"
        danger
        onConfirm={() => {
          if (confirmDelete.session) deleteSession(confirmDelete.session.id);
          setConfirmDelete({ visible: false, session: null });
        }}
        onCancel={() => setConfirmDelete({ visible: false, session: null })}
      />

      {/* Thinking Modal */}
      <SlideUpModal 
        visible={thinkingModal.visible} 
        onClose={closeThinkingModal}
        showBottomGradient
        bottomInset={insets.bottom}
      >
        {({ onScroll, dragHandlers }) => (
          <View style={styles.thinkingModalContainer}>
            <View style={styles.thinkingModalHeader} {...dragHandlers}>
              <Ionicons name="bulb-outline" size={18} color={COLORS.fgMuted} />
              <Text style={styles.thinkingModalTitle}>Thinking Process</Text>
            </View>
            <ScrollView 
              style={styles.thinkingModalScroll}
              contentContainerStyle={styles.thinkingModalContent}
              showsVerticalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              bounces={false}
            >
              <Markdown style={thinkingMarkdownStyles}>
                {thinkingModal.content}
              </Markdown>
            </ScrollView>
          </View>
        )}
      </SlideUpModal>

      {/* Loading overlay - shown until app is ready */}
      {mountLoadingOverlay && (
        <WelcomeOverlay
          message={splashMessage}
          accentColor={COLORS.accent}
          visible={showLoadingOverlay} //
          onFadeComplete={() => setMountLoadingOverlay(false)}
        />
      )}
      </View>
    </GestureDetector>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);

  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <AppProvider>
            <MainApp />
          </AppProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.fgMuted,
    marginTop: 12,
    fontSize: 16,
  },
  pagerContainer: {
    flex: 1,
    flexDirection: 'row',
    width: TOTAL_WIDTH,
  },
  sidebarPage: {
    height: '100%',
    backgroundColor: COLORS.bg,
  },
  sidebarContent: {
    flex: 1,
  },
  mainPage: {
    height: '100%',
    backgroundColor: COLORS.bg,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  floatingMenuBtn: {
    position: 'absolute',
    left: 16,
    width: 45,
    height: 45,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    zIndex: 10,
  },
  floatingLogoBtn: {
    position: 'absolute',
    left: 69,
    width: 105,
    height: 45,
    borderRadius: 50,
    color: COLORS.icon,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    zIndex: 10,
  },
  floatingPencilBtn: {
    position: 'absolute',
    display: 'flex',
    justifyContent: 'space-between',
    flexDirection: 'row',
    right: 16,
    width: 88,
    // paddingHorizontal: 9,
    height: 45,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    zIndex: 10,
  },
  rightSideLogo: {
    color: COLORS.icon,
  },
  sidebarSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    paddingBottom: 40,
    borderTopColor: COLORS.borderLight,
  },
  sidebarSettingsText: {
    color: COLORS.fgMuted,
    fontSize: 16,
    marginLeft: 12,
  },
  sidebarProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    paddingTop: 12,
    paddingBottom: 32,
  },
  sidebarProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  sidebarProfilePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarProfileInfo: {
    marginLeft: 12,
    flex: 1,
  },
  sidebarProfileName: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  sidebarBackupTime: {
    color: COLORS.fgMuted,
    fontSize: 12,
    marginTop: 2,
  },
  pageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 100,
  },
  thinkingModalContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  thinkingModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  thinkingModalTitle: {
    color: COLORS.fg,
    fontSize: 16,
    fontFamily: FONTS.display,
  },
  thinkingModalScroll: {
    flex: 1,
  },
  thinkingModalContent: {
    paddingVertical: 16,
    paddingBottom: 120,
  },
});

// Thinking markdown styles - muted colors
const thinkingMarkdownStyles = {
  body: { color: COLORS.fgMuted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.sans },
  heading1: { color: COLORS.fgMuted, fontSize: 16, fontFamily: FONTS.aiBold, marginVertical: 6 },
  heading2: { color: COLORS.fgMuted, fontSize: 15, fontFamily: FONTS.aiBold, marginVertical: 4 },
  heading3: { color: COLORS.fgMuted, fontSize: 14, fontFamily: FONTS.aiBold, marginVertical: 3 },
  paragraph: { marginVertical: 3 },
  code_inline: { 
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    color: '#7a9fd4',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    fontSize: 12,
    fontFamily: FONTS.mono,
  },
  fence: { 
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 10, 
    borderRadius: 6, 
    marginVertical: 6,
  },
  fenceContent: {
    color: '#8a9199',
    fontSize: 11,
    fontFamily: FONTS.mono,
    lineHeight: 16,
  },
  code_block: { 
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 10, 
    borderRadius: 6, 
    marginVertical: 6,
    color: '#8a9199',
    fontFamily: FONTS.mono,
  },
  link: { color: '#a3c4f3' },
  blockquote: { 
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderLeftWidth: 2, 
    color: COLORS.fgMuted,
    borderLeftColor: COLORS.borderLight, 
    paddingLeft: 10, 
    marginLeft: 0,
    borderRadius: 4,
  },
  list_item: { marginVertical: 2 },
  bullet_list: { marginVertical: 3 },
  ordered_list: { marginVertical: 3 },
  strong: { fontFamily: FONTS.aiBold, fontWeight: 'normal', color: COLORS.fgMuted },
  em: { fontFamily: FONTS.displayItalic, fontStyle: 'normal' },
  hr: { backgroundColor: COLORS.borderLight, height: 1, marginVertical: 8 },
};

// Loading overlay styles (same as ChatScreen's WelcomeScreen)
const loadingOverlayStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  welcomeContainer: {
    alignItems: 'center',
    gap: 0,
    paddingBottom: 45,
  },
  logoContainer: {
    width: 150,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWebView: {
    width: 150,
    height: 150,
    backgroundColor: 'transparent',
  },
  welcomeText: {
    color: COLORS.fg,
    fontSize: 24,
    maxWidth: '80%',
    fontFamily: FONTS.display,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

