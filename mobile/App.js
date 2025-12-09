import { useState, useRef, useCallback, useEffect } from 'react';
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
  BackHandler,
  Keyboard,
  ScrollView,
} from 'react-native';
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
import { SvgXml } from 'react-native-svg';
import { COLORS } from './src/constants/colors';
import { fontAssets, FONTS } from './src/constants/fonts';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Base sidebar width sits at ~83% of the screen so users can peek the main page
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.80;
// The maximum distance the sidebar can stretch to the right (until it fills the screen)
const SIDEBAR_STRETCH_DISTANCE = SCREEN_WIDTH - SIDEBAR_WIDTH;
const TOTAL_WIDTH = SIDEBAR_WIDTH + SCREEN_WIDTH; // Total scrollable width
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 336.59 72.59"><path fill="#dbdbdbff" d="M64.15,49.65h-2.72s-.01,0-.02.01c-1.82,4.18-3.76,7.52-5.75,9.93-1.85,2.24-4.16,3.95-6.86,5.08-2.73,1.14-6.26,1.73-10.5,1.73-5.9,0-11.12-1.46-15.5-4.34-4.4-2.89-7.78-6.69-10.06-11.29-2.29-4.62-3.45-9.51-3.45-14.54,0-5.71,1.07-10.72,3.19-14.88,2.09-4.12,5.21-7.34,9.26-9.58,4.08-2.25,9.1-3.4,14.91-3.4,5.45,0,10.02,1.11,13.57,3.29,3.66,2.25,6.48,6.11,8.36,11.47,0,0,.01.01.02.01h2.6c.27,0,.53-.11.72-.31.19-.2.29-.46.28-.73l-.63-14.63c-6.44-3.81-14.74-5.74-24.66-5.74-6.84,0-13.14,1.51-18.73,4.5-5.61,2.99-10.09,7.33-13.32,12.88C1.64,24.63,0,31.12,0,38.36c0,6.16,1.47,11.89,4.38,17.03,2.91,5.15,7.25,9.33,12.88,12.41,5.62,3.07,12.4,4.63,20.17,4.63,9.33,0,17.96-1.78,25.65-5.3l2.07-16.36c.04-.28-.05-.57-.24-.79-.19-.22-.46-.34-.75-.34Z"/><path fill="#dbdbdbff" d="M92.38,67.2c-2.87-.34-4.94-.81-6.15-1.39-.52-.25-1.21-.8-1.21-2.62V8.45s.43-7.39.43-7.39c.02-.28-.08-.54-.27-.75-.19-.2-.45-.31-.73-.31h-3.06s0,0,0,0l-11.89,4.97s0,0,0,.01v3.1s0,0,0,0l6.93,1.37v53.72c0,1.82-.69,2.37-1.21,2.62-1.21.58-3.28,1.05-6.15,1.39,0,0-.01,0-.01,0,0,.13,0,4.23,0,4.37,0,0,0,0,.01,0h23.32s.01,0,.01-.01v-4.35s0-.01-.01-.01Z"/><path fill="#dbdbdbff" d="M149.03,64.89l-3.29-.47c-1.62-.22-2.76-.43-3.41-.61-.32-.09-.73-.26-.92-.54-.08-.12-.26-.5-.26-1.55v-27.78s.43-9.1.43-9.1c.01-.27-.09-.54-.28-.74-.19-.2-.45-.31-.72-.31h-1.97s-14.11.92-14.11.92c0,0-.01,0-.01.01v4.7s0,0,0,0l2.53.13c2.99.34,4.23.75,4.74,1.04.52.29.79,1.03.79,2.18v25.92c-2.7,2.39-5.29,4.24-7.67,5.5-1.18.62-2.46,1.01-3.79,1.15-3.75.39-6.48-.29-8.41-2.11-1.55-1.46-2.33-3.75-2.33-6.83v-22.46s.43-9.1.43-9.1c.01-.27-.09-.54-.28-.74-.19-.2-.45-.31-.72-.31h-1.97s-14.02.92-14.02.92c0,0-.01,0-.01.01v4.7s0,.01,0,.01l2.44.13c2.99.34,4.23.75,4.74,1.04.52.29.79,1.03.79,2.18v24.31c0,5.26,1.43,9.18,4.24,11.66,2.78,2.44,6.5,3.68,11.07,3.68,3.64,0,6.85-.84,9.55-2.51,1.96-1.21,3.91-2.75,5.8-4.58l-.3,6.04c-.01.27.08.54.27.74s.45.31.72.31h.69c.07,0,.14,0,.21-.02l15.01-3.26s0,0,0-.01v-4.23s0,0,0-.01Z"/><path fill="#dbdbdbff" d="M173.6,43.73l-6.79-1.1c-2.53-.43-4.41-1.06-5.6-1.87-1.08-.74-1.71-1.92-1.93-3.63-.27-2.08.19-3.67,1.41-4.88,1.28-1.27,3.15-2.07,5.55-2.38,3.18-.41,5.81.06,7.83,1.41,2.18,1.46,3.82,4.16,4.87,8.01,0,0,0,.01.01,0l4.66-.61s0,0,0-.01l-1.64-12.55c-5.09-2.08-10.5-2.77-16.06-2.04-5.94.78-10.3,3.23-12.87,7.26-1.17,1.84-1.79,5.18-1.54,7.35.45,3.88,1.85,6.75,4.16,8.54,2.17,1.68,5.37,2.86,9.5,3.52l6.06,1.02c3.1.59,5.45,1.35,6.99,2.26,1.38.81,2.17,2.16,2.43,4.13.31,2.4-.26,4.23-1.77,5.6-1.59,1.44-3.88,2.36-6.81,2.74-7.05.92-11.82-2.47-14.63-10.38,0,0-.01-.01-.02-.01l-3.36.44c-.27.04-.52.18-.68.4-.16.22-.23.5-.18.77l2.1,11.89c2.11,1.25,4.75,2.14,7.82,2.63,2.85.46,5.97.48,9.26.05,5.24-.68,9.38-2.46,12.29-5.27,3-2.89,4.25-6.42,3.72-10.48s-2.01-6.92-4.46-8.87c-2.37-1.88-5.85-3.21-10.35-3.94Z"/><path fill="#dbdbdbff" d="M220.08,63.92s-.01,0-.02,0c-2.39,1.25-4.83,1.88-7.22,1.88-5.18,0-7.59-2.55-7.59-8.02v-27.43h13.96s.01,0,.01-.01v-5.67s0-.01-.01-.01h-13.96v-9.35s0-.01-.01-.01h-3.21s-.01,0-.01,0c-2.1,2.76-4.01,4.96-5.69,6.53-1.7,1.6-3.81,3.29-6.25,5.02,0,0,0,0,0,.01v3.47s0,.01.01.01h6.67v29.58c0,4.18,1.23,7.35,3.64,9.43,2.37,2.04,5.51,3.08,9.33,3.08,2.45,0,4.7-.48,6.68-1.43,2.21-1.06,3.95-2.4,5.17-3.98l-1.48-3.1Z"/><path fill="#dbdbdbff" d="M253.7,23.79c-2.12,0-4.11.67-5.92,2-1.72,1.26-3.24,2.78-4.51,4.51-.7.96-1.48,2.09-2.31,3.37l.3-8.68c0-.27-.09-.53-.28-.73s-.45-.31-.72-.31h-3.13s-11.83,4.43-11.83,4.43c0,0,0,0,0,0v3.12s0,0,0,.01l6.93,2.23v29.42c0,1.82-.69,2.37-1.21,2.62-1.21.58-3.28,1.05-6.15,1.39,0,0-.01,0-.01.01v4.35s0,.01.01.01h25.05s.01,0,.01-.01v-4.37s0-.01-.01-.01c-3.07-.31-5.26-.61-6.5-.89-.93-.21-1.61-.56-2.01-1.04-.27-.32-.59-1.03-.59-2.58v-21.63c1.89-2.28,3.51-4.04,4.83-5.25,1.31-1.2,2.68-2.05,4.05-2.55,1.39-.5,3.11-.76,5.12-.76h3.68s.01,0,.01-.01v-6.87c-.98-1.21-2.61-1.82-4.82-1.82Z"/><path fill="#dbdbdbff" d="M272.7,17.03c1.71,0,3.17-.57,4.34-1.7,1.18-1.14,1.78-2.58,1.78-4.29s-.6-3.15-1.77-4.32c-1.17-1.16-2.64-1.75-4.35-1.75s-3.17.59-4.31,1.76t0,0c-1.14,1.16-1.72,2.61-1.72,4.31s.58,3.14,1.73,4.28c1.14,1.13,2.59,1.71,4.3,1.71Z"/><path fill="#dbdbdbff" d="M285.05,67.2c-2.87-.34-4.94-.81-6.15-1.39-.52-.25-1.21-.8-1.21-2.62v-28.98s.43-9.19.43-9.19c.01-.27-.09-.54-.28-.74-.19-.2-.45-.31-.72-.31h-3.04s-11.92,4.42-11.92,4.42c0,0,0,0,0,.01v3.13s0,0,0,.01l6.93,2.23v29.42c0,1.83-.69,2.37-1.21,2.62-1.21.58-3.28,1.05-6.15,1.39,0,0-.01,0-.01.01v4.35s0,.01.01.01h23.32s.01,0,.01-.01v-4.35s0-.01-.01-.01Z"/><path fill="#dbdbdbff" d="M336.58,67.32c-1.87-.49-3.43-1.03-4.64-1.6-.95-.45-1.71-1.02-2.25-1.7l-13.96-17.21,12.89-14.66c1.48-1.69,3.73-2.76,6.65-3.15,0,0,.01,0,.01-.01v-4.32s0-.01-.01-.01h-18.63s-.01,0-.01.01v4.29s0,0,0,.01c1.73.34,3.12.66,4.09.95.97.29,1.19.48,1.19.48.03.04.09.18.09.49,0,.15-.07.34-.2.54-.14.22-.47.66-1.29,1.54l-8.32,9.49-7.51-9.39c-1.37-1.64-1.42-2.17-1.42-2.19,0-.32.09-.47.37-.62.32-.17,1.4-.57,4.91-1.33,0,0,0,0,0-.01v-4.28s0-.01-.01-.01h-21.5s-.01,0-.01.01v4.33s0,.01.01.01c2.98.39,5.18,1.46,6.53,3.19,0,0,0,0,.01.01l12.91,15.92-14.1,15.86c-.72.82-1.49,1.43-2.3,1.83-.99.49-2.49.99-4.45,1.5,0,0,0,0,0,.01v4.24s0,.01.01.01h18.63s.01,0,.01-.01v-4.35s0-.01,0-.01c-3.41-.41-4.49-.74-4.83-.89-.24-.11-.36-.24-.36-.63,0-.27.08-.54.25-.81.16-.26.5-.73,1.24-1.53l9.46-10.79,8.79,10.77s.04.05.07.07c.09.09.23.27.42.53.21.29.44.64.69,1.04.16.27.25.51.25.73,0,.4-.13.53-.37.63-.34.15-1.41.48-4.83.89,0,0,0,0,0,.01v4.35s0,.01.01.01h21.5s.01,0,.01-.01v-4.23s0-.01,0-.01Z"/></svg>`;
const PENCIL = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon" aria-hidden="true"><path d="M2.6687 11.333V8.66699C2.6687 7.74455 2.66841 7.01205 2.71655 6.42285C2.76533 5.82612 2.86699 5.31731 3.10425 4.85156L3.25854 4.57617C3.64272 3.94975 4.19392 3.43995 4.85229 3.10449L5.02905 3.02149C5.44666 2.84233 5.90133 2.75849 6.42358 2.71582C7.01272 2.66769 7.74445 2.66797 8.66675 2.66797H9.16675C9.53393 2.66797 9.83165 2.96586 9.83179 3.33301C9.83179 3.70028 9.53402 3.99805 9.16675 3.99805H8.66675C7.7226 3.99805 7.05438 3.99834 6.53198 4.04102C6.14611 4.07254 5.87277 4.12568 5.65601 4.20313L5.45581 4.28906C5.01645 4.51293 4.64872 4.85345 4.39233 5.27149L4.28979 5.45508C4.16388 5.7022 4.08381 6.01663 4.04175 6.53125C3.99906 7.05373 3.99878 7.7226 3.99878 8.66699V11.333C3.99878 12.2774 3.99906 12.9463 4.04175 13.4688C4.08381 13.9833 4.16389 14.2978 4.28979 14.5449L4.39233 14.7285C4.64871 15.1465 5.01648 15.4871 5.45581 15.7109L5.65601 15.7969C5.87276 15.8743 6.14614 15.9265 6.53198 15.958C7.05439 16.0007 7.72256 16.002 8.66675 16.002H11.3337C12.2779 16.002 12.9461 16.0007 13.4685 15.958C13.9829 15.916 14.2976 15.8367 14.5447 15.7109L14.7292 15.6074C15.147 15.3511 15.4879 14.9841 15.7117 14.5449L15.7976 14.3447C15.8751 14.128 15.9272 13.8546 15.9587 13.4688C16.0014 12.9463 16.0017 12.2774 16.0017 11.333V10.833C16.0018 10.466 16.2997 10.1681 16.6667 10.168C17.0339 10.168 17.3316 10.4659 17.3318 10.833V11.333C17.3318 12.2555 17.3331 12.9879 17.2849 13.5771C17.2422 14.0993 17.1584 14.5541 16.9792 14.9717L16.8962 15.1484C16.5609 15.8066 16.0507 16.3571 15.4246 16.7412L15.1492 16.8955C14.6833 17.1329 14.1739 17.2354 13.5769 17.2842C12.9878 17.3323 12.256 17.332 11.3337 17.332H8.66675C7.74446 17.332 7.01271 17.3323 6.42358 17.2842C5.90135 17.2415 5.44665 17.1577 5.02905 16.9785L4.85229 16.8955C4.19396 16.5601 3.64271 16.0502 3.25854 15.4238L3.10425 15.1484C2.86697 14.6827 2.76534 14.1739 2.71655 13.5771C2.66841 12.9879 2.6687 12.2555 2.6687 11.333ZM13.4646 3.11328C14.4201 2.334 15.8288 2.38969 16.7195 3.28027L16.8865 3.46485C17.6141 4.35685 17.6143 5.64423 16.8865 6.53613L16.7195 6.7207L11.6726 11.7686C11.1373 12.3039 10.4624 12.6746 9.72827 12.8408L9.41089 12.8994L7.59351 13.1582C7.38637 13.1877 7.17701 13.1187 7.02905 12.9707C6.88112 12.8227 6.81199 12.6134 6.84155 12.4063L7.10132 10.5898L7.15991 10.2715C7.3262 9.53749 7.69692 8.86241 8.23218 8.32715L13.2791 3.28027L13.4646 3.11328ZM15.7791 4.2207C15.3753 3.81702 14.7366 3.79124 14.3035 4.14453L14.2195 4.2207L9.17261 9.26856C8.81541 9.62578 8.56774 10.0756 8.45679 10.5654L8.41772 10.7773L8.28296 11.7158L9.22241 11.582L9.43433 11.543C9.92426 11.432 10.3749 11.1844 10.7322 10.8271L15.7791 5.78027L15.8552 5.69629C16.185 5.29194 16.1852 4.708 15.8552 4.30371L15.7791 4.2207Z"></path></svg>';

