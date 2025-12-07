import { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  PanResponder,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import ChatScreen from './src/screens/ChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SessionList from './src/components/SessionList';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.85;

const COLORS = {
  bg: '#1b1c1d',
  bgSecondary: '#282A2C',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  borderLight: '#3c4141',
  accent: '#0e4bae',
  primary: '#D3E3FD',
};

function MainApp() {
  const insets = useSafeAreaInsets();
  const { isReady, sessions, currentSession, messages, selectSession, deleteSession, createSession } = useApp();
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  
  const sidebarAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const settingsAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const settingsOverlayAnim = useRef(new Animated.Value(0)).current;

  const startSidebarDrag = () => {
    if (showSidebar || isDraggingSidebar) return;
    setShowSidebar(true);
    sidebarAnim.setValue(-SIDEBAR_WIDTH);
    overlayAnim.setValue(0);
    setIsDraggingSidebar(true);
  };

  // Swipe right to open sidebar from chat
  const dragToSidebar = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: (_, gs) => {
        if (gs.dx > 0) startSidebarDrag();
      },
      onPanResponderMove: (_, gs) => {
        if (gs.dx <= 0) return;
        if (!showSidebar) startSidebarDrag();
        const progress = Math.min(gs.dx / SIDEBAR_WIDTH, 1);
        sidebarAnim.setValue(Math.min(gs.dx - SIDEBAR_WIDTH, 0));
        overlayAnim.setValue(progress);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SIDEBAR_WIDTH * 0.3 || gs.vx > 0.4) {
          openSidebar();
        } else {
          closeSidebar();
        }
      },
      onPanResponderTerminate: () => {
        if (isDraggingSidebar) closeSidebar();
      },
    })
  ).current;

  const sidebarPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10,
      onPanResponderMove: (_, gs) => {
        if (gs.dx < 0) sidebarAnim.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -80 || gs.vx < -0.5) {
          closeSidebar();
        } else {
          Animated.spring(sidebarAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;
  
  const settingsPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) settingsAnim.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 100 || gs.vy > 0.5) {
          closeSettings();
        } else {
          Animated.spring(settingsAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    })
  ).current;

  const openSidebar = () => {
    setShowSidebar(true);
    Animated.parallel([
      Animated.timing(sidebarAnim, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  const closeSidebar = () => {
    Animated.parallel([
      Animated.timing(sidebarAnim, { toValue: -SIDEBAR_WIDTH, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setShowSidebar(false);
      setIsDraggingSidebar(false);
    });
  };

  const openSettings = () => {
    setShowSettings(true);
    Animated.parallel([
      Animated.spring(settingsAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(settingsOverlayAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  };

  const closeSettings = () => {
    Animated.parallel([
      Animated.timing(settingsAnim, { toValue: SCREEN_HEIGHT, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(settingsOverlayAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setShowSettings(false));
  };

  const handleNewChat = async () => {
    if (currentSession && messages.length === 0) {
      closeSidebar();
      return;
    }
    await createSession();
    closeSidebar();
  };

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} {...dragToSidebar.panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Chat Screen - FULL SCREEN, no header space */}
      <ChatScreen topInset={insets.top} bottomInset={insets.bottom} />

      {/* Floating gradient header - bg to transparent */}
      <LinearGradient
        colors={[COLORS.bg, COLORS.bg, 'transparent']}
        locations={[0, 0.6, 1]}
        style={[styles.floatingHeader, { height: insets.top + 72 }]}
        pointerEvents="none"
      />

      {/* Bottom fade gradient */}
      
      {/* Floating menu button - ABSOLUTE, separate from header */}
      <TouchableOpacity 
        style={[styles.floatingMenuBtn, { top: insets.top + 8 }]} 
        onPress={openSidebar}
        activeOpacity={0.7}
      >
        <Ionicons name="menu" size={22} color={COLORS.fg} />
      </TouchableOpacity>

      {/* Sidebar Overlay */}
      {showSidebar && (
        <TouchableWithoutFeedback onPress={closeSidebar}>
          <Animated.View style={[styles.overlay, { opacity: overlayAnim }]} />
        </TouchableWithoutFeedback>
      )}

      {/* Sidebar */}
      {showSidebar && (
        <Animated.View 
          style={[styles.sidebar, { paddingTop: insets.top, transform: [{ translateX: sidebarAnim }] }]}
          {...sidebarPan.panHandlers}
        >
          <View style={styles.sidebarContent}>
            <SessionList
              sessions={sessions}
              currentSession={currentSession}
              onSelect={(session) => { selectSession(session); closeSidebar(); }}
              onDelete={deleteSession}
              onNew={handleNewChat}
            />
            <TouchableOpacity style={styles.sidebarSettingsBtn} onPress={() => { closeSidebar(); setTimeout(openSettings, 300); }}>
              <Ionicons name="settings-outline" size={20} color={COLORS.fgMuted} />
              <Text style={styles.sidebarSettingsText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Settings Bottom Sheet */}
      {showSettings && (
        <View style={styles.settingsOverlay}>
          <TouchableWithoutFeedback onPress={closeSettings}>
            <Animated.View style={[styles.settingsBackdrop, { opacity: settingsOverlayAnim }]} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.settingsSheet, { transform: [{ translateY: settingsAnim }] }]} {...settingsPan.panHandlers}>
            <View style={styles.settingsHandle} />
            <SettingsScreen onClose={closeSettings} />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <MainApp />
      </AppProvider>
    </SafeAreaProvider>
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
  // Floating gradient header - bg to transparent
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
 
  // Floating menu button - separate from header
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
    backgroundColor: COLORS.bg,
    zIndex: 10,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 15,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: COLORS.bg,
    zIndex: 20,
  },
  sidebarContent: {
    flex: 1,
  },
  sidebarSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  sidebarSettingsText: {
    color: COLORS.fgMuted,
    fontSize: 15,
    marginLeft: 12,
  },
  settingsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  settingsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  settingsSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.9,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  settingsHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
});
