import { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Platform,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  PanResponder,
  Easing,
  KeyboardAvoidingView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { AppProvider, useApp } from './src/context/AppContext';
import ChatScreen from './src/screens/ChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SessionList from './src/components/SessionList';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STATUSBAR_HEIGHT = Platform.OS === 'android' ? Constants.statusBarHeight : 0;
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
  const { isReady, sessions, currentSession, messages, selectSession, deleteSession, createSession } = useApp();
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const sidebarAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const settingsAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const settingsOverlayAnim = useRef(new Animated.Value(0)).current;

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
          Animated.spring(sidebarAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }).start();
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
          Animated.spring(settingsAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }).start();
        }
      },
    })
  ).current;

  const openSidebar = () => {
    setShowSidebar(true);
    Animated.parallel([
      Animated.timing(sidebarAnim, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSidebar = () => {
    Animated.parallel([
      Animated.timing(sidebarAnim, {
        toValue: -SIDEBAR_WIDTH,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setShowSidebar(false));
  };

  const openSettings = () => {
    setShowSettings(true);
    Animated.parallel([
      Animated.spring(settingsAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(settingsOverlayAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSettings = () => {
    Animated.parallel([
      Animated.timing(settingsAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(settingsOverlayAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => setShowSettings(false));
  };

  // Handle new chat - don't create if current session is empty
  const handleNewChat = async () => {
    // If current session exists and has no messages, just close sidebar
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
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Status bar spacer */}
      <View style={styles.statusBarSpacer} />
      
      {/* Header - part of flex layout, not absolute */}
      <View style={styles.header}>
        <TouchableOpacity onPress={openSidebar} style={styles.menuBtn}>
          <Ionicons name="menu" size={22} color={COLORS.fg} />
        </TouchableOpacity>
      </View>

      {/* Chat Screen - takes remaining flex space */}
      <ChatScreen />

      {/* Sidebar Overlay */}
      {showSidebar && (
        <TouchableWithoutFeedback onPress={closeSidebar}>
          <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          </Animated.View>
        </TouchableWithoutFeedback>
      )}

      {/* Sidebar */}
      {showSidebar && (
        <Animated.View 
          style={[styles.sidebar, { transform: [{ translateX: sidebarAnim }] }]}
          {...sidebarPan.panHandlers}
        >
          <View style={styles.sidebarContent}>
            <SessionList
              sessions={sessions}
              currentSession={currentSession}
              onSelect={(session) => {
                selectSession(session);
                closeSidebar();
              }}
              onDelete={deleteSession}
              onNew={handleNewChat}
            />
            
            <TouchableOpacity style={styles.sidebarSettingsBtn} onPress={() => {
              closeSidebar();
              setTimeout(openSettings, 300);
            }}>
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
            <Animated.View style={[styles.settingsBackdrop, { opacity: settingsOverlayAnim }]}>
              <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            </Animated.View>
          </TouchableWithoutFeedback>
          
          <Animated.View 
            style={[styles.settingsSheet, { transform: [{ translateY: settingsAnim }] }]}
            {...settingsPan.panHandlers}
          >
            <View style={styles.settingsHandle} />
            <SettingsScreen onClose={closeSettings} />
          </Animated.View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  statusBarSpacer: {
    height: STATUSBAR_HEIGHT,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.bg,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: COLORS.bgSecondary,
    zIndex: 20,
    paddingTop: STATUSBAR_HEIGHT,
  },
  sidebarContent: {
    flex: 1,
  },
  sidebarSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
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