function MainApp() {
  const insets = useSafeAreaInsets();
  const { isReady, sessions, currentSession, messages, selectSession, deleteSession, clearCurrentSession, toggleFavorite, renameSession } = useApp();
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHasQuery, setSidebarHasQuery] = useState(false);
  const [renameModal, setRenameModal] = useState({ visible: false, session: null });
  const [confirmDelete, setConfirmDelete] = useState({ visible: false, session: null });
  const [sidebarContextMenuOpen, setSidebarContextMenuOpen] = useState(false);
  const [thinkingModal, setThinkingModal] = useState({ visible: false, content: '' });
  // Track if any modal is open (for blocking pager swipe)
  const isModalOpen = useRef(false);
  // Fade animation for right buttons container
  const rightBtnOpacity = useRef(new Animated.Value(0)).current;
  const showRightBtns = currentSession && messages.length > 0;

  // Fade in/out right buttons when session changes
  useEffect(() => {
    Animated.timing(rightBtnOpacity, {
      toValue: showRightBtns ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [showRightBtns, rightBtnOpacity]);

  // Keep modal open ref in sync
  useEffect(() => {
    isModalOpen.current = showContextMenu || showModels || showPersonalization || renameModal.visible || confirmDelete.visible || sidebarContextMenuOpen || thinkingModal.visible;
  }, [showContextMenu, showModels, showPersonalization, renameModal.visible, confirmDelete.visible, sidebarContextMenuOpen, thinkingModal.visible]);

  // Horizontal pager - start at main screen (offset = SIDEBAR_WIDTH)
  // Pager offset controls the horizontal snap between sidebar (0) and main (SIDEBAR_WIDTH)
  const scrollX = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  // Stretch value expands the sidebar to the right after it snaps to the left edge
  const sidebarStretch = useRef(new Animated.Value(0)).current;
  const currentPage = useRef(1); // 0 = sidebar, 1 = main
  const lastDragPosition = useRef(SIDEBAR_WIDTH); // Track where the pager is during a gesture
  
  // Overlay opacity interpolations
  // scrollX: 0 (sidebar) -> SIDEBAR_WIDTH (main)
  // Sidebar overlay: 0 -> 0.5 (dimmed when on main)
  // Main overlay: 0.5 -> 0 (dimmed when on sidebar)
  const sidebarOverlayOpacity = scrollX.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0, 0.5],
    extrapolate: 'clamp',
  });
  const mainOverlayOpacity = scrollX.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [0.5, 0],
    extrapolate: 'clamp',
  });
  
  


  // Horizontal pager pan responder
  const pagerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        // Block swipe when any modal is open
        if (isModalOpen.current) return false;
        // Only respond to horizontal swipes
        return Math.abs(gs.dx) > 15 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5;
      },
      onPanResponderGrant: () => {
        scrollX.stopAnimation();
      },
      onPanResponderMove: (_, gs) => {
        // Calculate new position based on drag
        const baseOffset = currentPage.current === 0 ? 0 : SIDEBAR_WIDTH;
        const proposedOffset = baseOffset - gs.dx;

        // Once the sidebar snaps left (offset = 0), additional right drag stretches the width instead of moving further left.
        if (proposedOffset < 0) {
          scrollX.setValue(0);
          const stretchDistance = Math.min(SIDEBAR_STRETCH_DISTANCE, -proposedOffset);
          sidebarStretch.setValue(stretchDistance);
          lastDragPosition.current = 0;
        } else {
          const clamped = Math.max(0, Math.min(SIDEBAR_WIDTH, proposedOffset));
          scrollX.setValue(clamped);
          sidebarStretch.setValue(0);
          lastDragPosition.current = clamped;
        }
      },
      onPanResponderRelease: (_, gs) => {
        const currentOffset = lastDragPosition.current;

        // Determine target based on velocity and position
        let targetPage;
        if (Math.abs(gs.vx) > 0.5) {
          // Fast swipe - use velocity direction
          targetPage = gs.vx > 0 ? 0 : 1;
        } else {
          // Slow swipe - snap to nearest
          const midpoint = SIDEBAR_WIDTH / 2;
          targetPage = currentOffset < midpoint ? 0 : 1;
        }

        currentPage.current = targetPage;

        const stretchTarget = targetPage === 0 && sidebarHasQuery ? SIDEBAR_STRETCH_DISTANCE : 0;

        Animated.parallel([
          Animated.spring(scrollX, {
            toValue: targetPage === 0 ? 0 : SIDEBAR_WIDTH,
            useNativeDriver: true,
            tension: 135,
            friction: 19,
          }),
          Animated.spring(sidebarStretch, {
            toValue: stretchTarget,
            useNativeDriver: false,
            tension: 135,
            friction: 19,
          }),
        ]).start(() => {
          // Sync state after animation completes
          setSidebarOpen(targetPage === 0);
          lastDragPosition.current = targetPage === 0 ? 0 : SIDEBAR_WIDTH;
        });
      },
    })
  ).current;

  // Sidebar width = base width + live stretch (only grows when snapped on the left)
  const sidebarWidth = Animated.add(SIDEBAR_WIDTH, sidebarStretch);

  const openSidebar = useCallback(() => {
    Keyboard.dismiss();
    currentPage.current = 0;
    setSidebarOpen(true);
    Animated.parallel([
      Animated.spring(scrollX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 135,
        friction: 19,
      }),
      Animated.spring(sidebarStretch, {
        toValue: sidebarHasQuery ? SIDEBAR_STRETCH_DISTANCE : 0,
        useNativeDriver: false,
        tension: 135,
        friction: 19,
      }),
    ]).start(() => {
      lastDragPosition.current = 0;
    });
  }, [scrollX, sidebarHasQuery, sidebarStretch]);

  const closeSidebar = useCallback(() => {
    Keyboard.dismiss();
    currentPage.current = 1;
    setSidebarOpen(false);
    Animated.parallel([
      Animated.spring(scrollX, {
        toValue: SIDEBAR_WIDTH,
        useNativeDriver: true,
        tension: 135,
        friction: 19,
      }),
      Animated.spring(sidebarStretch, {
        toValue: 0,
        useNativeDriver: false,
        tension: 135,
        friction: 19,
      }),
    ]).start(() => {
      lastDragPosition.current = SIDEBAR_WIDTH;
    });
  }, [scrollX, sidebarStretch]);

  // Smoothly adjust sidebar extent when search text toggles a full-width request
  useEffect(() => {
    if (!sidebarOpen) return;
    Animated.spring(sidebarStretch, {
      toValue: sidebarHasQuery ? SIDEBAR_STRETCH_DISTANCE : 0,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start();
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

  const handleNewChat = useCallback(() => {
    if (!currentSession || messages.length === 0) {
      clearCurrentSession();
      closeSidebar();
      return;
    }
    clearCurrentSession();
    closeSidebar();
  }, [currentSession, messages, clearCurrentSession, closeSidebar]);

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
    <View style={styles.container} {...pagerPanResponder.panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Horizontal Pager Container */}
      <Animated.View 
        style={[
          styles.pagerContainer,
          { transform: [{ translateX: Animated.multiply(scrollX, -1) }] }
        ]}
      >
        {/* Page 1: Sidebar (80% base width, stretches to 100% when pulled) */}
        <Animated.View style={[styles.sidebarPage, { width: sidebarWidth, paddingTop: insets.top }]}>
          <View style={styles.sidebarContent}>
            <SessionList
              sessions={sessions}
              currentSession={currentSession}
              onSelect={(session) => { selectSession(session); closeSidebar(); }}
              onDelete={deleteSession}
              onNew={handleNewChat}
              onToggleFavorite={toggleFavorite}
              onRename={renameSession}
              onSearchQueryChange={setSidebarHasQuery}
              onContextMenuChange={setSidebarContextMenuOpen}
            />
            <TouchableOpacity style={styles.sidebarSettingsBtn} onPress={openPersonalization}>
              <Ionicons name="options-outline" size={20} color={COLORS.fgMuted} />
              <Text style={styles.sidebarSettingsText}>Personalization</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Page 2: Main Chat (100% width) */}
        <View style={[styles.mainPage, { width: SCREEN_WIDTH }]}>
          <ChatScreen topInset={insets.top} onShowThinking={handleShowThinking} onStreamingThinking={handleStreamingThinking} />

          <LinearGradient
            colors={[COLORS.bg90, COLORS.bg90, COLORS.bg70, 'transparent']}
            locations={[0, 0.5, 0.8, 1]}
            style={[styles.floatingHeader, { height: insets.top + 75 }]}
            pointerEvents="none"
          />

          <TouchableOpacity 
            style={[styles.floatingMenuBtn, { top: insets.top + 11 }]} 
            onPress={openSidebar}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={22} color={COLORS.icon} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.floatingLogoBtn, { top: insets.top + 11 }]}
            onPress={() => setTimeout(openModels, 10)}
            activeOpacity={0.7}
          >
            <View style={styles.logo}>
              <SvgXml xml={LOGO_SVG} width={70} height={30}/>
            </View>
          </TouchableOpacity>

          <Animated.View 
            style={[styles.floatingPencilBtn, { top: insets.top + 11, opacity: rightBtnOpacity }]}
            pointerEvents={showRightBtns ? 'auto' : 'none'}
          >
            <TouchableOpacity onPress={handleNewChat} activeOpacity={0.7}>
              <SvgXml xml={PENCIL} style={styles.rightSideLogo} width={23} height={23} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowContextMenu(true)} activeOpacity={0.7}>
              <Ionicons name="ellipsis-vertical" size={21} color={COLORS.icon} />
            </TouchableOpacity>
          </Animated.View>

          {/* Context Menu */}
          <ContextMenuFixed
            visible={showContextMenu}
            onClose={() => setShowContextMenu(false)}
            sessionName={currentSession?.name || 'New Chat'}
            position={{ top: insets.top + 25, right: 16 }}
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
          <Animated.View 
            style={[styles.pageOverlay, { opacity: mainOverlayOpacity }]} 
            pointerEvents={sidebarOpen ? 'auto' : 'none'}
          >
            <TouchableWithoutFeedback onPress={closeSidebar}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
          </Animated.View>
        </View>
      </Animated.View>

      {/* Personalization Modal */}
      <PersonalizationScreen visible={showPersonalization} onClose={closePersonalization} />

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
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

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
    left: 68,
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
    width: 85,
    paddingHorizontal: 9,
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
